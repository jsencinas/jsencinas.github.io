/* =====================================================================
   spinner.js: a dot-drawn padlock that turns slowly, next to the statement.
   Same rules as the hero sphere: 2D canvas, one rAF loop at about 30 fps,
   devicePixelRatio capped, paused off screen and in hidden tabs,
   one still frame with reduced motion.
   ===================================================================== */

/* ---------- VISUAL CONSTANTS ---------- */
const SPIN = {
  dots: 1100,               // phones use dotsPhone
  dotsPhone: 650,
  phoneBelow: 600,          // canvas widths under this use the phone count
  keyholeShare: 0.07,       // of all dots, drawn in the accent color
  turnMs: 16000,            // one full turn
  tiltXDeg: 12,             // looks slightly down on it
  perspective: 0.18,
  scale: 0.42,              // object size as a share of the canvas side
  stillAngle: -0.55,        // angle of the still frame (reduced motion)
  fps: 30,
  dprMax: 1.5,
  dotRGB: [243, 241, 236],
  accentRGB: [217, 199, 160],
  // depth buckets, back to front
  edges: [-0.6, -0.2, 0.2, 0.6],
  alpha: [0.14, 0.24, 0.40, 0.62, 0.86],
  size: [1.1, 1.3, 1.6, 1.9, 2.2],
  seed: 2026,
};
/* -------------------------------------- */

const TAU = Math.PI * 2;
const PHI = (Math.sqrt(5) - 1) / 2;
const frac = (v) => v - Math.floor(v);

// Surfaces: each has an area and maps (a, b) in the unit square onto itself.
function rect(o, u, v, d = 1) {
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return { area: Math.hypot(c[0], c[1], c[2]) * d, at: (a, b) => [o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1], o[2] + a * u[2] + b * v[2]] };
}
function box(c, hx, hy, hz) {
  return [
    rect([c[0] + hx, c[1] - hy, c[2] - hz], [0, 2 * hy, 0], [0, 0, 2 * hz]), rect([c[0] - hx, c[1] - hy, c[2] - hz], [0, 2 * hy, 0], [0, 0, 2 * hz]),
    rect([c[0] - hx, c[1] + hy, c[2] - hz], [2 * hx, 0, 0], [0, 0, 2 * hz]), rect([c[0] - hx, c[1] - hy, c[2] - hz], [2 * hx, 0, 0], [0, 0, 2 * hz]),
    rect([c[0] - hx, c[1] - hy, c[2] + hz], [2 * hx, 0, 0], [0, 2 * hy, 0]), rect([c[0] - hx, c[1] - hy, c[2] - hz], [2 * hx, 0, 0], [0, 2 * hy, 0]),
  ];
}
// Upright tube of radius r at (x, z) from y0 to y1.
function post(x, z, r, y0, y1, d = 1) {
  return { area: TAU * r * (y1 - y0) * d, at: (a, b) => [x + r * Math.cos(TAU * b), y0 + (y1 - y0) * a, z + r * Math.sin(TAU * b)] };
}
// Tube of radius `tube` along an arc in the XY plane.
function arc(cx, cy, R, tube, t0, t1, d = 1) {
  return { area: TAU * tube * R * Math.abs(t1 - t0) * d, at: (a, b) => {
    const t = t0 + (t1 - t0) * a, ps = TAU * b, w = R + tube * Math.cos(ps);
    return [cx + w * Math.cos(t), cy + w * Math.sin(t), tube * Math.sin(ps)];
  } };
}
// Flat disc of radius R at (cx, cy) on the plane z.
function disc(cx, cy, z, R) {
  return { area: Math.PI * R * R, at: (a, b) => { const r = R * Math.sqrt(a); return [cx + r * Math.cos(TAU * b), cy + r * Math.sin(TAU * b), z]; } };
}

// Share m dots across the parts by area; a 2D Fibonacci lattice spreads them evenly on each.
function sample(parts, m, out, from) {
  const total = parts.reduce((s, p) => s + p.area, 0);
  const counts = parts.map((p) => Math.floor((p.area / total) * m));
  for (let left = m - counts.reduce((s, c) => s + c, 0), k = 0; left > 0; left--, k = (k + 1) % counts.length) counts[k]++;
  let i = from;
  parts.forEach((p, k) => {
    for (let j = 0; j < counts[k]; j++, i++) {
      const q = p.at((j + 0.5) / counts[k], frac(j * PHI + k * 0.137));
      out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
    }
  });
}

// Padlock: a box body, a U-shaped shackle, and a keyhole on both faces.
function padlock(m) {
  const by = -0.32, bh = 0.36, hz = 0.16, sx = 0.3, top = by + bh + 0.22;
  const nKey = Math.round(m * SPIN.keyholeShare), nBody = m - nKey;
  const pts = new Float32Array(m * 3);
  sample([
    ...box([0, by, 0], 0.5, bh, hz),
    post(-sx, 0, 0.07, by + bh, top, 1.6),
    post(sx, 0, 0.07, by + bh, top, 1.6),
    arc(0, top, sx, 0.07, 0, Math.PI, 1.6),
  ], nBody, pts, 0);
  const keyY = by + 0.06, z = hz + 0.004;
  sample([
    disc(0, keyY, z, 0.07), rect([-0.028, keyY - 0.2, z], [0.056, 0, 0], [0, 0.2, 0]),
    disc(0, keyY, -z, 0.07), rect([-0.028, keyY - 0.2, -z], [0.056, 0, 0], [0, 0.2, 0]),
  ], nKey, pts, nBody);
  return { pts, accentFrom: nBody };
}

export function initSpinner(canvas) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const styles = [SPIN.alpha.map((a) => rgb(SPIN.dotRGB, a)), SPIN.alpha.map((a) => rgb(SPIN.accentRGB, Math.min(1, a + 0.12)))];

  let model = null, w = 0, h = 0, dpr = 1, phone = null, sizes = [];
  let raf = 0, last = 0, angle = SPIN.stillAngle, onScreen = false;
  const buckets = [[], []];

  function layout(cw, ch) {
    w = cw; h = ch;
    dpr = Math.min(window.devicePixelRatio || 1, SPIN.dprMax);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const isPhone = w < SPIN.phoneBelow;
    if (isPhone !== phone) { phone = isPhone; model = padlock(phone ? SPIN.dotsPhone : SPIN.dots); }
    sizes = SPIN.size.map((s) => Math.max(1, Math.round(s * dpr)));
  }

  function draw() {
    if (!model || !w) return;
    const { pts, accentFrom } = model, n = pts.length / 3;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tx = SPIN.tiltXDeg * Math.PI / 180, cx = Math.cos(tx), sx = Math.sin(tx);
    const R = Math.min(w, h) * SPIN.scale, ox = w / 2, oy = h / 2;
    for (const k of buckets) { k.length = SPIN.alpha.length; for (let b = 0; b < k.length; b++) (k[b] || (k[b] = [])).length = 0; }
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      const x1 = x * ca + z * sa, z1 = z * ca - x * sa;          // turn around the vertical axis
      const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;          // look slightly down
      const depth = Math.max(-1, Math.min(1, z2 / 0.62));
      const s = R * (1 + depth * SPIN.perspective);
      let b = 0;
      while (b < SPIN.edges.length && depth >= SPIN.edges[b]) b++;
      buckets[i >= accentFrom ? 1 : 0][b].push(ox + x1 * s, oy - y2 * s);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let kind = 0; kind < 2; kind++) {
      for (let b = 0; b < SPIN.alpha.length; b++) {
        const list = buckets[kind][b];
        if (!list.length) continue;
        const sd = sizes[b] + (kind ? 1 : 0), half = sd / 2;
        ctx.fillStyle = styles[kind][b];
        for (let j = 0; j < list.length; j += 2) ctx.fillRect(Math.round(list[j] * dpr - half), Math.round(list[j + 1] * dpr - half), sd, sd);
      }
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / SPIN.fps - 2) return;
    const dt = Math.min(now - last, 100);
    last = now;
    angle += (dt / SPIN.turnMs) * TAU;
    draw();
  }
  function sync() {
    const run = !reduced && onScreen && document.visibilityState === 'visible';
    if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  new ResizeObserver((entries) => {
    const r = entries[entries.length - 1].contentRect;
    layout(r.width, r.height);
    draw();
  }).observe(canvas);
  new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; sync(); }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  reducedMq.addEventListener('change', (e) => { reduced = e.matches; if (reduced) angle = SPIN.stillAngle; sync(); draw(); });
}
