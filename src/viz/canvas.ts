/** A canvas that fills its (sized) wrapper, stays DPR-crisp and repaints through `draw` at most once per frame. */
export interface ChartCanvas {
  wrap: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  readonly w: number;                         // CSS pixels
  readonly h: number;
  token(name: string): string;                // resolves '--name' design tokens; other strings pass through
  redraw(): void;
}

export function createChartCanvas(testid: string, draw: () => void): ChartCanvas {
  const wrap = document.createElement('div'), canvas = document.createElement('canvas');
  wrap.className = 'chart-wrap'; canvas.dataset.testid = testid;
  wrap.append(canvas);
  const ctx = canvas.getContext('2d')!, css = getComputedStyle(document.documentElement);
  let w = 0, h = 0, raf = 0;
  const redraw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (w === 0 || h === 0) return;
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw();
    });
  };
  // Never disconnected explicitly: the observer is collected with the canvas when the page is torn down.
  new ResizeObserver(() => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    redraw();
  }).observe(canvas);
  return {
    wrap, canvas, ctx, redraw,
    get w() { return w; },
    get h() { return h; },
    token: (name) => (name.startsWith('--') ? css.getPropertyValue(name).trim() : name),
  };
}
