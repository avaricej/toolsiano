// Safari/WebKit versions without CanvasRenderingContext2D.filter still need
// the same image operations. Process strips to limit temporary pixel memory.
export function fallbackFilter(c: HTMLCanvasElement, filter: string) {
  if (filter === 'none' || !filter.trim()) return;
  const operations = [...filter.matchAll(/([a-z]+)\(([\d.]+)\)/g)].map(
    (m) => [m[1], Number(m[2])] as const,
  );
  const ctx = c.getContext('2d')!;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  for (let y = 0; y < c.height; y += 128) {
    const image = ctx.getImageData(0, y, c.width, Math.min(128, c.height - y));
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      for (const [name, v] of operations) {
        if (name === 'brightness') {
          r *= v;
          g *= v;
          b *= v;
        }
        if (name === 'contrast') {
          r = (r - 127.5) * v + 127.5;
          g = (g - 127.5) * v + 127.5;
          b = (b - 127.5) * v + 127.5;
        }
        if (name === 'grayscale') {
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r += (gray - r) * v;
          g += (gray - g) * v;
          b += (gray - b) * v;
        }
        if (name === 'sepia') {
          const nr = 0.393 * r + 0.769 * g + 0.189 * b,
            ng = 0.349 * r + 0.686 * g + 0.168 * b,
            nb = 0.272 * r + 0.534 * g + 0.131 * b;
          r += (nr - r) * v;
          g += (ng - g) * v;
          b += (nb - b) * v;
        }
        if (name === 'saturate') {
          const nr = (0.213 + 0.787 * v) * r + (0.715 - 0.715 * v) * g + (0.072 - 0.072 * v) * b;
          const ng = (0.213 - 0.213 * v) * r + (0.715 + 0.285 * v) * g + (0.072 - 0.072 * v) * b;
          const nb = (0.213 - 0.213 * v) * r + (0.715 - 0.715 * v) * g + (0.072 + 0.928 * v) * b;
          r = nr;
          g = ng;
          b = nb;
        }
        r = clamp(r);
        g = clamp(g);
        b = clamp(b);
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(image, 0, y);
  }
}
export function whiteBackground(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}
