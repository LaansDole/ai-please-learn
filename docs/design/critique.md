# EvoLab UI critique (impeccable: critique + audit)

⚠️ DEGRADED: single-context (the dispatch brief specifies one agent; assessments A and B were run in sequence in one context, A written down before the detector ran)

Scope: every screen at 1440x900, 1280x800 and 390x844, captured from the dev server after a short MAX run so charts are populated. Screenshots of the state reviewed are in [`before/`](before/); the 1440 set under `docs/screenshots/` at commit `047a286` is the rest of the "before" record.

Mode: **Operate** for the concept pages and settings (a tool: scanability and precision outrank expression), **Experience** for the gallery (a showcase: the artefact should lead). The visual world is fixed by the design spec, section 11: a dark instrument panel, 1 px rules, monospaced numerals, one teal accent, no webfonts. This pass refines inside that world; it does not replace it.

## Design health (Nielsen)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Live / replay / paused is one line of 13 px mono; a new generation changes a number and nothing else |
| 2 | Match system / real world | 2 | "Fitness", "species", "epsilon", "TD", "Q-values" appear on the Learn step with no plain-language gloss |
| 3 | User control and freedom | 3 | Pause, step, restart, back-to-live, Esc on the modal all exist |
| 4 | Consistency and standards | 3 | Raw-JSON and paste textareas render in the UI face while every other code field is mono |
| 5 | Error prevention | 3 | Delete confirms; inputs clamp; invalid JSON is rejected without losing the text |
| 6 | Recognition rather than recall | 2 | Four steps look like tabs, nothing says what comes next; keyboard shortcuts live only in `title` tooltips |
| 7 | Flexibility and efficiency | 3 | Space, `.`, `[`, `]` work but are undiscoverable |
| 8 | Aesthetic and minimalist design | 2 | Flat hierarchy: every panel, label and number carries the same weight; the gallery opens on a form |
| 9 | Error recovery | 3 | Validator errors are specific and keep the pasted text; unknown-concept page is a bare line |
| 10 | Help and documentation | 2 | Method explainers are good; charts, stats and rewards have none |
| **Total** | | **26/40** | **Acceptable: solid foundation, weak first impression and weak explanation** |

## Audit health (technical)

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Text contrast passes AA everywhere measured (muted 4.86-5.56:1, text 14.5:1). Form-control boundaries do not: `--line` on `--panel` is 1.29:1, inputs are told apart only by a 1.07:1 fill (WCAG 1.4.11 wants 3:1). Placeholder colour is the browser default |
| 2 | Performance | 4 | Every canvas repaints through one coalesced `requestAnimationFrame`; nothing animates layout |
| 3 | Theming | 3 | Tokens used throughout; three hard-coded colours (`#06231c`, `#2b1d00`, `#0d121b`) and no type or spacing scale: 11/12/13/14/15/16/18/20/30 px are written ad hoc |
| 4 | Responsive | 2 | Usable at 390 px but rough: the stepper wraps into four stacked rows (150 px of header), the reward-term table wraps its description one word per line, touch targets are 26-30 px |
| 5 | Implementation integrity | 3 | `impeccable detect --json src index.html` returned no findings (the DOM is built in TypeScript, so the detector only sees `index.html`); manual review found the textarea font regression above and nothing decorative or templated |
| **Total** | | **15/20** | **Good** |

## Design specificity verdict

The concept page is authored for this product: the stage beside the network, edges that are solid-teal or dashed-red by sign, species drawn as a stacked area, a hall of fame of replayable champions. No other product could reuse it unchanged. The gallery is the opposite: a title reading "Concepts", a grid of equal cards and a dashed form in the first cell is the generic dashboard index the brief asks to avoid. The product's whole promise (watch a network go from flailing to competent) is a 14 px muted line in the top bar.

## What is working

- **The NN graph.** Sign is carried by hue and dash, strength by width, activation by glow, and new neurons animate in with a caption. It already explains learning without words.
- **Honest density.** Stats strip, speed ladder and charts fit one screen at 1440 without scrolling the stage away; numerals are tabular mono.
- **States exist.** Disabled methods say why, validator errors are concrete, reduced motion is honoured, focus rings are visible.

## Priority issues

**[P1] 1. The gallery has no thesis and leads with a form.**
The first thing on the showcase is "Concepts" at 20 px and a dashed "New concept" box; on a phone that form is most of the first viewport and the games start below the fold. At 1440 px the grid leaves a ragged third row and the new-concept cell stretches into empty space. *Fix:* a headline that states the promise, a one-sentence lede, the four-step journey shown once, built-ins as a clean 3 x 2 grid, and "make your own" moved below as its own section with the generated cards. (`layout`, `typeset`, `clarify`)

**[P1] 2. The Learn step shows learning but never says what you are looking at.**
Seven panels with noun-only titles (FITNESS, SPECIES, OUTPUT ACTIVATIONS, LOSS, EXPLORATION). A first-time viewer of the demo video cannot tell which line should go up, what a band is, or why epsilon falls. The idle state is three "No data yet" / "No run yet" strings and a row of dashes. A new generation, the product's heartbeat, is a digit changing. *Fix:* one plain sentence under every chart title, worded per learning method; an idle hint that says what Start will do; the stage header as a status readout with a live dot; the generation and best cells flash when they change. (`clarify`, `animate`)

**[P1] 3. The four steps are a journey drawn as tabs.**
Steps 1-3 end in a dead end: nothing on the Play, Rewards or Network panels says "next". The stepper has no sense of order or progress. *Fix:* draw the stepper as a numbered sequence with the done / current / upcoming distinction carried by mark and weight, and give steps 1-3 a "Continue to ..." primary action at the foot of the panel. (`layout`, `clarify`)

**[P1] 4. Mobile is usable but visibly an afterthought.**
Stepper stacks into four rows; the reward-term table's "What it counts" column is 60 px wide; buttons are 30 px tall, card actions 26 px; the speed bar wraps into four uneven rows; the gallery tagline wraps into the top bar. *Fix:* stepper becomes one full-width four-segment row, the term description moves under the term name below 560 px, 44 px targets on coarse pointers, the speed bar becomes a labelled grid. (`adapt`)

**[P2] 5. Type has no scale and the hierarchy is flat.**
Nine font sizes within 9 px of each other; h1 is 20 px, card titles 15 px, body 14 px, so heading and body differ by weight alone. Chart axes are 10 px. The two code textareas lost their mono face to a later `font: inherit` rule. *Fix:* a named six-step scale in tokens, a real display size for the gallery headline, 11 px chart text, balanced headings, a 70ch measure for explanatory copy, mono restored on textareas. (`typeset`)

**[P2] 6. Control boundaries and remaining browser defaults.**
Inputs, selects, checkboxes and the range track are bounded by a 1.29:1 line. Placeholder colour, the range thumb and the number-input spinners are untouched browser surfaces. Three hex colours bypass the tokens. *Fix:* a `--line-strong` token at 3:1 for form-control borders, themed placeholder and range, tokens for the three strays. (`colorize`, `harden`)

**[P3] 7. Edges.** The unknown-concept page drops the top bar; the settings page has no way back except the wordmark; the source modal's Close scrolls away on a long module.

## Persona red flags

- **Jordan (first-timer, arrives from the demo video):** lands on "Concepts" and a text box asking them to "Describe something to learn" before seeing a single game. On Learn, reads SPECIES (SHARE OF POPULATION) and has no idea what a species is. Finishes playing Pong and does not know the next step is Rewards.
- **Casey (phone):** 150 px of stacked step buttons before the game; 26 px Delete next to 26 px Export on a generated card; the term table is unreadable.
- **Sam (keyboard, low vision):** can reach everything and sees a focus ring, but cannot find the edge of the seed and population inputs, and never learns that Space pauses.

## Minor observations

- Number inputs follow the browser locale ("0,2") while the JSON beside them shows "0.2". Left alone: it is the platform's behaviour.
- DQN labels hall-of-fame chips "g41" although its iterations are called rounds.
- For DQN, best, mean and median are the same value per round, so four direct labels stack at the right edge of the fitness chart.

## Questions skipped

Questions skipped: this run is an unattended dispatch whose brief fixes scope ("every screen"), priority order and constraints (no behaviour change, no webfonts, spec section 11 tokens), so all seven issues are addressed in priority order.

## Resolution

What the polish pass changed for each issue. "Before" images are in `docs/design/before/` (and `docs/screenshots/` at commit `047a286`); "after" images are the current `docs/screenshots/`.

| # | Issue | What changed | Before | After |
|---|-------|--------------|--------|-------|
| 1 | Gallery has no thesis | Headline "Watch a neural network learn to play.", one-sentence lede, the four steps listed once. Built-ins are a 3 x 2 grid (2 columns under 960 px, 1 under 600 px). The new-concept form and generated cards moved into a "Make your own" section below, with an empty-state line. Tagline removed from the top bar. | `before/1440-gallery.png`, `before/390-gallery.png` | `01-gallery.png`, `17-mobile-gallery.png` |
| 2 | Learn never says what you see | One plain sentence under every chart title, worded per method (fitness, species, loss, exploration, outputs). Idle hint above the speed bar says what Start will do. Stage header gained a status light (hollow idle, pulsing live, square amber replay, blue play), always paired with the header text. The iteration cell flashes on every tick, the best cell only on a new record. Every stat has a tooltip. "No data yet" became "Nothing to plot yet". | `before/1440-pong-4-empty.png`, `before/1440-pong-4-learn.png` | `03-pong-learn.png`, `12-dqn-pong.png`, `08-walker-learn.png` |
| 3 | Steps drawn as tabs | Stepper is an ordered list of numbered marks joined by rules; done / current / upcoming differ by outline, fill and weight. Steps 1-3 end in a primary "Continue: ..." link. | `before/1440-pong-1-play.png` | `02-pong-play.png`, `09-reward-panel.png`, `11-method-picker.png` |
| 4 | Mobile an afterthought | Under 860 px the stepper is one four-segment row under the breadcrumb. Reward-term descriptions move under the term name when the panel is narrower than 460 px (container query). 44 px targets under 720 px and on coarse pointers. Speed buttons are one seven-column row; run buttons, seed and population fill the width. Stats cells keep a clean rule grid when they wrap. Weight rows stack the label above slider and number. | `before/390-pong-1-play.png`, `before/390-pong-4-learn.png` | `18-mobile-learn.png` |
| 5 | No type scale | Six named roles in `tokens.css` (`--fs-label` to `--fs-display`), in rem. Gallery headline is 30-48 px. Chart text is 11 px. Headings balance, paragraphs use `text-wrap: pretty`, explanatory copy is capped at about 72ch. Textareas are mono again. | | |
| 6 | Control boundaries | `--line-strong` (#556480, 3.04:1 on `--panel`) bounds inputs, selects, textareas, kbd, badges and the modal. Placeholder uses `--muted` (5.6:1). `--on-accent`, `--on-warn`, `--stage-bg` replace the three stray hex values. Two unicode glyphs used as icons were removed. | | `16-settings.png` |
| 7 | Edges | Unknown-concept page has the top bar, a reason and a primary way back. Settings has "Back to the gallery". The source modal head is sticky. The rewards panel opens with a plain sentence before the formula. A keyboard-shortcut line sits under the Learn panels on wide, fine-pointer screens. The generation log shows a cursor on the step in progress. | | `15-generated.png` |

Not done:

- The range thumb and number-input spinners are still browser-drawn (tinted by `accent-color` only).
- Play (step 1) needs a keyboard, so it cannot be played on a phone. Touch controls would be a behaviour change, outside this pass.
- The three minor observations above are unchanged.
