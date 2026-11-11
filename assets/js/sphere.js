/* =====================================================================
   HERO SPHERE: VISUAL CONSTANTS
   Every look-and-feel number for the dot sphere lives in this block.
   Geometry is in fractions of the hero box; sizes are CSS px.
   Depth runs from -1 (back of the sphere) to 1 (front, facing you).
   ===================================================================== */
const SPHERE = {
  // Size and position. Diameter = min(diameterW * heroWidth, diameterH * heroHeight).
  desktop: { diameterW: 0.40, diameterH: 0.64, cx: 0.72, cy: 0.45 },
  phone:   { diameterW: 0.66, diameterH: 0.32, cx: 0.60, cy: 0.40 },
  phoneBelow: 900,          // hero widths under this use the phone layout and counts

  // Orientation and motion
  tiltZDeg: 18,             // axis lean in the screen plane
  tiltXDeg: 14,             // axis lean toward the viewer (0 = none)
  revolutionMs: 90000,      // one full turn
  perspective: 0.16,        // 0 = flat; >0 makes front dots spread slightly wider

  // Dot counts. The auto-reducer steps down each ladder when frames are slow.
  ladderDesktop: [1400, 1000, 700],
  ladderPhone: [650, 450],
  champagneShare: 0.04,     // of all dots
  looseShare: 0.06,         // of all dots, floating outside the shell
  looseRadius: [1.04, 1.28],// in sphere radii
  looseWobble: 0.02,        // radial breathing of loose dots, in sphere radii
  looseWobbleMs: 9000,      // period of that breathing

  // Colors (r, g, b)
  dotRGB: [243, 241, 236],
  accentRGB: [217, 199, 160],

  // Depth buckets. `edges` split depth into len(edges)+1 buckets, back to front.
  shell:     { edges: [-0.6, -0.2, 0.2, 0.6, 0.85], alpha: [0.10, 0.15, 0.24, 0.40, 0.58, 0.72], size: [1.0, 1.0, 1.3, 1.7, 2.0, 2.2] },
  loose:     { edges: [0],                    alpha: [0.12, 0.26],                   size: [1.0, 1.3] },
  champagne: { edges: [-0.2, 0.2, 0.6],       alpha: [0.22, 0.45, 0.70, 0.95],       size: [1.6, 2.0, 2.4, 2.6] },

  // Assemble on load: dots start scattered across the hero at alpha 0.
  assembleMs: 1800,
  assembleDelayMaxMs: 400,  // random per-dot head start, 0..this

  // Pulverize and rebuild, on a loop once the sphere has formed (never with reduced motion).
  // The clock only runs while the hero is on screen and the tab is visible.
  holdMs: 12000,            // whole sphere between bursts
  burstMs: 1300,            // crumble outward
  burstDelayMaxMs: 350,     // random per-dot head start for the crumble
  hangMs: 900,              // dust hangs and sinks a little
  reformMs: 2000,           // pull back into the sphere
  reformDelayMaxMs: 500,    // random per-dot head start for the rebuild
  burstSpread: [0.25, 1.15],// extra outward distance, in sphere radii (scaled by the dot's distance from center)
  burstJitter: 0.4,         // random scatter in any direction, in sphere radii
  burstSink: 0.08,          // downward drift while the dust hangs, in sphere radii
  burstDim: 0.35,           // share of alpha lost at full scatter

  // Rendering budget
  fps: 30,
  dprMax: 1.5,
  slowFrameMs: 24,          // average frame time that triggers a quality step down
  sampleFrames: 45,         // frames per measurement window
  warmupMs: 1500,           // no measuring until this long after the dots settle
  seed: 7102,               // fixed seed: the same sphere on every load
};
/* ========================= end of constants ========================= */

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SHELL = 0, CHAMP = 1, LOOSE = 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bucketOf(edges, depth) {
  let b = 0;
  while (b < edges.length && depth >= edges[b]) b++;
  return b;
}

export function initSphere(canvas) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return { reveal() {} };

  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const kinds = [SPHERE.shell, SPHERE.champagne, SPHERE.loose]; // indexed by SHELL, CHAMP, LOOSE
  const drawOrder = [SHELL, LOOSE, CHAMP]; // champagne last, on top
  const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const styles = kinds.map((k, kind) =>
    k.alpha.map((a) => rgb(kind === CHAMP ? SPHERE.accentRGB : SPHERE.dotRGB, a)));
  const solid = [rgb(SPHERE.dotRGB, 1), rgb(SPHERE.accentRGB, 1)];

  // Per-dot data (structure of arrays)
  let n = 0, X, Y, Z, R, K, SX, SY, D, P;
  // Per-dot burst data: outward spread, scatter vector, crumble and rebuild delays
  let BS, BX, BY, BD, BR;
  // Per-bucket screen positions, rebuilt every frame
  let buf = [], len = [];

  // Layout state
  let cssW = 0, cssH = 0, dpr = 1, dprCap = SPHERE.dprMax;
  let cx = 0, cy = 0, radius = 0, phone = false, level = 0;
  let sizeDev = []; // device-px square size per kind/bucket
  let clearBox = null, fullClear = true;

  // Time state
  let raf = 0, prev = 0, lastDraw = 0, simTime = 0;
  let assembleStart = -1, assembled = false, cycleFrom = 0;
  const cycleMs = SPHERE.holdMs + SPHERE.burstMs + SPHERE.burstDelayMaxMs + SPHERE.hangMs
    + SPHERE.reformMs + SPHERE.reformDelayMaxMs;
  let onScreen = true, monitorFrom = Infinity, sampleSum = 0, sampleCount = 0;
  let reduced = reducedMq.matches;

  function build(count) {
    const rnd = mulberry32(SPHERE.seed);
    const nLoose = Math.round(count * SPHERE.looseShare);
    const nShell = count - nLoose;
    const champChance = SPHERE.champagneShare / (1 - SPHERE.looseShare);
    n = count;
    X = new Float32Array(n); Y = new Float32Array(n); Z = new Float32Array(n);
    R = new Float32Array(n); K = new Uint8Array(n);
    SX = new Float32Array(n); SY = new Float32Array(n);
    D = new Float32Array(n); P = new Float32Array(n);
    BS = new Float32Array(n); BX = new Float32Array(n); BY = new Float32Array(n);
    BD = new Float32Array(n); BR = new Float32Array(n);
    const rb = mulberry32(SPHERE.seed ^ 0x5eed); // separate stream: the sphere itself stays the same
    for (let i = 0; i < n; i++) {
      BS[i] = SPHERE.burstSpread[0] + rb() * (SPHERE.burstSpread[1] - SPHERE.burstSpread[0]);
      const a = rb() * TAU, m = Math.sqrt(rb()) * SPHERE.burstJitter;
      BX[i] = Math.cos(a) * m; BY[i] = Math.sin(a) * m;
      BD[i] = rb() * SPHERE.burstDelayMaxMs;
      BR[i] = rb() * SPHERE.reformDelayMaxMs;
    }
    for (let i = 0; i < n; i++) {
      if (i < nShell) {
        // Fibonacci lattice: even coverage at any count
        const y = 1 - ((i + 0.5) / nShell) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * GOLDEN;
        X[i] = Math.cos(th) * r; Y[i] = y; Z[i] = Math.sin(th) * r;
        R[i] = 1;
        K[i] = rnd() < champChance ? CHAMP : SHELL;
      } else {
        const z = rnd() * 2 - 1, phi = rnd() * TAU, r = Math.sqrt(1 - z * z);
        X[i] = Math.cos(phi) * r; Y[i] = z; Z[i] = Math.sin(phi) * r;
        R[i] = SPHERE.looseRadius[0] + rnd() * (SPHERE.looseRadius[1] - SPHERE.looseRadius[0]);
        K[i] = LOOSE;
      }
      SX[i] = rnd(); SY[i] = rnd();
      D[i] = rnd() * SPHERE.assembleDelayMaxMs;
      P[i] = rnd() * TAU;
    }
    buf = kinds.map((k) => k.alpha.map(() => new Float32Array(n * 2)));
    len = kinds.map((k) => k.alpha.map(() => 0));
    fullClear = true;
  }

  function ladder() { return phone ? SPHERE.ladderPhone : SPHERE.ladderDesktop; }

  function layout(w, h) {
    cssW = w; cssH = h;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));

    const wasPhone = phone;
    phone = w < SPHERE.phoneBelow;
    const g = phone ? SPHERE.phone : SPHERE.desktop;
    radius = Math.min(g.diameterW * w, g.diameterH * h) / 2;
    cx = g.cx * w; cy = g.cy * h;

    sizeDev = kinds.map((k) => k.size.map((s) => Math.max(1, Math.round(s * dpr))));
    const reach = radius * (SPHERE.looseRadius[1] + SPHERE.looseWobble) * (1 + SPHERE.perspective) + 4;
    clearBox = [
      Math.max(0, Math.floor((cx - reach) * dpr)), Math.max(0, Math.floor((cy - reach) * dpr)),
      Math.ceil(reach * 2 * dpr), Math.ceil(reach * 2 * dpr),
    ];

    if (n === 0 || wasPhone !== phone) {
      level = Math.min(level, ladder().length - 1);
      build(ladder()[level]);
    }
    fullClear = true;
  }

  function draw(now) {
    if (assembleStart < 0 || !cssW) return;
    const tA = reduced ? Infinity : now - assembleStart;
    const assembling = tA < SPHERE.assembleMs + SPHERE.assembleDelayMaxMs;
    if (!assembling && !assembled) { assembled = true; cycleFrom = simTime; monitorFrom = now + SPHERE.warmupMs; }

    // Burst cycle: u is the time since the hold ended, -1 while the sphere is whole
    let u = -1;
    if (assembled && !reduced) {
      const c = (simTime - cycleFrom) % cycleMs;
      if (c >= SPHERE.holdMs) u = c - SPHERE.holdMs;
    }
    const bursting = u >= 0;
    const free = assembling || bursting; // dots drawn one by one, anywhere on the canvas

    if (free || fullClear) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fullClear = free;
    } else {
      ctx.clearRect(clearBox[0], clearBox[1], clearBox[2], clearBox[3]);
    }
    const reformAt = SPHERE.burstMs + SPHERE.burstDelayMaxMs + SPHERE.hangMs;
    const sink = bursting
      ? SPHERE.burstSink * radius * Math.min(1, Math.max(0, (u - SPHERE.burstMs - SPHERE.burstDelayMaxMs) / SPHERE.hangMs))
      : 0;

    const ang = (simTime / SPHERE.revolutionMs) * TAU;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const tz = SPHERE.tiltZDeg * Math.PI / 180, tx = SPHERE.tiltXDeg * Math.PI / 180;
    const cz = Math.cos(tz), sz = Math.sin(tz), cxr = Math.cos(tx), sxr = Math.sin(tx);
    const wob = (simTime / SPHERE.looseWobbleMs) * TAU;
    const persp = SPHERE.perspective;

    for (let k = 0; k < 3; k++) for (let b = 0; b < len[k].length; b++) len[k][b] = 0;

    for (let i = 0; i < n; i++) {
      const kind = K[i];
      let r = R[i];
      if (kind === LOOSE) r += Math.sin(wob + P[i]) * SPHERE.looseWobble;
      const x = X[i], y = Y[i], z = Z[i];
      // spin around the sphere's own axis
      const x1 = x * ca + z * sa;
      const z1 = z * ca - x * sa;
      // tip the axis toward the viewer, then lean it in the screen plane
      const y1 = y * cxr - z1 * sxr;
      const z2 = y * sxr + z1 * cxr;
      const x2 = x1 * cz - y1 * sz;
      const y2 = x1 * sz + y1 * cz;
      const depth = z2;
      const s = radius * r * (1 + depth * persp);
      let px = cx + x2 * s;
      let py = cy - y2 * s;
      const spec = kinds[kind];
      const b = bucketOf(spec.edges, depth);

      if (assembling) {
        let t = (tA - D[i]) / SPHERE.assembleMs;
        if (t <= 0) continue;
        if (t > 1) t = 1;
        const e = easeOutCubic(t);
        const ox = SX[i] * cssW, oy = SY[i] * cssH;
        px = ox + (px - ox) * e;
        py = oy + (py - oy) * e;
        const sd = sizeDev[kind][b];
        ctx.globalAlpha = spec.alpha[b] * e;
        ctx.fillStyle = solid[kind === CHAMP ? 1 : 0];
        ctx.fillRect(Math.round(px * dpr - sd / 2), Math.round(py * dpr - sd / 2), sd, sd);
      } else if (bursting) {
        // k: 0 = on the sphere, 1 = fully scattered
        let k;
        if (u < reformAt) k = easeOutCubic(Math.min(1, Math.max(0, (u - BD[i]) / SPHERE.burstMs)));
        else k = 1 - easeInOutCubic(Math.min(1, Math.max(0, (u - reformAt - BR[i]) / SPHERE.reformMs)));
        if (k > 0) {
          const out = radius * r * BS[i] * k;
          px += x2 * out + BX[i] * radius * k;
          py += -y2 * out + BY[i] * radius * k + sink * k;
        }
        const sd = sizeDev[kind][b];
        ctx.globalAlpha = spec.alpha[b] * (1 - SPHERE.burstDim * k);
        ctx.fillStyle = solid[kind === CHAMP ? 1 : 0];
        ctx.fillRect(Math.round(px * dpr - sd / 2), Math.round(py * dpr - sd / 2), sd, sd);
      } else {
        const arr = buf[kind][b];
        const j = len[kind][b];
        arr[j] = px; arr[j + 1] = py;
        len[kind][b] = j + 2;
      }
    }

    if (free) { ctx.globalAlpha = 1; return; }

    // Steady state: one fillStyle per bucket
    for (const kind of drawOrder) {
      const kb = buf[kind];
      for (let b = 0; b < kb.length; b++) {
        const m = len[kind][b];
        if (!m) continue;
        const arr = kb[b], sd = sizeDev[kind][b], half = sd / 2;
        ctx.fillStyle = styles[kind][b];
        for (let j = 0; j < m; j += 2) {
          ctx.fillRect(Math.round(arr[j] * dpr - half), Math.round(arr[j + 1] * dpr - half), sd, sd);
        }
      }
    }
  }

  // Auto quality: average rAF interval over a window; step down when slow.
  function monitor(dt, now) {
    if (now < monitorFrom) return;
    sampleSum += dt; sampleCount++;
    if (sampleCount < SPHERE.sampleFrames) return;
    const avg = sampleSum / sampleCount;
    sampleSum = 0; sampleCount = 0;
    if (avg <= SPHERE.slowFrameMs) return;
    if (level < ladder().length - 1) {
      level++;
      build(ladder()[level]);
    } else if (dprCap > 1) {
      dprCap = 1;
      layout(cssW, cssH);
    } else {
      monitorFrom = Infinity; // nothing left to reduce
      return;
    }
    monitorFrom = now + 1000;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = now - prev;
    prev = now;
    if (dt > 0 && dt < 250) monitor(dt, now);
    if (now - lastDraw < 1000 / SPHERE.fps - 2) return;
    simTime += Math.min(now - lastDraw, 100);
    lastDraw = now;
    draw(now);
  }

  function shouldRun() {
    return !reduced && onScreen && document.visibilityState === 'visible' && assembleStart >= 0;
  }

  function sync() {
    if (shouldRun()) {
      if (!raf) {
        prev = lastDraw = performance.now();
        sampleSum = 0; sampleCount = 0;
        raf = requestAnimationFrame(tick);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function drawStatic() {
    fullClear = true;
    draw(performance.now());
  }

  // Size tracking: the observer reports CSS size; no layout reads elsewhere.
  let pending = null;
  new ResizeObserver((entries) => {
    const box = entries[entries.length - 1].contentRect;
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = null;
      layout(box.width, box.height);
      drawStatic(); // repaint right away, resizing clears the canvas
    });
  }).observe(canvas);

  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  }).observe(canvas.parentElement || canvas);

  document.addEventListener('visibilitychange', sync);

  reducedMq.addEventListener('change', (e) => {
    reduced = e.matches;
    if (reduced) { sync(); drawStatic(); } else { sync(); }
  });

  return {
    // Called when the intro starts to fade (or at once with no intro).
    reveal() {
      if (assembleStart >= 0) return;
      assembleStart = performance.now();
      if (reduced) drawStatic();
      sync();
    },
  };
}
