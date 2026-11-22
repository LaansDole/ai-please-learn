import { listEnvs } from '../../env/registry';
import { library, type StoredConcept } from '../../gen/library';
import { iterationLabel } from '../../learner/types';
import { resolveConfig } from '../../learner/config';
import { loadRunPrefs, type RunPrefs } from '../../persist/storage';
import { h, notFound, topNav } from '../dom';
import { createPlayPanel } from '../panels/play';
import { createLearnPanel } from '../panels/learn';
import { createNetworkPanel } from '../panels/network';
import { createRewardPanel } from '../panels/rewards';
import { createStage } from '../panels/stage';
import { showSource } from '../panels/sourceModal';
import { formatRoute, navigate, type PageFn, type Step } from '../router';
import { openSession, type Session } from '../session';
import type { EnvRef } from '../../trainer/protocol';

const STEPS: [Step, string][] = [[1, 'Play'], [2, 'Rewards'], [3, 'Network'], [4, 'Learn']];
/** Learn adds a header above the columns (`upper`), a column before the stage (`tower`) and run controls under the stage (`controls`). */
interface StepView { side: HTMLElement; lower?: HTMLElement; upper?: HTMLElement; tower?: HTMLElement; controls?: HTMLElement; refresh?(): void; dispose(): void }
/** Shared by steps 3 and 4: the method picker edits `prefs`, the Learn step starts runs from them. */
interface RunControl { prefs: RunPrefs; start(): void }

function buildStep(step: Step, session: Session, run: RunControl): StepView {
  if (step === 1) {
    const p = createPlayPanel(session);
    return { side: p.el, dispose: () => { p.dispose(); session.backToLive(); } };   // sends stage/stop
  }
  if (step === 2) { const p = createRewardPanel(session); return { side: p.el, dispose: p.dispose }; }
  const net = createNetworkPanel(session, run.prefs, { live: step === 4, restart: () => { session.stop(); run.start(); } });
  if (step === 3) return { side: net.el, refresh: net.refresh, dispose: net.dispose };
  const learn = createLearnPanel(session, run.prefs, run.start);
  return { side: net.el, lower: learn.lower, upper: learn.upper, tower: learn.tower, controls: learn.controls, refresh: () => { net.refresh(); learn.refresh(); }, dispose: () => { net.dispose(); learn.dispose(); } };
}

type Unmount = (() => void) & { onStep(step: Step): void };

const unknownConcept = (root: HTMLElement) => notFound(root, 'This concept does not exist',
  'It may have been deleted, or it was generated in another browser. Generated concepts live only in the browser that made them.');

export const conceptPage: PageFn = (root, route) => {
  if (route.page !== 'concept') return;
  const id = route.envId;
  if (!id.startsWith('gen-')) {
    const def = listEnvs().find((d) => d.meta.id === id);
    if (!def) return unknownConcept(root);
    return mount(root, def.meta.name, { kind: 'builtin', id }, route.step);
  }
  // Generated concepts live in IndexedDB, so the page mounts once the record has loaded.
  let step = route.step, gone = false, inner: Unmount | null = null;
  library.get(id).then((c) => {
    if (gone) return;
    if (!c) unknownConcept(root);
    else inner = mount(root, c.name, { kind: 'generated', id, source: c.source, meta: c.meta }, step, c);
  }, () => { if (!gone) unknownConcept(root); });
  return Object.assign(() => { gone = true; inner?.(); }, { onStep(next: Step) { step = next; inner?.onStep(next); } });
};

function mount(root: HTMLElement, name: string, ref: EnvRef, firstStep: Step, concept?: StoredConcept): Unmount {
  let step = firstStep, session: Session | null = null, run: RunControl | null = null, gone = false;
  const views = new Map<Step, StepView>();
  const stage = createStage();
  const banner = h('div', { class: 'error-banner', testid: 'error-banner', role: 'alert', hidden: true });
  const NEXT: Partial<Record<Step, string>> = { 1: 'Continue: set the rewards', 2: 'Continue: choose how it learns', 3: 'Continue: watch it learn' };
  const next = h('a', { class: 'btn btn-primary', testid: 'step-next' });
  const stepNav = h('div', { class: 'step-nav' }, next);
  const side = h('div', { class: 'side' }, stepNav), lower = h('div', { class: 'lower' });
  const stageCol = h('div', { class: 'stage-col' }, stage.el), cols = h('div', { class: 'cols' }, stageCol, side);
  const main = h('main', { class: 'concept' }, cols, lower);
  const buttons = STEPS.map(([n, label]) => h('button', {
    class: 'step', testid: `step-${n}`, onclick: () => navigate(formatRoute({ page: 'concept', envId: ref.id, step: n })),
  }, h('span', { class: 'step-num num', 'aria-hidden': 'true' }, String(n)), h('span', { class: 'step-label' }, label)));
  root.append(h('div', { class: 'page' },
    h('header', { class: 'topbar' },
      h('div', { class: 'crumb' }, h('a', { class: 'brand', href: formatRoute({ page: 'gallery' }) }, 'EvoLab'), h('span', { class: 'sep' }, '/'), h('span', { class: 'here' }, name),
        concept && h('span', { class: 'badge badge-gen', testid: 'badge-generated' }, 'generated')),
      h('nav', { class: 'stepper', 'aria-label': 'Steps' }, h('ol', null, ...buttons.map((b) => h('li', null, b)))),
      concept && h('button', { type: 'button', testid: 'view-source', onclick: () => showSource(concept) }, 'View source'),
      topNav()),
    banner,
    main));

  const fail = (message: string) => { banner.textContent = message; banner.hidden = false; };
  const syncStage = () => {
    if (!session) return;
    const v = session.viewing, label = iterationLabel(session.run?.learner.kind ?? session.spec.meta.learners[0]!).toLowerCase();
    stage.setMode(v.kind);
    // What the status dot in the stage bar shows; follows the header text below, not the raw mode (MAX replays champions while live).
    stage.el.dataset.status = v.kind === 'play' ? 'play' : v.kind === 'replay' || session.autoReplay !== null ? 'replay'
      : session.state === 'running' ? 'live' : session.state;
    stage.setHeader(
      v.kind === 'play' ? 'You are playing'
        : v.kind === 'replay' ? (v.iteration === 'imported' ? 'Replay: imported champion' : `Replay: ${label} ${v.iteration} champion`)
          : session.autoReplay !== null ? `Replay: ${label} ${session.autoReplay} champion`
            : session.state === 'paused' ? 'Paused'
              : session.state === 'running' ? `Live: ${label} ${session.history.length + 1}` : 'No run yet');
  };
  const showStep = () => {
    buttons.forEach((b, i) => {
      if (i + 1 === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.dataset.state = i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo';
    });
    main.dataset.step = String(step);
    stepNav.hidden = !session || step === 4;
    if (step < 4) { next.href = formatRoute({ page: 'concept', envId: ref.id, step: (step + 1) as Step }); next.textContent = NEXT[step]!; }
    if (!session) return;
    // The play panel owns window key listeners and the stage worker, so it lives only while step 1 is open; the others keep their state.
    const play = views.get(1);
    if (play && step !== 1) { play.dispose(); play.side.remove(); views.delete(1); }
    if (!views.has(step)) {
      const v = buildStep(step, session, run!);
      views.set(step, v); side.insertBefore(v.side, stepNav);
      if (v.lower) lower.append(v.lower);
      if (v.upper) main.prepend(v.upper);
      if (v.tower) cols.prepend(v.tower);
      if (v.controls) stageCol.append(v.controls);
    }
    for (const [n, v] of views) for (const el of [v.side, v.lower, v.upper, v.tower, v.controls]) if (el) el.hidden = n !== step;
    views.get(step)?.refresh?.();
    syncStage();
  };
  showStep();

  openSession(ref).then((s) => {
    if (gone) { s.dispose(); return; }
    session = s;
    const prefs = loadRunPrefs(s.spec);
    run = { prefs, start: () => { s.start(resolveConfig(prefs.learner, s.spec, { populationSize: prefs.population }), prefs.seed); s.setSpeed(prefs.speed); } };
    s.on('frame', (m) => stage.show(m.frame));
    s.on('error', (m) => fail(m.message));
    s.onChange(syncStage);
    showStep();
  }, (e: unknown) => fail(e instanceof Error ? e.message : String(e)));

  return Object.assign(() => {
    gone = true;
    for (const v of views.values()) v.dispose();
    session?.dispose();
    stage.dispose();
  }, { onStep(next: Step) { step = next; showStep(); } });
}
