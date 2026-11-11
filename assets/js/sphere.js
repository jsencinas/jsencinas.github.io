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
  shell:     { edges: [-0.6, -0.2, 0.2, 0.6, 0.85], alpha: [0.18, 0.26, 0.38, 0.56, 0.74, 0.88], size: [1.1, 1.2, 1.5, 1.8, 2.1, 2.3] },
  loose:     { edges: [0],                    alpha: [0.12, 0.26],                   size: [1.0, 1.3] },
  champagne: { edges: [-0.2, 0.2, 0.6],       alpha: [0.32, 0.55, 0.80, 1.00],       size: [1.7, 2.1, 2.5, 2.7] },

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

  // Compositions: after each burst the dust rebuilds the sphere with the next one, then the list repeats.
  // dots: even scatter · parallels: latitude rings · meridians: pole-to-pole lines
  // geodesic: the edges of a subdivided icosahedron · voxel: the sphere snapped to a coarse 3D grid
  figures: ['dots', 'parallels', 'meridians', 'geodesic', 'voxel'],
  parallels: { rings: 13, maxLatDeg: 78 },
  meridians: { lines: 14, maxLatDeg: 84 },
  geodesic: { frequency: 2 },
  voxel: { dotsPerCell: 2 },              // stacked dots make each grid cell read as one brighter pixel

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

/* ---------- Compositions ----------
   Each returns m points on the unit sphere as a flat [x, y, z, ...] array. */

// Spread m dots along several curves (each a function of t in 0..1) at even spacing by length.
function alongCurves(curves, m) {
  const steps = Math.max(16, Math.round(1200 / curves.length));
  const tables = curves.map((f) => {
    const cum = [0];
    let prev = f(0);
    for (let k = 1; k <= steps; k++) {
      const q = f(k / steps);
      cum.push(cum[k - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]));
      prev = q;
    }
    return cum;
  });
  const total = tables.reduce((s, c) => s + c[steps], 0);
  const counts = tables.map((c) => Math.floor((c[steps] / total) * m));
  for (let left = m - counts.reduce((s, c) => s + c, 0), k = 0; left > 0; left--, k = (k + 1) % counts.length) counts[k]++;
  const out = new Float32Array(m * 3);
  let i = 0;
  curves.forEach((f, c) => {
    const cum = tables[c], len = cum[steps];
    let k = 0;
    for (let j = 0; j < counts[c]; j++, i++) {
      const target = ((j + 0.5) / counts[c]) * len;
      while (k < steps - 1 && cum[k + 1] < target) k++;
      const t = (k + (target - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k])) / steps;
      const q = f(t);
      out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
    }
  });
  return out;
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

const FIGURES = {
  dots(m) {
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      const y = 1 - ((i + 0.5) / m) * 2, r = Math.sqrt(1 - y * y), th = i * GOLDEN;
      out[i * 3] = Math.cos(th) * r; out[i * 3 + 1] = y; out[i * 3 + 2] = Math.sin(th) * r;
    }
    return out;
  },
  parallels(m) {
    const { rings, maxLatDeg } = SPHERE.parallels, curves = [];
    for (let k = 0; k < rings; k++) {
      const lat = (-maxLatDeg + (2 * maxLatDeg * k) / (rings - 1)) * Math.PI / 180;
      const y = Math.sin(lat), r = Math.cos(lat), off = k * 0.37;
      curves.push((t) => [r * Math.cos(TAU * (t + off)), y, r * Math.sin(TAU * (t + off))]);
    }
    return alongCurves(curves, m);
  },
  meridians(m) {
    const { lines, maxLatDeg } = SPHERE.meridians, top = maxLatDeg * Math.PI / 180, curves = [];
    for (let k = 0; k < lines; k++) {
      const lon = (k / lines) * TAU;
      curves.push((t) => { const lat = -top + 2 * top * t, r = Math.cos(lat); return [r * Math.cos(lon), Math.sin(lat), r * Math.sin(lon)]; });
    }
    return alongCurves(curves, m);
  },
  geodesic(m) {
    // Icosahedron, each face split `frequency` times, edges bent onto the sphere
    const g = (1 + Math.sqrt(5)) / 2;
    const V = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g],
      [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(norm);
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
      [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const n = SPHERE.geodesic.frequency, seen = new Set(), curves = [];
    const key = (p) => p.map((v) => v.toFixed(4)).join(',');
    for (const [a, b, c] of F) {
      // grid points of the face: P(i, j) = a + (b - a) i/n + (c - a) j/n
      const P = (i, j) => [0, 1, 2].map((d) => V[a][d] + (V[b][d] - V[a][d]) * i / n + (V[c][d] - V[a][d]) * j / n);
      for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
        for (const [di, dj] of [[1, 0], [0, 1], [-1, 1]]) {
          const i2 = i + di, j2 = j + dj;
          if (i2 < 0 || j2 < 0 || i2 + j2 > n) continue;
          const p = P(i, j), q = P(i2, j2), id = [key(norm(p)), key(norm(q))].sort().join('|');
          if (seen.has(id)) continue;
          seen.add(id);
          curves.push((t) => norm([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]));
        }
      }
    }
    return alongCurves(curves, m);
  },
  voxel(m) {
    // Grid points whose cell the sphere's surface passes through; the spacing is searched so the count fits m
    const cells = (h) => {
      const pts = [], k = Math.ceil(1 / h) + 1;
      for (let x = -k; x <= k; x++) for (let y = -k; y <= k; y++) for (let z = -k; z <= k; z++) {
        const d = Math.hypot(x, y, z) * h;
        if (Math.abs(d - 1) <= h * 0.5) pts.push([x * h, y * h, z * h]);
      }
      return pts;
    };
    const want = Math.max(1, Math.floor(m / SPHERE.voxel.dotsPerCell));
    const h0 = Math.sqrt((4 * Math.PI) / want);    // about one cell per h0² of surface
    let lo = h0 * 0.6, hi = h0 * 1.6, pts = null;
    for (let it = 0; it < 10; it++) {
      const mid = (lo + hi) / 2, c = cells(mid);
      if (c.length >= want) { lo = mid; pts = c; } else hi = mid;
    }
    if (!pts) pts = cells(lo);
    // dots fill the cells round-robin, so every cell gets dotsPerCell (a few get one fewer)
    const out = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) { const q = pts[i % pts.length]; out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2]; }
    return out;
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
  let FX = [], FY = [], FZ = [], nShellNow = 0, prebuildQueued = false;
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
    // Only the first is built now; the others are built in idle time just before they are needed.
    FX = []; FY = []; FZ = []; nShellNow = nShell;
    ensureFigure(0);
    buf = kinds.map((k) => k.alpha.map(() => new Float32Array(n * 2)));
    len = kinds.map((k) => k.alpha.map(() => 0));
    fullClear = true;
  }

  function ensureFigure(f) {
    if (FX[f]) return;
    const fx = new Float32Array(n), fy = new Float32Array(n), fz = new Float32Array(n);
    const pts = FIGURES[SPHERE.figures[f]](nShellNow);
    for (let i = 0; i < n; i++) {
      if (i < nShellNow) { fx[i] = pts[i * 3]; fy[i] = pts[i * 3 + 1]; fz[i] = pts[i * 3 + 2]; }
      else { fx[i] = X[i]; fy[i] = Y[i]; fz[i] = Z[i]; }
    }
    FX[f] = fx; FY[f] = fy; FZ[f] = fz;
  }

  // Build the next figure while the current one holds, in idle time where the browser offers it.
  function prebuild(f) {
    if (FX[f] || prebuildQueued) return;
    prebuildQueued = true;
    const run = () => { prebuildQueued = false; ensureFigure(f); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 200);
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
