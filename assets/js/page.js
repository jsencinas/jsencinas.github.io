/* =====================================================================
   page.js: everything below the hero.
   Fade-up on entering the viewport, title decrypt, terminal typing and cursor,
   statement reading reveal, video playback rules.
   No scroll listeners: only IntersectionObserver and CSS.
   ===================================================================== */

import { decryptTitle } from './decrypt.js?v=20261112q';

/* ---------- TIMING CONSTANTS ---------- */
const PAGE = {
  revealAt: 0.15,         // visible share that triggers the fade-up
  revealStaggerMs: 60,    // between siblings
  revealStaggerMax: 4,    // siblings after this one share the last delay
  termAt: 0.4,            // visible share that starts the typing
  termDelayMs: 500,
  typeEveryMs: 95,        // per character of the command
  rowEveryMs: 260,        // between the listing rows
  statementGroups: 3,     // fallback without scroll-driven animations
  statementAt: 0.4,
  titleDelayMs: 200,      // titles: scrambling starts on entry, locking starts this much later
  titleMsPerChar: 60,     // titles: decrypt time grows with length, between the two limits below
  titleMinMs: 1300,
  titleMaxMs: 2600,
};
/* ------------------------------------- */

const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = reducedMq.matches;

/* ---------- Fade-up ---------- */
function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (reduced || !els.length || !('IntersectionObserver' in window)) return;

  // Stagger siblings that share a parent
  const byParent = new Map();
  for (const el of els) {
    const list = byParent.get(el.parentElement) || [];
    list.push(el);
    byParent.set(el.parentElement, list);
  }
  for (const list of byParent.values()) {
    list.forEach((el, i) => {
      const step = Math.min(i, PAGE.revealStaggerMax - 1);
      if (step) el.style.setProperty('--reveal-delay', `${step * PAGE.revealStaggerMs}ms`);
    });
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { threshold: PAGE.revealAt });
  document.documentElement.classList.add('reveal-ready');
  els.forEach((el) => io.observe(el));
}

/* ---------- Terminal ---------- */
function initTerminal() {
  const term = document.querySelector('[data-term]');
  if (!term) return;
  const cursor = term.querySelector('[data-term-cursor]');
  const cmd = term.querySelector('[data-term-cmd]');
  const firstLine = term.querySelector('[data-term-line]');
  const endLine = term.querySelector('[data-term-end]');
  const rows = [...term.querySelectorAll('.term__rows > li')];

  // The cursor blinks only while the block is on screen.
  new IntersectionObserver(([e]) => {
    term.classList.toggle('is-visible', e.isIntersecting);
  }).observe(term);

  if (reduced || !cmd || !cursor) return;

  const text = cmd.textContent;
  cmd.textContent = '';
  firstLine.append(cursor);
  term.classList.add('is-typing');

  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    setTimeout(type, PAGE.termDelayMs);
  }, { threshold: PAGE.termAt });
  io.observe(term);

  function type() {
    let i = 0;
    const timer = setInterval(() => {
      cmd.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(timer); showRows(); }
    }, PAGE.typeEveryMs);
  }
  function showRows() {
    rows.forEach((row, i) => setTimeout(() => row.classList.add('is-shown'), (i + 1) * PAGE.rowEveryMs));
    setTimeout(() => {
      endLine.append(cursor);
      term.classList.remove('is-typing');
    }, (rows.length + 1) * PAGE.rowEveryMs);
  }
}

/* ---------- Statement ---------- */
// Wraps each word in a span (inside any inline markup, which is kept) so it can light up.
function initStatement() {
  const el = document.querySelector('[data-statement]');
  if (!el || reduced) return;
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = part;
      frag.append(s);
      words.push(s);
    }
    node.replaceWith(frag);
  }
  const last = Math.max(1, words.length - 1);
  words.forEach((s, i) => {
    s.style.setProperty('--p', (i / last).toFixed(3));
    s.dataset.g = String(Math.min(PAGE.statementGroups - 1, Math.floor((i / (last + 1)) * PAGE.statementGroups)));
  });

  if (window.CSS && CSS.supports('animation-timeline: view()')) {
    el.classList.add('is-scroll');
    return;
  }
  el.classList.add('is-io');
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    el.classList.add('is-in');
    io.disconnect();
  }, { threshold: PAGE.statementAt });
  io.observe(el);
}

/* ---------- Titles decrypt as they come into view ---------- */
function initTitles() {
  if (reduced || !('IntersectionObserver' in window)) return;
  const titles = [...document.querySelectorAll('main h2, main h3')];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const len = e.target.textContent.replace(/\s/g, '').length;
      decryptTitle(e.target, Math.min(PAGE.titleMaxMs, Math.max(PAGE.titleMinMs, len * PAGE.titleMsPerChar)), PAGE.titleDelayMs);
    }
  }, { threshold: PAGE.revealAt });
  titles.forEach((el) => io.observe(el));
}

/* ---------- The ghost: its module loads only when the statement gets close ---------- */
function initArt() {
  const canvas = document.querySelector('.ghostterm__screen');
  if (!canvas) return;
  const load = () => import('./ghost.js?v=20261112q').then((m) => m.initGhost(canvas));
  if (!('IntersectionObserver' in window)) { load(); return; }
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    load();
  }, { rootMargin: '600px 0px' });
  io.observe(canvas);
}

/* ---------- Videos: project cards play on hover or focus; at most one at a time ---------- */
function initVideos() {
  const slots = [...document.querySelectorAll('[data-video]')]
    .map((el) => ({ el, video: el.querySelector('video') }))
    .filter((s) => s.video);
  if (!slots.length) return;

  // Posters only with reduced motion or Save-Data.
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduced || saveData) return;

  let current = null;
  for (const s of slots) {
    s.video.addEventListener('playing', () => s.el.classList.add('is-playing'));
    s.video.addEventListener('pause', () => s.el.classList.remove('is-playing'));
  }
  function play(s) {
    if (current && current !== s) stop(current);
    current = s;
    const p = s.video.play();
    if (p) p.catch(() => {});
  }
  function stop(s) {
    s.video.pause();
    if (current === s) current = null;
  }

  // Hover or keyboard focus, on pointer devices only. Touch shows the poster.
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  for (const s of slots) {
    const card = s.el.closest('.project') || s.el;
    const start = () => { if (fine.matches && !reducedMq.matches) play(s); };
    const end = () => { if (current === s) stop(s); };
    card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') start(); });
    card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !card.contains(document.activeElement)) end(); });
    card.addEventListener('focusin', start);
    card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget)) end(); });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && current) stop(current);
  });
  reducedMq.addEventListener('change', (e) => { if (e.matches && current) stop(current); });
}

export function initPage() {
  initReveal();
  initTerminal();
  initStatement();
  initTitles();
  initArt();
  initVideos();
}
