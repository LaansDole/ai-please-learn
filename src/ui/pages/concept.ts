import { listEnvs } from '../../env/registry';
import { iterationLabel } from '../../learner/types';
import { h } from '../dom';
import { createPlayPanel } from '../panels/play';
import { createLearnPanel } from '../panels/learn';
import { createNetworkPanel } from '../panels/network';
import { createRewardPanel } from '../panels/rewards';
import { createStage } from '../panels/stage';
import { formatRoute, type PageFn, type Step } from '../router';
import { openSession, type Session } from '../session';

const STEPS: [Step, string][] = [[1, 'Play'], [2, 'Rewards'], [3, 'Network'], [4, 'Learn']];
interface StepView { side: HTMLElement; lower?: HTMLElement; dispose(): void }

function buildStep(step: Step, session: Session): StepView {
  if (step === 1) {
    const p = createPlayPanel(session);
    return { side: p.el, dispose: () => { p.dispose(); session.backToLive(); } };   // sends stage/stop
  }
  if (step === 2) { const p = createRewardPanel(session); return { side: p.el, dispose: p.dispose }; }
  const net = createNetworkPanel(session, { live: step === 4 });
  if (step === 3) return { side: net.el, dispose: net.dispose };
  const learn = createLearnPanel(session);
  return { side: net.el, lower: learn.lower, dispose: () => { net.dispose(); learn.dispose(); } };
}

export const conceptPage: PageFn = (root, route) => {
  if (route.page !== 'concept') return;
  const def = listEnvs().find((d) => d.meta.id === route.envId);
  if (!def) {
    root.append(h('main', { class: 'page gallery' }, h('h1', null, 'Unknown concept'), h('p', null, h('a', { href: '#/' }, 'Back to the gallery'))));
    return;
  }
  let step = route.step, session: Session | null = null, gone = false;
  const views = new Map<Step, StepView>();
  const stage = createStage();
  const banner = h('div', { class: 'error-banner', testid: 'error-banner', role: 'alert', hidden: true });
  const side = h('div', { class: 'side' }), lower = h('div', { class: 'lower' });
  const buttons = STEPS.map(([n, label]) => h('button', {
    class: 'step', testid: `step-${n}`, onclick: () => { location.hash = formatRoute({ page: 'concept', envId: def.meta.id, step: n }); },
  }, h('span', { class: 'step-mark', 'aria-hidden': 'true' }), `${n} ${label}`));
  root.append(h('div', { class: 'page' },
    h('header', { class: 'topbar' },
      h('div', { class: 'crumb' }, h('a', { class: 'brand', href: '#/' }, 'EvoLab'), h('span', { class: 'sep' }, '/'), h('span', { class: 'here' }, def.meta.name)),
      h('nav', { class: 'stepper', 'aria-label': 'Steps' }, ...buttons),
      h('a', { class: 'btn', href: '#/settings', testid: 'nav-settings' }, 'Settings')),
    banner,
    h('main', { class: 'concept' }, h('div', { class: 'cols' }, stage.el, side), lower)));

  const fail = (message: string) => { banner.textContent = message; banner.hidden = false; };
  const syncStage = () => {
    if (!session) return;
    const v = session.viewing, label = iterationLabel(session.run?.learner.kind ?? session.spec.meta.learners[0]!).toLowerCase();
    stage.setMode(v.kind);
    stage.setHeader(
      v.kind === 'play' ? 'You are playing'
        : v.kind === 'replay' ? (v.iteration === 'imported' ? 'Replay: imported champion' : `Replay: ${label} ${v.iteration} champion`)
          : session.autoReplay !== null ? `Replay: ${label} ${session.autoReplay} champion`
            : session.state === 'paused' ? 'Paused'
              : session.state === 'running' ? `Live: ${label} ${session.history.length + 1}` : 'No run yet');
  };
  const showStep = () => {
    buttons.forEach((b, i) => { if (i + 1 === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    if (!session) return;
    // The play panel owns window key listeners and the stage worker, so it lives only while step 1 is open; the others keep their state.
    const play = views.get(1);
    if (play && step !== 1) { play.dispose(); play.side.remove(); views.delete(1); }
    if (!views.has(step)) {
      const v = buildStep(step, session);
      views.set(step, v); side.append(v.side);
      if (v.lower) lower.append(v.lower);
    }
    for (const [n, v] of views) { v.side.hidden = n !== step; if (v.lower) v.lower.hidden = n !== step; }
    syncStage();
  };
  showStep();

  openSession({ kind: 'builtin', id: def.meta.id }).then((s) => {
    if (gone) { s.dispose(); return; }
    session = s;
    s.on('frame', (m) => stage.show(m.frame));
    s.on('error', (m) => fail(m.message));
    s.onChange(syncStage);
    showStep();
  }, (e: unknown) => fail(e instanceof Error ? e.message : String(e)));

  return Object.assign(() => {
    gone = true;
    for (const v of views.values()) v.dispose();
    session?.dispose();
  }, { onStep(next: Step) { step = next; showStep(); } });
};
