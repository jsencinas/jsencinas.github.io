/* =====================================================================
   ghost.js: a dot-drawn ghost next to the statement (an original design).
   It floats, its hem ripples, it sways, looks around and blinks.
   Same rules as the hero sphere: 2D canvas, one rAF loop at about 30 fps,
   devicePixelRatio capped, paused off screen and in hidden tabs,
   one still frame with reduced motion.
   ===================================================================== */

/* ---------- VISUAL CONSTANTS ---------- */
const GHOST = {
  dots: 1300,               // body dots (phones use dotsPhone)
  dotsPhone: 750,
  eyeDots: 190,             // per eye
  phoneBelow: 600,          // canvas widths under this use the phone counts
  radius: 0.5,              // body radius; the shape spans about -0.6..0.65 vertically
  domeY: 0.15,              // where the dome meets the body
  hemY: -0.42,              // average bottom edge
  hemBumps: 7,              // scallops around the hem
  hemDepth: 0.16,
  hemEdgeDots: 150,         // a denser row along the hem, so the scallops read
  hemWaveMs: 1400,          // one ripple period
  floatPx: 0.06,            // bob height, in body units
  floatMs: 2800,
  swayDeg: 28,              // turns left and right of facing you
  swayMs: 7000,
  eyeY: 0.2, eyeAngle: 0.36, eyeW: 0.12, eyeH: 0.15,  // eye centers and half sizes, on the surface
  pupilR: 0.07, pupilReach: 0.05,                   // pupil (a hole in the eye) size and how far it moves
  lookEveryMs: 1700,        // a new place to look
  blinkEveryMs: 4300, blinkMs: 160,
  scale: 0.4,               // size as a share of the canvas side
  perspective: 0.18,
  tiltXDeg: 10,
  fps: 30,
  dprMax: 1.5,
  dotRGB: [243, 241, 236],
  edges: [-0.6, -0.2, 0.2, 0.6],            // depth buckets, back to front
  alpha: [0.12, 0.22, 0.38, 0.6, 0.84],
  size: [1.1, 1.3, 1.6, 1.9, 2.2],
  seed: 31,
};
// where the eyes look, in turn (x, y in pupil-reach units)
const LOOKS = [[0, 0], [1, 0.1], [1, 0.1], [0, 0], [-1, -0.2], [-0.6, 0.8], [0, 0], [0.4, -0.6]];
/* -------------------------------------- */

const TAU = Math.PI * 2;
const PHI = (Math.sqrt(5) - 1) / 2;
const frac = (v) => v - Math.floor(v);
const smooth = (t) => t * t * (3 - 2 * t);

// Points are stored as surface coordinates and placed in 3D every frame,
// so the hem can ripple and the eyes can blink.
function build(nBody, nEye) {
  const G = GHOST, R = G.radius;
  const domeArea = TAU * R * R, sideArea = TAU * R * (G.domeY - G.hemY);
  const nDome = Math.round(nBody * domeArea / (domeArea + sideArea));
  const body = [];
  const inEye = (th, y) => [-1, 1].some((s) => {
    const du = (th - s * G.eyeAngle) * R / (G.eyeW * 1.15), dv = (y - G.eyeY) / (G.eyeH * 1.15);
    return du * du + dv * dv < 1;
  });
  // dome: even spread over a hemisphere (cos of the polar angle uniform in 0..1)
  for (let i = 0; i < nDome; i++) {
    const c = (i + 0.5) / nDome, th = TAU * frac(i * PHI);
    const y = G.domeY + R * c, r = R * Math.sqrt(1 - c * c);
    if (y - G.domeY < 0.5 * R && inEye(th - Math.PI / 2, y)) continue;
    body.push({ k: 0, th, r, y });
  }
  // side: (angle, share of the way down); y is worked out each frame from the hem
  const nSide = nBody - nDome;
  for (let i = 0; i < nSide; i++) {
    const v = (i + 0.5) / nSide, th = TAU * frac(i * PHI);
    const y0 = G.domeY - v * (G.domeY - G.hemY);
    if (inEye(th - Math.PI / 2, y0)) continue;
    body.push({ k: 1, th, v });
  }
  for (let i = 0; i < GHOST.hemEdgeDots; i++) body.push({ k: 1, th: TAU * i / GHOST.hemEdgeDots, v: 1 });
  // eyes: filled ellipses on the front of the body (angle 0 faces the viewer)
  const eyes = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < nEye; i++) {
      const rr = Math.sqrt((i + 0.5) / nEye), a = TAU * frac(i * PHI);
      eyes.push({ s, u: rr * Math.cos(a), w: rr * Math.sin(a) });   // unit-disc coordinates
    }
  }
  return { body, eyes };
}

export function initGhost(canvas) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  const G = GHOST;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const dotStyles = G.alpha.map((a) => rgb(G.dotRGB, a));
  const eyeStyle = rgb(G.dotRGB, 1), shadowStyle = rgb(G.dotRGB, 0.1);

  let model = null, w = 0, h = 0, dpr = 1, phone = null, sizes = [];
  let raf = 0, last = 0, time = 0, onScreen = false;
  const buckets = G.alpha.map(() => []), eyePts = [], shadowPts = [];

  function layout(cw, ch) {
    w = cw; h = ch;
    dpr = Math.min(window.devicePixelRatio || 1, G.dprMax);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const isPhone = w < G.phoneBelow;
    if (isPhone !== phone) { phone = isPhone; model = build(phone ? G.dotsPhone : G.dots, phone ? Math.round(G.eyeDots * 0.7) : G.eyeDots); }
    sizes = G.size.map((s) => Math.max(1, Math.round(s * dpr)));
  }

  // where the pupils point and how open the eyes are, at time t
  function eyesAt(t) {
    const n = t / G.lookEveryMs, k = Math.floor(n), f = smooth(Math.min(1, (n - k) * 2.5));
    const a = LOOKS[k % LOOKS.length], b = LOOKS[(k + 1) % LOOKS.length];
    const look = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const bt = t % G.blinkEveryMs;
    const open = bt < G.blinkMs ? Math.abs(1 - 2 * bt / G.blinkMs) * 0.9 + 0.1 : 1;
    return { look, open };
  }

  function draw() {
    if (!model || !w) return;
    const t = reduced ? 0 : time;
    const R = G.radius;
    const sway = reduced ? -0.25 : (G.swayDeg * Math.PI / 180) * Math.sin(TAU * t / G.swayMs);
    const lift = reduced ? 0 : G.floatPx * Math.sin(TAU * t / G.floatMs);
    const phase = TAU * t / G.hemWaveMs;
    const { look, open } = reduced ? { look: [0, 0], open: 1 } : eyesAt(t);
    const ca = Math.cos(sway), sa = Math.sin(sway);
    const tx = G.tiltXDeg * Math.PI / 180, cx = Math.cos(tx), sx = Math.sin(tx);
    const S = Math.min(w, h) * G.scale, ox = w / 2, oy = h * 0.47;

    for (const b of buckets) b.length = 0;
    eyePts.length = 0; shadowPts.length = 0;

    // object point (x, y, z) -> screen, with depth bucket
    const project = (x, y, z, out, bucketed) => {
      const x1 = x * ca + z * sa, z1 = z * ca - x * sa;
      const y2 = (y + lift) * cx - z1 * sx, z2 = (y + lift) * sx + z1 * cx;
      const depth = Math.max(-1, Math.min(1, z2 / R));
      const s = S * (1 + depth * G.perspective);
      const px = ox + x1 * s, py = oy - y2 * s;
      if (bucketed) {
        let k = 0;
        while (k < G.edges.length && depth >= G.edges[k]) k++;
        buckets[k].push(px, py);
      } else if (z2 > -0.05) out.push(px, py);   // eyes only on the side facing you
    };

    for (const p of model.body) {
      let x, y, z;
      if (p.k === 0) { x = p.r * Math.cos(p.th); y = p.y; z = p.r * Math.sin(p.th); }
      else {
        const hem = G.hemY - G.hemDepth * (0.5 + 0.5 * Math.cos(G.hemBumps * p.th - phase));
        y = G.domeY - p.v * (G.domeY - hem);
        x = R * Math.cos(p.th); z = R * Math.sin(p.th);
      }
      project(x, y, z, null, true);
    }
    for (const e of model.eyes) {
      const u = e.u * G.eyeW, v = e.w * G.eyeH * open;
      const th = e.s * G.eyeAngle + u / R;            // around the body, from the front
      const y = G.eyeY + v;
      const r = y > G.domeY ? Math.sqrt(Math.max(0, R * R - (y - G.domeY) ** 2)) : R;
      const x = r * Math.sin(th), z = r * Math.cos(th) + 0.01;
      const du = u - look[0] * G.pupilReach, dv = v - look[1] * G.pupilReach * open;
      if (du * du + dv * dv < G.pupilR * G.pupilR * open) continue;   // the pupil is a hole
      project(x, y, z, eyePts, false);
    }
    // shadow: a flat ring of faint dots that shrinks as the ghost rises
    const shrink = 1 - lift * 2.2;
    for (let i = 0; i < 60; i++) {
      const a = TAU * i / 60, rr = 0.42 * shrink * (0.6 + 0.4 * ((i * 7) % 3) / 2);
      shadowPts.push(ox + Math.cos(a) * rr * S, oy + (0.68 + Math.sin(a) * rr * 0.16) * S);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dots = (list, size, style) => {
      ctx.fillStyle = style;
      const half = size / 2;
      for (let j = 0; j < list.length; j += 2) ctx.fillRect(Math.round(list[j] * dpr - half), Math.round(list[j + 1] * dpr - half), size, size);
    };
    dots(shadowPts, sizes[1], shadowStyle);
    buckets.forEach((list, k) => dots(list, sizes[k], dotStyles[k]));
    dots(eyePts, sizes[sizes.length - 1], eyeStyle);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / G.fps - 2) return;
    time += Math.min(now - last, 100);
    last = now;
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
  reducedMq.addEventListener('change', (e) => { reduced = e.matches; sync(); draw(); });
}
