/* =====================================================================
   main.js: hero sphere and name decrypt, nav menu, clock, console greeting.
   Sections below the hero live in page.js.
   ===================================================================== */
import { initSphere } from './sphere.js?v=20261115a';
import { initPage } from './page.js?v=20261116b';
import { decryptTitle } from './decrypt.js?v=20261116b';

/* ---------- HERO NAME CONSTANTS ---------- */
const NAME = {
  delayMs: 200,        // scrambling starts at once, locking starts this much later
  msPerChar: 60,       // same pace as the section titles (page.js)
  minMs: 1300,
  maxMs: 2600,
  fontWaitMs: 1200,    // if Archivo is not ready by then, show the name without the effect
};
/* ------------------------------------------ */

/* ---------- Hero: the sphere forms as soon as the page loads ---------- */
function initHero() {
  initSphere(document.querySelector('.hero__canvas')).reveal();
  initName();
}

/* ---------- Hero: the name decrypts on load, like the section titles ---------- */
// Letter positions are measured when it starts, so it waits for Archivo first.
function initName() {
  const el = document.querySelector('.hero__title');
  if (!el) return;
  const show = () => el.classList.add('is-live');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { show(); return; }
  const timeout = new Promise((resolve) => setTimeout(resolve, NAME.fontWaitMs, false));
  const fonts = document.fonts ? document.fonts.load('400 1em Archivo').then(() => true, () => true) : Promise.resolve(true);
  Promise.race([fonts, timeout]).then((ready) => {
    if (ready) {
      const len = el.textContent.replace(/\s/g, '').length;
      decryptTitle(el, Math.min(NAME.maxMs, Math.max(NAME.minMs, len * NAME.msPerChar)), NAME.delayMs);
    }
    show();
  });
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
