/* =====================================================================
   main.js: hero sphere, nav menu, clock, console greeting.
   Sections below the hero live in page.js.
   ===================================================================== */
import { initSphere } from './sphere.js?v=20261112o';
import { initPage } from './page.js?v=20261112o';

/* ---------- Hero: the sphere forms as soon as the page loads ---------- */
function initHero() {
  initSphere(document.querySelector('.hero__canvas')).reveal();
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
