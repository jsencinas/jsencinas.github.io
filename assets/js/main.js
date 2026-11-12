/* =====================================================================
   main.js: intro, nav menu, caption resolve, clock, console greeting.
   Intro timings come from CSS custom properties (site.css, "intro").
   Sections below the hero live in page.js.
   ===================================================================== */
import { initSphere } from './sphere.js?v=20261112k';
import { initPage } from './page.js?v=20261112k';
import { prepareDecrypt, runDecrypt } from './decrypt.js?v=20261112k';

/* ---------- CAPTION RESOLVE CONSTANTS ---------- */
const RESOLVE = {
  durationMs: 600,     // per caption, first to last character locked
  staggerMs: 120,      // right caption starts this much later
  swapEveryMs: 30,     // how often unlocked characters change
  charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  scramble: /[A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü]/, // spaces and punctuation never scramble
};
/* ---------------------------------------------- */

const root = document.documentElement;
const introOn = root.classList.contains('intro-on'); // every load, except reduced motion or a #link

function cssMs(name, fallback) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  const num = parseFloat(v);
  if (Number.isNaN(num)) return fallback;
  return v.endsWith('ms') ? num : v.endsWith('s') ? num * 1000 : num;
}

/* ---------- Caption resolve ---------- */
function prepareResolve(el) {
  const chars = [];
  const lines = [...el.querySelectorAll('[data-line]')];
  const finals = lines.map((l) => l.textContent);
  for (const line of lines) {
    const text = line.textContent;
    line.textContent = '';
    for (const ch of text) {
      if (RESOLVE.scramble.test(ch)) {
        const s = document.createElement('span');
        s.className = 'ch is-scr';
        s.textContent = randomChar();
        line.append(s);
        chars.push({ s, ch });
      } else {
        line.append(ch);
      }
    }
  }
  return {
    chars,
    restore() { lines.forEach((l, i) => { l.textContent = finals[i]; }); },
  };
}

function randomChar() {
  return RESOLVE.charset[(Math.random() * RESOLVE.charset.length) | 0];
}

function runResolve(jobs) {
  const t0 = performance.now();
  let lastSwap = 0;
  jobs.forEach((job, k) => {
    const start = k * RESOLVE.staggerMs;
    const n = job.chars.length;
    job.chars.forEach((c, i) => { c.lockAt = start + ((i + 1) / n) * RESOLVE.durationMs; });
  });
  const end = (jobs.length - 1) * RESOLVE.staggerMs + RESOLVE.durationMs;

  function frame(now) {
    const t = now - t0;
    const swap = now - lastSwap >= RESOLVE.swapEveryMs;
    if (swap) lastSwap = now;
    for (const job of jobs) {
      for (const c of job.chars) {
        if (c.done) continue;
        if (t >= c.lockAt) {
          c.done = true;
          c.s.textContent = c.ch;
          c.s.classList.remove('is-scr');
        } else if (swap) {
          c.s.textContent = randomChar();
        }
      }
    }
    if (t < end) requestAnimationFrame(frame);
    else jobs.forEach((j) => j.restore());
  }
  requestAnimationFrame(frame);
}

/* ---------- Intro + hero reveal ---------- */
function initHero() {
  const sphere = initSphere(document.querySelector('.hero__canvas'));
  const intro = document.querySelector('.intro');

  if (!introOn || !intro) {
    if (intro) intro.remove();
    sphere.reveal();
    return;
  }

  // Captions and the name scramble now, while the overlay still covers them.
  const jobs = [...document.querySelectorAll('[data-resolve]')].map(prepareResolve);
  const lines = [...document.querySelectorAll('.hero__l1, .hero__l2')].map(prepareDecrypt);

  // Times are from navigation start (performance.now), the same clock the CSS animations follow.
  const outDelay = cssMs('--intro-out-delay', 2560);
  const outDur = cssMs('--intro-out-dur', 620);
  const decryptAt = cssMs('--intro-decrypt-delay', 2860);
  const decryptDur = cssMs('--intro-decrypt-dur', 1000);
  const decryptStagger = cssMs('--intro-decrypt-stagger', 250);
  const decryptEnd = decryptAt + decryptDur + decryptStagger;
  const skipDur = cssMs('--intro-skip-dur', 150);
  const inputs = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms - performance.now())));
  let revealed = false, resolved = false, done = false, stopDecrypt = null;

  function reveal() {
    if (revealed) return;
    revealed = true;
    sphere.reveal();
    stopDecrypt = runDecrypt(lines, decryptAt, decryptDur, decryptStagger);
  }
  function resolveCaptions() {
    if (resolved) return;
    resolved = true;
    runResolve(jobs);
  }
  function finish() {   // removes the overlay; input can still skip the decrypt until it ends
    if (done) return;
    done = true;
    intro.remove();
  }
  // Any input ends the intro at once: overlay out in 150 ms, name decrypted, captions resolve.
  function skip() {
    timers.forEach(clearTimeout);
    inputs.forEach((e) => removeEventListener(e, skip, true));
    root.classList.add('intro-skip');
    if (!revealed) { revealed = true; sphere.reveal(); }
    if (stopDecrypt) stopDecrypt(); else lines.forEach((l) => l.restore());
    setTimeout(resolveCaptions, skipDur);
    setTimeout(finish, skipDur + 50);
  }

  at(outDelay, reveal);
  at(outDelay + outDur + 100, finish);
  at(decryptEnd, resolveCaptions);
  at(decryptEnd, () => inputs.forEach((e) => removeEventListener(e, skip, true)));
  inputs.forEach((e) => addEventListener(e, skip, { capture: true, passive: true }));
}

/* ---------- Phone menu ---------- */
function initMenu() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  const btn = nav.querySelector('.nav__toggle');
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  let open = false;

  const set = (value, returnFocus = false) => {
    open = value;
    btn.setAttribute('aria-expanded', String(open));
    nav.toggleAttribute('data-open', open);
    if (!open && returnFocus) btn.focus();
  };

  btn.addEventListener('click', () => set(!open));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') set(false, true);
  });
  document.addEventListener('click', (e) => {
    if (open && !nav.contains(e.target)) set(false);
  });
  matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
    if (e.matches) set(false);
  });
}

/* ---------- GDL clock: once per minute, only while the tab is visible ---------- */
function initClock() {
  const el = document.querySelector('[data-clock]');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  let timer = 0;
  const update = () => {
    el.textContent = fmt.format(new Date());
    const now = new Date();
    timer = setTimeout(update, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50);
  };
  const sync = () => {
    clearTimeout(timer);
    if (document.visibilityState === 'visible') update();
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}

/* ---------- Console greeting ---------- */
function greet() {
  console.log('%cJorge Sánchez Encinas · CS student, Tec de Monterrey', 'color:#D9C7A0;font:12px monospace');
  console.log('jesanchezencinas@gmail.com · github.com/jsencinas');
  console.log('You found the console. I like curious people.');
}

initHero();
initPage();
initMenu();
initClock();
greet();
