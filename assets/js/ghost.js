/* =====================================================================
   ghost.js: a 2D ASCII ghost living in a small terminal window next to
   the statement (an original design).

   Motion is physical rather than scripted: the ghost floats toward
   targets on springs, so it speeds up, slows down and overshoots a little.
   Its body leans into the motion and its lower half trails behind and
   swings back when it stops.

   It plays a rotating set of small scenes, most of them with a face:
     boo     crouch, pop up, wide eyes and an open mouth
     happy   eyes squeeze into arcs, a smile, a few little hops
     wink    one eye closes, head tilted
     sleepy  lids droop, it sinks, z's float up, then it wakes with a start
     dizzy   a few fast loops, then spiral eyes and a wobble
     vanish  dissolves, reappears somewhere else, surprised
     dash    narrowed eyes and a wind-up, a dash across, a look back
   plus calm ones in between (float somewhere, look around, sink and rise).
   Eyes dart to where it is going, it blinks at random, the hem ripples
   faster when it moves, and it sheds faint specks behind it.

   Drawing: the shape is worked out per character cell around the ghost
   only. Body cells take a character by brightness; cells just outside the
   body take an outline character by the edge direction ( / - \ ( ) ~ ).
   Each row is one fillText per color (never one call per character).
   About 30 fps, devicePixelRatio capped, paused off screen and in hidden
   tabs, still frame with reduced motion.
   ===================================================================== */

/* ---------- VISUAL CONSTANTS ---------- */
const GHOST = {
  ramp: ' .:-=+*o#%$@',     // body, dark to bright
  cellPx: 7,                // font size
  lineHeight: 1.2,
  size: 0.27,               // ghost radius as a share of the screen's smaller side
  fps: 30,
  dprMax: 1.5,
  // idle life
  bobMs: 2600, bobAmp: 0.06, breathe: 0.015,
  hemMs: 1400, hemBumps: 3.5, hemDepth: 0.1,
  // body response to motion (velocity is in ghost radii per second)
  width: 0.85,                      // body width against its height (1 is as wide as tall)
  lean: 0.11, leanMax: 0.24,        // radians of lean per unit of speed
  tail: 0.26, tailMax: 0.42,        // how far the lower half trails
  stretch: 0.06, stretchMax: 0.12,  // vertical stretch while moving up or down
  // face, in ghost radii from the center
  eyeX: 0.36, eyeY: -0.18, eyeW: 0.17, eyeH: 0.26, lookReach: [0.15, 0.09],
  blinkMin: 2400, blinkMax: 6000, blinkMs: 150, doubleBlink: 0.18,
  // specks shed from the hem
  speckRate: 1.5, speckRateMoving: 7, speckLife: [900, 1600],
  textRGB: [243, 241, 236],
  accentRGB: [217, 199, 160],
};
// How often each scene is picked (never the same one twice in a row).
const WEIGHTS = {
  wander: 2.5, look: 1.2, dip: 0.8,
  boo: 1.4, happy: 1.4, wink: 1, sleepy: 1, dizzy: 1.1, vanish: 1.2, dash: 1.3,
};
// Expressions, each eased by a spring: [stiffness, damping ratio]
const FACE_SPRINGS = {
  wide: [90, 0.55], grow: [45, 0.35], happy: [70, 0.8], angry: [70, 0.8], lid: [9, 1],
  dizzy: [40, 0.8], fade: [10, 1], wink: [140, 0.9], tilt: [30, 0.55],
};
const NEUTRAL = { wide: 0, grow: 0, happy: 0, angry: 0, lid: 0, dizzy: 0, fade: 1, wink: 0, tilt: 0 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => b / 16 - 0.47);
/* -------------------------------------- */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);

// A damped spring: s.x moves toward target; k is stiffness, z the damping ratio (<1 overshoots).
function spring(s, target, k, z, dt) {
  s.v += (k * (target - s.x) - 2 * z * Math.sqrt(k) * s.v) * dt;
  s.x += s.v * dt;
}

// Outline character for an outward edge direction (degrees, screen coordinates, y down).
function edgeGlyph(a) {
  if (a > 35 && a < 145) return '~';           // the hem
  if (a >= -22.5 && a <= 35) return ')';
  if (a >= 145 || a <= -157.5) return '(';
  if (a > -67.5) return '\\';                 // upper right
  if (a > -112.5) return '-';                  // top
  return '/';                                  // upper left
}

export function initGhost(canvas) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  const G = GHOST;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;

  let w = 0, h = 0, dpr = 1, cw = 0, chH = 0, cols = 0, rows = 0, font = '';
  let R = 0, bx = 0, by = 0;   // ghost radius in px; how far it may travel, in radii
  const bodyFill = `rgba(${G.textRGB.join(',')},0.9)`;
  const edgeFill = `rgba(${G.accentRGB.join(',')},0.85)`;
  const speckFill = `rgba(${G.textRGB.join(',')},0.4)`;
  const zFill = `rgba(${G.accentRGB.join(',')},0.7)`;
  let raf = 0, last = 0, onScreen = false;

  /* ---------- simulation state (positions in ghost radii from the screen center) ---------- */
  const S = () => ({ x: 0, v: 0 });
  const px = S(), py = S(), lookX = S(), lookY = S(), lean = S(), tail = S(), stretch = S();
  const face = {}, faceT = { ...NEUTRAL };
  for (const key in NEUTRAL) face[key] = { x: NEUTRAL[key], v: 0 };
  let time = 0, hemPhase = 0;
  let tx = 0, ty = 0, k = 5, z = 0.8, lookT = null, step = {}, stepStart = 0;
  let steps = [{ ms: 900 }], stepEnd = 0, lastName = '';
  let idleLook = [0, 0], idleLookAt = 0, nextBlink = 1800, blinkAt = -1e9, speckDebt = 0, nextZ = 0;
  let ox0 = 0, oy0 = 0;   // where an orbit or sway is centered
  const specks = [];

  function somewhere(minDist) {
    for (let i = 0; i < 10; i++) {
      const x = rand(-bx, bx), y = rand(-by, by);
      if (Math.hypot(x - px.x, y - py.x) >= minDist) return [x, y];
    }
    return [-px.x, -py.x];
  }
  // Each scene is a list of steps: where to go (to), how springy (k, z), where to look,
  // which expression to ease toward (face), and for how long (ms).
  const PLANS = {
    wander: () => [
      { to: somewhere(0.6), k: 5, z: 0.8, look: 'travel', ms: rand(2000, 2800) },
      { ms: rand(500, 1100) },
    ],
    look: () => {
      const s = Math.random() < 0.5 ? -1 : 1;
      return [
        { look: [s, 0.15], face: { tilt: s * 0.08 }, ms: 750 },
        { look: [-s, 0.1], face: { tilt: -s * 0.08 }, ms: 850 },
        { look: [0, -0.4], face: { tilt: 0 }, ms: 500 },
      ];
    },
    dip: () => [
      { to: [px.x, by], k: 2.5, z: 1, look: [0, 0.7], ms: 1900 },
      { to: [px.x, -by * 0.3], k: 6, z: 0.6, look: 'travel', ms: 1500 },
    ],
    boo: () => {
      const x = px.x, y = clamp(py.x, -by * 0.3, by);
      return [
        { to: [x, y + 0.12], k: 12, z: 1, look: [0, 0], ms: 320 },            // crouch
        { to: [x, y - 0.3], k: 14, z: 0.45, look: [0, 0], face: { wide: 1, grow: 1 }, ms: 1000 },
        { to: [x, y], k: 5, z: 0.8, face: { wide: 0, grow: 0 }, ms: 800 },
      ];
    },
    happy: () => {
      const x = px.x, y = clamp(py.x, -by * 0.5, by), hops = [];
      for (let i = 0; i < 3; i++) {
        const side = i % 2 ? 1 : -1;
        hops.push({ to: [x + side * 0.08, y - 0.2], k: 40, z: 0.55, look: [0, -0.2], ms: 210 });
        hops.push({ to: [x, y], k: 40, z: 0.55, look: [0, -0.2], face: { tilt: side * 0.1 }, ms: 210 });
      }
      return [
        { face: { happy: 1 }, look: [0, -0.2], ms: 350 },
        ...hops,
        { face: { tilt: 0 }, look: [0, -0.2], ms: 700 },
        { face: { happy: 0 }, ms: 400 },
      ];
    },
    wink: () => [
      { look: [0.6, -0.1], face: { tilt: 0.12 }, ms: 300 },
      { look: [0.6, -0.1], face: { wink: 1 }, ms: 520 },
      { face: { wink: 0, tilt: 0 }, ms: 500 },
    ],
    sleepy: () => {
      const x = px.x, y = clamp(py.x, -by, by * 0.4);
      return [
        { face: { lid: 0.55 }, look: [0, 0.3], ms: 900, noBlink: true },
        { to: [x, y + 0.18], k: 1.5, z: 1, face: { lid: 0.95, tilt: 0.1 }, look: [0, 0.4], ms: 2600, zzz: true, noBlink: true },
        { to: [x, y - 0.28], k: 16, z: 0.45, snap: { lid: 0 }, face: { lid: 0, wide: 1, grow: 0.5, tilt: 0 }, look: [0, 0], ms: 700 },  // wakes with a start
        { face: { wide: 0, grow: 0 }, look: [-0.8, 0], ms: 450 },
        { look: [0.8, 0], ms: 450 },
      ];
    },
    dizzy: () => {
      const x = clamp(px.x, -bx + 0.35, bx - 0.35), y = clamp(py.x, -by + 0.2, by - 0.2);
      return [
        { to: [x, y], k: 8, z: 0.8, ms: 400 },
        { orbit: [Math.min(0.35, bx), 650], center: [x, y], k: 30, z: 0.7, look: [0, 0], ms: 1950 },
        { to: [x, y], sway: [0.12, 900], center: [x, y], k: 12, z: 0.6, face: { dizzy: 1 }, ms: 2200, noBlink: true },
        { to: [x, y], face: { dizzy: 0 }, ms: 500 },
      ];
    },
    vanish: () => [
      { look: [0, 0.2], face: { fade: 0 }, ms: 1100 },
      { teleport: somewhere(0.9), face: { fade: 1 }, ms: 250 },
      { face: { wide: 1 }, look: [rand(-1, 1), 0], ms: 650 },
      { face: { wide: 0 }, ms: 400 },
    ],
    dash: () => {
      const side = px.x > 0 ? -1 : 1, y = rand(-by, by);
      return [
        { look: [side, 0], face: { angry: 1 }, ms: 450 },
        { to: [px.x - side * 0.15, py.x + 0.06], k: 20, z: 1, look: [side, 0], ms: 300 },   // wind-up
        { to: [side * bx, y], k: 14, z: 0.55, look: 'travel', ms: 1400 },
        { look: [-side * 0.8, 0.1], face: { angry: 0 }, ms: 800 },                       // a look back
      ];
    },
  };

  function nextBehavior() {
    const names = Object.keys(WEIGHTS).filter((n) => n !== lastName);
    let r = Math.random() * names.reduce((s, n) => s + WEIGHTS[n], 0);
    let name = names[names.length - 1];
    for (const n of names) { r -= WEIGHTS[n]; if (r <= 0) { name = n; break; } }
    lastName = name;
    Object.assign(faceT, NEUTRAL);
    steps = PLANS[name]();
  }
  function runStep(s) {
    step = s; stepStart = time;
    if (s.to) { tx = clamp(s.to[0], -bx, bx); ty = clamp(s.to[1], -by, by); }
    if (s.center) { ox0 = s.center[0]; oy0 = s.center[1]; }
    if (s.teleport) {
      burst(14);
      px.x = tx = clamp(s.teleport[0], -bx, bx); py.x = ty = clamp(s.teleport[1], -by, by);
      px.v = py.v = 0; lean.x = lean.v = tail.x = tail.v = 0;
    }
    k = s.k || 5; z = s.z || 0.8;
    lookT = s.look || null;
    if (s.face) Object.assign(faceT, s.face);
    if (s.snap) for (const key in s.snap) { face[key].x = s.snap[key]; face[key].v = 0; }
    stepEnd = time + s.ms;
  }

  function addSpeck(x, y, vx, vy, glyph) {
    const life = glyph ? 1600 : rand(G.speckLife[0], G.speckLife[1]);
    specks.push({ x, y, vx, vy, life, left: life, glyph });
  }
  function burst(n) {   // specks fly out from the body
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), [sx0, sy0] = toScreen(Math.cos(a) * 0.7, Math.sin(a) * 0.7);
      addSpeck(sx0, sy0, Math.cos(a) * rand(0.4, 0.9) * R, Math.sin(a) * rand(0.4, 0.9) * R);
    }
  }

  function update(dt) {
    time += dt * 1000;
    if (time >= stepEnd) { if (!steps.length) nextBehavior(); runStep(steps.shift()); }
    const st = time - stepStart;
    if (step.orbit) {            // loops around a center
      const [r, per] = step.orbit, a = TAU * st / per;
      tx = clamp(ox0 + r * Math.sin(a), -bx, bx); ty = clamp(oy0 + r * 0.6 * Math.cos(a), -by, by);
    } else if (step.sway) {      // a woozy side to side
      const [amp, per] = step.sway;
      tx = ox0 + amp * Math.sin(TAU * st / per); ty = oy0 + amp * 0.4 * Math.sin(2 * TAU * st / per);
    }
    spring(px, tx, k, z, dt);
    spring(py, ty, k, z, dt);

    let lt;
    if (lookT === 'travel') {   // eyes lead toward where it is going, then settle
      const dx = tx - px.x, dy = ty - py.x, m = Math.hypot(dx, dy) || 1, s = Math.min(1, m * 2) / m;
      lt = [dx * s, dy * s * 0.6];
    } else if (lookT) lt = lookT;
    else {
      if (time >= idleLookAt) {
        idleLook = Math.random() < 0.35 ? [0, 0] : [rand(-0.6, 0.6), rand(-0.4, 0.4)];
        idleLookAt = time + rand(700, 2000);
      }
      lt = idleLook;
    }
    spring(lookX, lt[0], 260, 0.9, dt);
    spring(lookY, lt[1], 260, 0.9, dt);
    for (const key in face) spring(face[key], faceT[key], FACE_SPRINGS[key][0], FACE_SPRINGS[key][1], dt);
    // the body lags behind the motion: lean and stretch settle quickly, the tail swings
    spring(lean, clamp(px.v * G.lean, -G.leanMax, G.leanMax) + face.tilt.x, 40, 0.7, dt);
    spring(tail, clamp(-px.v * G.tail, -G.tailMax, G.tailMax), 22, 0.35, dt);
    spring(stretch, clamp(Math.abs(py.v) * G.stretch, 0, G.stretchMax), 60, 0.5, dt);
    hemPhase += dt * (TAU * 1000 / G.hemMs + 3 * px.v);   // waves run backward faster while moving

    if (time >= nextBlink) {
      if (!step.noBlink) blinkAt = time;
      nextBlink = time + (Math.random() < G.doubleBlink ? 260 : rand(G.blinkMin, G.blinkMax));
    }

    // specks drift off the hem and fade; z's rise while it sleeps
    if (R && face.fade.x > 0.5) {
      speckDebt += dt * (G.speckRate + G.speckRateMoving * Math.min(1, Math.hypot(px.v, py.v) / 2));
      while (speckDebt >= 1) {
        speckDebt -= 1;
        const [sx0, sy0] = toScreen(rand(-0.85, 0.85), 1.0);
        addSpeck(sx0, sy0, (-px.v * 0.3 + rand(-0.15, 0.15)) * R, rand(0.1, 0.35) * R);
      }
    }
    if (step.zzz && time >= nextZ) {
      nextZ = time + 650;
      const [sx0, sy0] = toScreen(0.55, -1.0);
      addSpeck(sx0, sy0, 0.25 * R, -0.35 * R, 'z');
    }
    if (face.fade.x < 0.9 && faceT.fade === 0 && Math.random() < 0.5) {   // dissolving
      const a = rand(0, TAU), [sx0, sy0] = toScreen(Math.cos(a) * 0.8, Math.sin(a) * 0.9);
      addSpeck(sx0, sy0, Math.cos(a) * 0.3 * R, -0.4 * R);
    }
    for (let i = specks.length - 1; i >= 0; i--) {
      const p = specks[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.left -= dt * 1000;
      if (p.left <= 0) specks.splice(i, 1);
    }
  }

  /* ---------- shape ---------- */
  let cx = 0, cy = 0, sx = 1, sy = 1, cosA = 1, sinA = 0, hemDepth = G.hemDepth;
  function pose() {
    const t = time;
    cx = w / 2 + px.x * R;
    cy = h / 2 + (py.x + G.bobAmp * Math.sin(TAU * t / G.bobMs)) * R;
    const sc = R * (1 + G.breathe * Math.sin(TAU * t / G.bobMs + 1)) * (1 + 0.14 * face.grow.x);
    sx = sc * G.width * (1 - 0.5 * stretch.x); sy = sc * (1 + stretch.x);
    cosA = Math.cos(lean.x); sinA = Math.sin(lean.x);
    hemDepth = G.hemDepth * (1 + 0.5 * Math.min(1, Math.abs(px.v)));
  }
  const tailShape = (v) => { const s = clamp((v + 0.2) / 1.15, 0, 1); return s * s; };
  // ghost space (u right, v down, in radii) to screen px
  function toScreen(u, v) {
    const uu = (u + tail.x * tailShape(v)) * sx, vv = v * sy;
    return [cx + uu * cosA - vv * sinA, cy + uu * sinA + vv * cosA];
  }
  function sdf(u, v) {   // distance inside the outline (negative outside), in radii
    if (v < -0.15) return 1 - Math.hypot(u, v + 0.15);
    const hemV = 0.95 + hemDepth * Math.sin(u * Math.PI * G.hemBumps + hemPhase);
    return Math.min(1 - Math.abs(u), hemV - v);
  }

  /* ---------- face: is this point (in eye units) part of the dark eye? ---------- */
  // ex, ey: position inside the eye, -1..1 across the socket; inner: 1 toward the nose
  function eyeDark(ex, ey, inner, f) {
    if (ex * ex + ey * ey >= 1) return false;
    if (f.happy > 0.5) return ex * ex + (ey - 0.75) ** 2 > 0.95 * 0.95 && ey < 0.1;   // an arc: ^
    if (ey < -1 + f.lid * 1.6) return false;                                             // drooping lid
    if (ey < -1 + f.angry * (0.9 + 0.7 * inner)) return false;                          // a slanted brow
    return true;
  }

  /* ---------- drawing ---------- */
  let D = new Float32Array(0), U = new Float32Array(0), V = new Float32Array(0);
  const body = [], edge = [];

  function layout(width, height) {
    w = width; h = height;
    dpr = Math.min(window.devicePixelRatio || 1, G.dprMax);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const fam = getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace';
    font = `400 ${G.cellPx * dpr}px ${fam}`;
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    cw = m.measureText('M').width / dpr;
    chH = G.cellPx * G.lineHeight;
    cols = Math.floor(w / cw); rows = Math.floor(h / chH);
    R = Math.min(w, h) * G.size;
    bx = Math.max(0, (w / 2 - R * 1.25) / R);
    by = Math.max(0, (h / 2 - R * 1.5) / R);
  }

  function draw() {
    if (!w || !font) return;
    pose();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const ext = Math.max(sx, sy) * 1.75;
    const c0 = Math.max(0, Math.floor((cx - ext) / cw)), c1 = Math.min(cols - 1, Math.ceil((cx + ext) / cw));
    const r0 = Math.max(0, Math.floor((cy - ext) / chH)), r1 = Math.min(rows - 1, Math.ceil((cy + ext) / chH));
    const W = c1 - c0 + 1, H = r1 - r0 + 1;
    if (W > 0 && H > 0) drawBody(c0, r0, W, H);

    // specks and z's, snapped to the character grid, skipped where the body is
    if (specks.length) {
      for (const p of specks) {
        const c = Math.floor(p.x / cw), r = Math.floor(p.y / chH);
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const ci = c - c0, ri = r - r0;
        if (face.fade.x > 0.5 && ci >= 0 && ci < W && ri >= 0 && ri < H && D[ri * W + ci] > -0.05) continue;
        const f = p.left / p.life;
        ctx.fillStyle = p.glyph ? zFill : speckFill;
        ctx.fillText(p.glyph ? (f > 0.55 ? 'z' : 'Z') : f > 0.5 ? '+' : '.', c * cw * dpr, (r + 0.5) * chH * dpr);
      }
    }
  }

  function drawBody(c0, r0, W, H) {
    if (D.length < W * H) { D = new Float32Array(W * H); U = new Float32Array(W * H); V = new Float32Array(W * H); }
    // pass 1: ghost-space coordinates and distance for every cell
    for (let r = 0; r < H; r++) {
      const Y = (r0 + r + 0.5) * chH - cy;
      for (let c = 0; c < W; c++) {
        const X = (c0 + c + 0.5) * cw - cx, i = r * W + c;
        const v = (-X * sinA + Y * cosA) / sy;
        const u = (X * cosA + Y * sinA) / sx - tail.x * tailShape(v);
        U[i] = u; V[i] = v; D[i] = sdf(u, v);
      }
    }

    // face
    const f = {};
    for (const key in face) f[key] = face[key].x;
    const bt = time - blinkAt;
    const blink = bt < G.blinkMs ? Math.max(0.08, Math.abs(1 - 2 * bt / G.blinkMs)) : 1;
    const ox = lookX.x * G.lookReach[0] * (1 - f.dizzy), oy = lookY.x * G.lookReach[1] * (1 - f.dizzy);
    const kw = 1 + 0.3 * f.wide;
    const ew = G.eyeW * kw, ehBase = G.eyeH * kw;
    const eyes = [-1, 1].map((side) => ({
      side, cx: side * G.eyeX + ox, cy: G.eyeY + oy,
      eh: ehBase * blink * (side === 1 ? Math.max(0.08, 1 - 0.92 * f.wink) : 1),
    }));
    // shines: one cell per eye; they circle when dizzy
    const glints = [];
    const showGlint = blink > 0.6 && f.happy < 0.5 && f.lid < 0.6 && f.angry < 0.5 && f.fade > 0.7;
    for (const e of eyes) {
      if (!showGlint || (e.side === 1 && f.wink > 0.4)) continue;
      let gu = ew * 0.3, gv = -e.eh * 0.4;
      if (f.dizzy > 0.3) { const a = time * 0.011 * e.side; gu = Math.cos(a) * ew * 0.55; gv = Math.sin(a) * e.eh * 0.55; }
      const [gx, gy] = toScreen(e.cx + gu, e.cy + gv);
      glints.push(Math.floor(gy / chH) * 100000 + Math.floor(gx / cw));
    }
    const mouthO = f.wide > 0.15, mw = 0.12 * f.wide, mh = 0.15 * f.wide;
    const smile = f.happy > 0.3, smw = 0.2 * f.happy, smh = 0.14 * f.happy;
    const nRamp = G.ramp.length, n1 = nRamp - 1;
    const fade = f.fade;

    // pass 2: pick a character per cell
    for (let r = 0; r < H; r++) {
      body.length = 0; edge.length = 0;
      let anyBody = false, anyEdge = false;
      for (let c = 0; c < W; c++) {
        const i = r * W + c, d = D[i];
        const dither = BAYER[((r0 + r) & 3) * 4 + ((c0 + c) & 3)];
        const shown = fade >= 1 || fade > dither + 0.5;   // dissolves cell by cell
        let b = ' ', e = ' ';
        if (d > 0 && shown) {
          const u = U[i], v = V[i];
          let dark = false, near = 9;   // near < 2: close to a socket (shaded)
          for (const eye of eyes) {
            const ex = (u - eye.cx) / ew, ey = (v - eye.cy) / eye.eh;
            const q = ex * ex + ((v - eye.cy) / ehBase) ** 2;
            if (q < near) near = q;
            if (eyeDark(ex, ey, -eye.side * ex, f)) dark = true;
          }
          if (mouthO && ((u - ox * 0.8) / mw) ** 2 + ((v - 0.33 - oy) / mh) ** 2 < 1) dark = true;
          if (smile && v > 0.2 + oy && ((u - ox * 0.8) / smw) ** 2 + ((v - 0.2 - oy) / smh) ** 2 < 1) dark = true;
          const cell = (r0 + r) * 100000 + c0 + c;
          if (glints.includes(cell)) b = '@';
          else if (!dark) {
            // brighter in the middle and to the upper left, darker around the eyes, dithered
            let lum = Math.min(1, d * 4.5) * (0.8 + 0.14 * (-0.55 * u - 0.45 * v));
            if (near < 2 && f.happy < 0.5) lum -= 0.25 * (2 - near);
            lum += dither * 0.9 / n1;
            b = G.ramp[clamp(Math.round(lum * n1), 1, n1)];
          }
          if (b !== ' ') anyBody = true;
        } else if (d <= 0 && shown && (
          (c > 0 && D[i - 1] > 0) || (c < W - 1 && D[i + 1] > 0) ||
          (r > 0 && D[i - W] > 0) || (r < H - 1 && D[i + W] > 0)
        )) {
          const gx = (c < W - 1 ? D[i + 1] : d) - (c > 0 ? D[i - 1] : d);
          const gy = (r < H - 1 ? D[i + W] : d) - (r > 0 ? D[i - W] : d);
          e = edgeGlyph(Math.atan2(-gy / chH, -gx / cw) * 180 / Math.PI);
          anyEdge = true;
        }
        body.push(b); edge.push(e);
      }
      const x = c0 * cw * dpr, y = (r0 + r + 0.5) * chH * dpr;
      if (anyBody) { ctx.fillStyle = bodyFill; ctx.fillText(body.join(''), x, y); }
      if (anyEdge) { ctx.fillStyle = edgeFill; ctx.fillText(edge.join(''), x, y); }
    }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / G.fps - 2) return;
    let dt = Math.min(now - last, 100) / 1000;
    last = now;
    while (dt > 0) { const s = Math.min(dt, 1 / 60); update(s); dt -= s; }
    draw();
  }
  function sync() {
    const run = !reduced && onScreen && document.visibilityState === 'visible';
    if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function still() {   // the reduced-motion frame: at rest, glancing to the side
    lookX.x = 0.4; lookY.x = 0.1;
    draw();
  }

  // For checking the scenes by hand: add ?ghost=dizzy (or any scene name) to the page URL.
  const forced = new URLSearchParams(location.search).get('ghost');
  if (forced && PLANS[forced]) for (const n in WEIGHTS) WEIGHTS[n] = n === forced ? 1 : 0;   // then it alternates with wander

  const start = () => {
    new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect;
      layout(r.width, r.height);
      if (reduced) still(); else draw();
    }).observe(canvas);
    new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; sync(); }).observe(canvas);
    document.addEventListener('visibilitychange', sync);
    reducedMq.addEventListener('change', (e) => { reduced = e.matches; sync(); if (reduced) still(); });
  };
  // the characters need the mono font loaded
  if (document.fonts && document.fonts.load) document.fonts.load('400 12px "Geist Mono"').then(start, start);
  else start();
}
