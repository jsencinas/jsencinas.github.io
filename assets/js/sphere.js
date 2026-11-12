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
  ladderDesktop: [2000, 1400, 1000, 700],
  ladderPhone: [900, 650, 450],
  champagneShare: 0.04,     // of all dots
  looseShare: 0.06,         // of all dots, floating outside the shell
  looseRadius: [1.04, 1.28],// in sphere radii
  looseWobble: 0.02,        // radial breathing of loose dots, in sphere radii
  looseWobbleMs: 9000,      // period of that breathing

  // Colors (r, g, b)
  dotRGB: [243, 241, 236],
  accentRGB: [217, 199, 160],

  // Depth buckets. `edges` split depth into len(edges)+1 buckets, back to front.
  shell:     { edges: [-0.6, -0.2, 0.2, 0.6, 0.85], alpha: [0.18, 0.26, 0.38, 0.56, 0.74, 0.88], size: [1.1, 1.2, 1.5, 1.8, 2.1, 2.3] },
  loose:     { edges: [0],                    alpha: [0.12, 0.26],                   size: [1.0, 1.3] },
  champagne: { edges: [-0.2, 0.2, 0.6],       alpha: [0.32, 0.55, 0.80, 1.00],       size: [1.7, 2.1, 2.5, 2.7] },

  // Assemble on load: dots start scattered across the hero at alpha 0.
  assembleMs: 1800,
  assembleDelayMaxMs: 400,  // random per-dot head start, 0..this

  // Pulverize and rebuild, on a loop once the sphere has formed (never with reduced motion).
  // The clock only runs while the hero is on screen and the tab is visible.
  holdMs: 5000,             // whole sphere between bursts
  burstMs: 1300,            // crumble outward
  burstDelayMaxMs: 350,     // random per-dot head start for the crumble
  hangMs: 900,              // dust hangs and sinks a little
  reformMs: 2000,           // pull back into the sphere
  reformDelayMaxMs: 500,    // random per-dot head start for the rebuild
  burstSpread: [0.25, 1.15],// extra outward distance, in sphere radii (scaled by the dot's distance from center)
  burstJitter: 0.4,         // random scatter in any direction, in sphere radii
  burstSink: 0.08,          // downward drift while the dust hangs, in sphere radii
  burstDim: 0.35,           // share of alpha lost at full scatter

  // Textures: after each burst the dust rebuilds the sphere with the next one, then the list repeats.
  // rock: a lumpy surface (first) · dust: fine loose grain · dots: the even lattice
  // terrain: dense patches and sparse areas · bands: turbulent stripes, like a gas planet
  figures: ['rock', 'dust', 'terrain', 'bands', 'dots'],
  rock: { lumps: 0.3, detail: 0.08, scale: 0.86, light: [-0.55, 0.65, 0.5], shade: 0.08 }, // shade: density on the dark side
  dust: { jitter: 0.3 },                   // shell thickness, in sphere radii
  terrain: { freq: 1.5, floor: 0.03 },     // floor: density left in the sparse areas
  bands: { count: 7, warp: 1.3, floor: 0.03 },

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

const PHI = (Math.sqrt(5) - 1) / 2;
const frac = (v) => v - Math.floor(v);

/* ---------- Textures ----------
   Each returns m points on (or near) the unit sphere as a flat [x, y, z, ...] array.
   All but the first are unordered, shaped by seeded 3D value noise, so they look the same on every visit. */

function makeNoise(seed) {
  const rnd = mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rnd() * 2 - 1;
  const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  // fractal sum of 4 octaves, about -1..1
  return (x, y, z) => {
    let s = 0, a = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { s += a * noise(x * f + 17, y * f + 31, z * f + 47); a *= 0.5; f *= 2; }
    return s / 0.9375;
  };
}

// m points spread uniformly over the sphere, kept with probability density(x, y, z) in 0..1.
// A generator: it pauses every 64 tries so a build can be spread over several idle slices.
function* scatter(m, seed, density, place) {
  const rnd = mulberry32(seed), out = new Float32Array(m * 3);
  for (let i = 0, tries = 0; i < m; tries++) {
    if ((tries & 63) === 63) yield;
    const y = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - y * y);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (tries < m * 40 && rnd() > density(x, y, z)) continue;
    const q = place ? place(x, y, z, rnd) : [x, y, z];
    out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
    i++;
  }
  return out;
}

// Every texture is a generator that returns its points; runAll finishes one in a single go.
function runAll(it) { for (;;) { const r = it.next(); if (r.done) return r.value; } }

const FIGURES = {
  *dots(m) {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const y = 1 - ((i + 0.5) / m) * 2, r = Math.sqrt(1 - y * y), th = i * GOLDEN;
      out[i * 3] = Math.cos(th) * r; out[i * 3 + 1] = y; out[i * 3 + 2] = Math.sin(th) * r;
    }
    return out;
  },
  *rock(m) {
    // lumpy surface; more dots where a fixed light hits it, so it reads as a lit, solid stone
    const { lumps, detail, scale, light, shade } = SPHERE.rock, n = makeNoise(SPHERE.seed + 11);
    const L = Math.hypot(light[0], light[1], light[2]), lx = light[0] / L, ly = light[1] / L, lz = light[2] / L;
    const radius = (x, y, z) => 1 + lumps * n(x * 1.2, y * 1.2, z * 1.2) + detail * n(x * 4.5, y * 4.5, z * 4.5);
    return yield* scatter(m, SPHERE.seed + 12, (x, y, z) => {
      // light from one side, broken up by the lumps (raised parts catch more light)
      const d = Math.max(0, (x * lx + y * ly + z * lz) * 0.75 + n(x * 1.2, y * 1.2, z * 1.2) * 0.9 + 0.15);
      return shade + (1 - shade) * Math.min(1, d * d);
    }, (x, y, z) => {
      const k = scale * radius(x, y, z);
      return [x * k * 1.05, y * k * 0.95, z * k];
    });
  },
  *dust(m) {
    const j = SPHERE.dust.jitter;
    return yield* scatter(m, SPHERE.seed + 21, () => 1, (x, y, z, rnd) => {
      const k = 1 + (rnd() - 0.5) * j;
      return [x * k, y * k, z * k];
    });
  },
  *terrain(m) {
    const { freq, floor } = SPHERE.terrain, n = makeNoise(SPHERE.seed + 31);
    return yield* scatter(m, SPHERE.seed + 32, (x, y, z) => {
      const v = n(x * freq, y * freq, z * freq);
      const t = Math.min(1, Math.max(0, (v - 0.02) / 0.12));
      return floor + (1 - floor) * t * t * (3 - 2 * t);
    });
  },
  *bands(m) {
    const { count, warp, floor } = SPHERE.bands, n = makeNoise(SPHERE.seed + 41);
    return yield* scatter(m, SPHERE.seed + 42, (x, y, z) => {
      const s = 0.5 + 0.5 * Math.sin(y * count * 1.6 + n(x * 2, y * 2, z * 2) * warp);
      return floor + (1 - floor) * s * s * s * s;
    });
  },
};

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
  // Per-figure positions: FX[f], FY[f], FZ[f] for figure f
  let FX = [], FY = [], FZ = [], nShellNow = 0, building = null; // building: { f, it, gen } in progress
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
    // Figure positions: shell dots take each figure's shape, loose dots stay where they are
    // Every figure, the first included, is built in idle slices; draw() finishes one at once if it is needed sooner.
    FX = []; FY = []; FZ = []; nShellNow = nShell; building = null;
    prebuild(0);
    buf = kinds.map((k) => k.alpha.map(() => new Float32Array(n * 2)));
    len = kinds.map((k) => k.alpha.map(() => 0));
    fullClear = true;
  }

  function storeFigure(f, pts) {
    const fx = new Float32Array(n), fy = new Float32Array(n), fz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < nShellNow) { fx[i] = pts[i * 3]; fy[i] = pts[i * 3 + 1]; fz[i] = pts[i * 3 + 2]; }
      else { fx[i] = X[i]; fy[i] = Y[i]; fz[i] = Z[i]; }
    }
    FX[f] = fx; FY[f] = fy; FZ[f] = fz;
  }

  // Needed now: finish it at once (continuing a build already under way).
  function ensureFigure(f) {
    if (FX[f]) return;
    const it = building && building.f === f ? building.it : FIGURES[SPHERE.figures[f]](nShellNow);
    if (building && building.f === f) building = null;
    storeFigure(f, runAll(it));
  }

  // Build the next figure while the current one holds, a few milliseconds per idle slice.
  function prebuild(f) {
    if (FX[f] || building) return;
    const job = { f, it: FIGURES[SPHERE.figures[f]](nShellNow) };
    building = job;
    const idle = window.requestIdleCallback
      ? (fn) => requestIdleCallback(fn, { timeout: 500 })
      : (fn) => setTimeout(() => fn({ timeRemaining: () => 4 }), 50);
    const step = (deadline) => {
      if (building !== job) return;           // finished elsewhere, or the dot count changed
      const until = performance.now() + Math.min(6, Math.max(2, deadline.timeRemaining()));
      while (performance.now() < until) {
        const r = job.it.next();
        if (r.done) { building = null; storeFigure(f, r.value); return; }
      }
      idle(step);
    };
    idle(step);
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
    let u = -1, fig = 0;
    if (assembled && !reduced) {
      const into = simTime - cycleFrom;
      fig = Math.floor(into / cycleMs) % SPHERE.figures.length;
      const c = into % cycleMs;
      if (c >= SPHERE.holdMs) u = c - SPHERE.holdMs;
    }
    const bursting = u >= 0;
    const free = assembling || bursting; // dots drawn one by one, anywhere on the canvas
    let lastFill = -1;                    // set the fill color only when it changes

    if (free || fullClear) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fullClear = free;
    } else {
      ctx.clearRect(clearBox[0], clearBox[1], clearBox[2], clearBox[3]);
    }
    const reformAt = SPHERE.burstMs + SPHERE.burstDelayMaxMs + SPHERE.hangMs;
    // While the dust is out, the figure underneath morphs into the next one
    const next = (fig + 1) % SPHERE.figures.length;
    const morph = u < 0 ? 0
      : easeInOutCubic(Math.min(1, Math.max(0, (u - SPHERE.burstMs * 0.5) / (reformAt - SPHERE.burstMs * 0.5))));
    ensureFigure(fig);
    if (u < 0) { if (assembled && !reduced) prebuild(next); } else ensureFigure(next);
    const ax = FX[fig], ay = FY[fig], az = FZ[fig], bx = FX[next] || ax, by = FY[next] || ay, bz = FZ[next] || az;
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
      let x = ax[i], y = ay[i], z = az[i];
      if (morph > 0) { x += (bx[i] - x) * morph; y += (by[i] - y) * morph; z += (bz[i] - z) * morph; }
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
        const fs = kind === CHAMP ? 1 : 0;
        if (fs !== lastFill) { ctx.fillStyle = solid[fs]; lastFill = fs; }
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
        const fs = kind === CHAMP ? 1 : 0;
        if (fs !== lastFill) { ctx.fillStyle = solid[fs]; lastFill = fs; }
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
