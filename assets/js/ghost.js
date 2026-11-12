/* =====================================================================
   ghost.js: a 2D ASCII ghost living in a small terminal window next to
   the statement (an original design). It drifts and leans, bobs with a
   little squash, ripples its hem, looks around and blinks, and plays a
   rotating set of moves (hops, a loop, a shiver, a "boo", a wobble) while a
   band of light runs across it. A ring of accent characters cycles
   around its outline.

   Rendering: each row of the ghost is built as a string and drawn with one
   fillText per row and color (never one call per character); only the cells
   around the ghost are worked out.
   About 24 fps, devicePixelRatio capped, paused off screen and in hidden
   tabs, still frame with reduced motion.
   ===================================================================== */

/* ---------- VISUAL CONSTANTS ---------- */
const GHOST = {
  ramp: ' .:-=+*x%#$@',     // dark to bright
  rimRamp: '-=+=',          // the accent ring cycles through these
  cellPx: 7,                // font size: small cells, so the ghost has enough of them to read clearly
  cellPxSmall: 7,
  smallBelow: 300,          // screen widths (px) under this use the small font
  lineHeight: 1.2,
  size: 0.3,                // ghost radius as a share of the screen's smaller side
  // motion (all in ms or ghost radii)
  driftMs: 7400, driftAmp: 0.7,       // left and right across the screen
  bobMs: 1700, bobAmp: 0.1,
  squash: 0.06,                       // squash at the bottom of each bob
  leanMax: 0.22,                      // leans into its drift
  hemMs: 1300, hemBumps: 3.5, hemDepth: 0.13,
  lookMs: 2100,                       // a new place to look
  blinkMs: 3900, blinkDur: 170,
  sweepMs: 2600,                      // the band of light
  rimCells: 1.4, rimSpeed: 3,         // ring width in cells, and how fast its characters cycle
  // eyes, in ghost radii from the center
  eyeX: 0.38, eyeY: -0.12, eyeW: 0.22, eyeH: 0.3, pupil: 0.11, pupilReach: 0.09,
  fps: 24,
  dprMax: 1.5,
  textRGB: [243, 241, 236],
  accentRGB: [217, 199, 160],
};
const LOOKS = [[0, 0], [1, 0.2], [1, -0.3], [0, 0.4], [-1, 0], [-0.8, -0.5], [0, 0]];
// Moves played in turn on top of the drift, each fading in and out smoothly.
const MOVES = ['rest', 'hops', 'rest', 'loop', 'shiver', 'rest', 'boo', 'wobble'];
const MOVE_MS = 3200;
/* -------------------------------------- */

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

export function initGhost(canvas) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  const G = GHOST;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;

  let w = 0, h = 0, dpr = 1, cw = 0, chH = 0, cols = 0, rows = 0, font = '';
  const bodyFill = `rgba(${GHOST.textRGB.join(',')},0.9)`, rimFill = `rgba(${GHOST.accentRGB.join(',')},0.85)`;
  let raf = 0, last = 0, time = 0, onScreen = false;

  function layout(width, height) {
    w = width; h = height;
    dpr = Math.min(window.devicePixelRatio || 1, G.dprMax);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const px = w < G.smallBelow ? G.cellPxSmall : G.cellPx;
    const fam = getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace';
    font = `400 ${px * dpr}px ${fam}`;
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    cw = m.measureText('M').width / dpr;
    chH = px * G.lineHeight;
    cols = Math.floor(w / cw); rows = Math.floor(h / chH);
  }

  function state(t) {
    const R = Math.min(w, h) * G.size;
    const driftP = TAU * t / G.driftMs;
    const drift = Math.sin(driftP), vel = Math.cos(driftP);
    const bob = Math.sin(TAU * t / G.bobMs);
    // the current move and how strongly it shows (0 at its start and end, 1 in the middle)
    const mi = Math.floor(t / MOVE_MS), mt = (t % MOVE_MS) / MOVE_MS;
    const move = MOVES[mi % MOVES.length], env = Math.sin(Math.PI * mt) ** 2;
    let mx = 0, my = 0, grow = 0, wob = 0, hop = 0, wide = 0;
    if (move === 'hops') { hop = Math.abs(Math.sin(Math.PI * mt * 3)) * env; my = -0.35 * hop; }
    else if (move === 'loop') { const a = TAU * mt; mx = 0.45 * Math.sin(a) * env; my = -0.3 * (1 - Math.cos(a)) * env; }
    else if (move === 'shiver') { mx = 0.05 * Math.sin(TAU * t / 90) * env; wide = env; }
    else if (move === 'boo') { grow = 0.16 * Math.sin(Math.PI * Math.min(1, mt * 1.6)) ** 2; wide = grow / 0.16; }
    else if (move === 'wobble') { wob = 0.45 * Math.sin(TAU * mt * 4) * env; }
    const maxX = Math.max(0, w / 2 - R * 1.7);   // keeps the ghost, its lean and its ring inside the screen
    const n = t / G.lookMs, k = Math.floor(n), f = smooth(Math.min(1, (n - k) * 3));
    const a = LOOKS[k % LOOKS.length], b = LOOKS[(k + 1) % LOOKS.length];
    const bt = t % G.blinkMs;
    return {
      R: R * (1 + grow),
      x: Math.max(R * 1.7, Math.min(w - R * 1.7, w / 2 + Math.min(maxX, R * G.driftAmp * 1.6) * drift + mx * R)),
      y: h * 0.5 - R * (G.bobAmp * bob * (1 - wide) - my),
      squash: G.squash * Math.max(0, -bob) * (1 - hop) - 0.06 * hop,   // squashes low, stretches in a hop
      lean: G.leanMax * vel * (1 - env * 0.6) + wob,
      hem: TAU * t / G.hemMs,
      lookX: ((a[0] + (b[0] - a[0]) * f) * 0.6 + vel * 0.4) * (1 - wide),   // wide eyes stare straight ahead
      lookY: (a[1] + (b[1] - a[1]) * f) * (1 - wide),
      wide,
      open: bt < G.blinkDur ? Math.abs(1 - 2 * bt / G.blinkDur) * 0.85 + 0.15 : 1,
      sweep: (t % G.sweepMs) / G.sweepMs,
      t,
    };
  }

  function draw() {
    if (!w || !font) return;
    const s = state(reduced ? 1200 : time);
    const nRamp = G.ramp.length, rimW = (G.rimCells * cw) / s.R;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const body = [], rim = [];
    // only the cells around the ghost
    const c0 = Math.max(0, Math.floor((s.x - s.R * 1.6) / cw)), c1 = Math.min(cols - 1, Math.ceil((s.x + s.R * 1.6) / cw));
    const r0 = Math.max(0, Math.floor((s.y - s.R * 1.6) / chH)), r1 = Math.min(rows - 1, Math.ceil((s.y + s.R * 1.6) / chH));
    for (let r = r0; r <= r1; r++) {
      body.length = 0; rim.length = 0;
      let anyBody = false, anyRim = false;
      for (let c = c0; c <= c1; c++) {
        // cell center in ghost space: v grows downward; lean shears the body, squash widens it
        let v = ((r + 0.5) * chH - s.y) / s.R;
        let u = ((c + 0.5) * cw - s.x) / s.R;
        v /= 1 - s.squash; u /= 1 + s.squash * 0.8;
        u -= s.lean * (v + 0.2);
        // distance inside the outline (negative outside), in ghost radii
        const hemV = 0.95 + G.hemDepth * Math.sin(u * Math.PI * G.hemBumps + s.hem);
        let d;
        if (v < -0.15) d = 1 - Math.hypot(u, v + 0.15);
        else d = Math.min(1 - Math.abs(u), hemV - v);
        let glyph = -1, row = 0;
        if (d > 0) {
          // eyes: dark sockets with a bright pupil that looks around
          let inEye = false, inPupil = false;
          for (const side of [-1, 1]) {
            const ex = u - side * G.eyeX, ey = (v - G.eyeY) / s.open, k = 1 + 0.25 * s.wide;
            if ((ex / (G.eyeW * k)) ** 2 + (ey / (G.eyeH * k)) ** 2 < 1) {
              inEye = true;
              const px = ex - s.lookX * G.pupilReach, py = ey - s.lookY * G.pupilReach;
              if (px * px + py * py < G.pupil * G.pupil && s.open > 0.5) inPupil = true;
            }
          }
          if (inPupil) glyph = nRamp - 1;
          else if (!inEye) {
            // brighter toward the middle and the upper left, plus a band of light running across
            // a mostly solid fill: bright inside, tapering only near the edge
            const depth = Math.min(1, d * 6);
            const light = 0.78 + 0.12 * (-u * 0.5 - v * 0.5);
            const band = Math.exp(-(((u + v) * 0.7 - (s.sweep * 4 - 2)) ** 2) * 8) * 0.25;
            const b = Math.max(0, Math.min(1, depth * light + band));
            glyph = Math.max(1, Math.min(nRamp - 1, Math.round(b * (nRamp - 1))));
          }
        } else if (d > -rimW) {
          // the ring: characters cycle around the outline
          const ang = Math.atan2(v, u);
          glyph = nRamp + Math.abs(Math.floor(ang * 3 + s.t / 1000 * G.rimSpeed)) % G.rimRamp.length;
          row = 1;
        }
        const ch = glyph > 0 ? (row ? G.rimRamp[glyph - nRamp] : G.ramp[glyph]) : ' ';
        body.push(row || glyph <= 0 ? ' ' : ch);
        rim.push(row ? ch : ' ');
        if (glyph > 0) { if (row) anyRim = true; else anyBody = true; }
      }
      const x = c0 * cw * dpr, y = (r + 0.5) * chH * dpr;
      if (anyBody) { ctx.fillStyle = bodyFill; ctx.fillText(body.join(''), x, y); }
      if (anyRim) { ctx.fillStyle = rimFill; ctx.fillText(rim.join(''), x, y); }
    }
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

  const start = () => {
    new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect;
      layout(r.width, r.height);
      draw();
    }).observe(canvas);
    new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; sync(); }).observe(canvas);
    document.addEventListener('visibilitychange', sync);
    reducedMq.addEventListener('change', (e) => { reduced = e.matches; sync(); draw(); });
  };
  // the characters need the mono font loaded
  if (document.fonts && document.fonts.load) document.fonts.load('400 12px "Geist Mono"').then(start, start);
  else start();
}
