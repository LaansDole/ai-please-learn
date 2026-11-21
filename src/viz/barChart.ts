/** Horizontal bars from a centred zero axis (activations and Q-values can be negative). The chosen action gets a leading ">". */
export function createOutputsBar(labels: string[]): { el: HTMLElement; set(values: Float32Array, chosen?: number): void } {
  const el = document.createElement('div');
  el.className = 'outputs-bar'; el.dataset.testid = 'outputs-bar';
  const rows = labels.map((label) => {
    const row = document.createElement('div'), mark = document.createElement('span'), name = document.createElement('span');
    const track = document.createElement('div'), bar = document.createElement('div'), value = document.createElement('span');
    row.className = 'out-row'; mark.className = 'out-mark'; name.className = 'out-name'; track.className = 'out-track'; bar.className = 'out-fill'; value.className = 'num out-value';
    name.textContent = label; name.title = label; value.textContent = '0.00';
    track.append(bar); row.append(mark, name, track, value); el.append(row);
    return { row, mark, bar, value };
  });
  let scale = 1;
  return {
    el,
    set(values, chosen) {
      for (const v of values) if (Math.abs(v) > scale) scale = Math.abs(v);
      rows.forEach((r, i) => {
        const v = values[i] ?? 0, frac = Math.min(1, Math.abs(v) / scale) * 50;
        r.bar.style.width = `${frac}%`;
        r.bar.style.left = v < 0 ? `${50 - frac}%` : '50%';
        r.bar.classList.toggle('neg', v < 0);
        r.value.textContent = v.toFixed(2);
        r.mark.textContent = i === chosen ? '>' : '';
        r.row.classList.toggle('chosen', i === chosen);
      });
    },
  };
}
