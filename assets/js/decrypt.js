/* =====================================================================
   decrypt.js: letters show random characters, then lock in left to right.
   Used for the hero name (main.js, during the intro) and every section
   and card title (page.js, when it scrolls into view).
   Each real letter keeps its width (drawn transparent) and the random one
   is drawn over it (site.css, ".dc"), so a line never shifts.
   ===================================================================== */

/* ---------- DECRYPT CONSTANTS ---------- */
const DECRYPT = {
  swapEveryMs: 55,     // how often scrambled letters change
  jitterMs: 90,        // random spread of each letter's lock time, so it doesn't read as a sweep
  // Random letters come from a set of about the same width as the real one, so they don't overlap their neighbors.
  narrow: 'fijlrt1',
  wideLower: 'mw',
  wideUpper: 'MW',
  upper: 'ABCDEFGHKLNOPRSTUVXYZ023456789',
  lower: 'abcdeghknopqsuvxyz023456789',
};
/* --------------------------------------- */

function scrambleFor(ch) {
  const set = 'fijlrtI1:.,-'.includes(ch) ? DECRYPT.narrow
    : 'mw'.includes(ch) ? DECRYPT.wideLower
    : 'MW'.includes(ch) ? DECRYPT.wideUpper
    : ch !== ch.toLowerCase() ? DECRYPT.upper : DECRYPT.lower;
  return set[(Math.random() * set.length) | 0];
}

// Wraps each letter of el (through any nested spans) in a scrambling span.
// restore() puts the original markup back exactly.
export function prepareDecrypt(el) {
  const saved = el.innerHTML;
  const chars = [];
  if (!el.style.getPropertyValue('--dc-color')) el.style.setProperty('--dc-color', getComputedStyle(el).color);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    const frag = document.createDocumentFragment();
    for (const ch of node.data) {
      if (/\s/.test(ch)) { frag.append(ch); continue; }
      const s = document.createElement('span');
      s.className = 'dc is-scr';
      s.textContent = ch;
      s.dataset.s = scrambleFor(ch);
      frag.append(s);
      chars.push({ s, ch });
    }
    node.replaceWith(frag);
  }
  return { chars, restore() { el.innerHTML = saved; } };
}

// Scrambles from now; job k locks letter by letter between at + k * stagger and that + dur
// (times on the performance.now() clock). Returns a function that ends it at once.
export function runDecrypt(jobs, at, dur, stagger = 0) {
  jobs.forEach((job, k) => {
    const n = job.chars.length;
    job.chars.forEach((c, i) => {
      c.lockAt = at + k * stagger + ((i + 1) / n) * dur + (Math.random() - 0.5) * DECRYPT.jitterMs;
    });
  });
  let lastSwap = 0, raf = 0, over = false;
  const finish = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    jobs.forEach((j) => j.restore());
  };
  // The DOM changes only on ticks (every swapEveryMs): frames in between cost nothing to render.
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - lastSwap < DECRYPT.swapEveryMs) return;
    lastSwap = now;
    let left = 0;
    for (const job of jobs) {
      for (const c of job.chars) {
        if (c.done) continue;
        if (now >= c.lockAt) { c.done = true; c.s.classList.remove('is-scr'); }
        else { left++; c.s.dataset.s = scrambleFor(c.ch); }
      }
    }
    if (!left) finish();
  }
  raf = requestAnimationFrame(frame);
  return finish;
}

// Titles: the same effect drawn on a small canvas over the title, so no per-letter elements
// exist while the page scrolls. Letter positions are measured once, when it starts.
export function decryptTitle(el, dur, delay = 0) {
  const box = el.getBoundingClientRect();
  const pad = 8, chars = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode, cs = getComputedStyle(node.parentElement);
    for (let i = 0; i < node.data.length; i++) {
      const ch = node.data[i];
      if (/\s/.test(ch)) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      chars.push({ ch, x: r.left - box.left + r.width / 2 + pad, y: r.top - box.top + r.height / 2 + pad, font: cs.font, color: cs.color, s: scrambleFor(ch) });
    }
  }
  if (!chars.length) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.className = 'dc-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.ceil((box.width + pad * 2) * dpr);
  canvas.height = Math.ceil((box.height + pad * 2) * dpr);
  canvas.style.cssText = `left:${-pad}px;top:${-pad}px;width:${box.width + pad * 2}px;height:${box.height + pad * 2}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(canvas);
  el.classList.add('dc-hide');

  const t0 = performance.now() + delay, n = chars.length;
  chars.forEach((c, i) => { c.lockAt = t0 + ((i + 1) / n) * dur + (Math.random() - 0.5) * DECRYPT.jitterMs; });
  const dim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--decrypt-dim')) || 0.55;
  let last = 0;
  function frame(now) {
    if (now - last < DECRYPT.swapEveryMs) { requestAnimationFrame(frame); return; }
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let left = 0, font = '', color = '';
    for (const c of chars) {
      const locked = now >= c.lockAt;
      if (!locked) { left++; c.s = scrambleFor(c.ch); }
      if (c.font !== font) { ctx.font = font = c.font; }
      if (c.color !== color) { ctx.fillStyle = color = c.color; }
      ctx.globalAlpha = locked ? 1 : dim;
      ctx.fillText(locked ? c.ch : c.s, c.x, c.y);
    }
    if (left) requestAnimationFrame(frame);
    else { canvas.remove(); el.classList.remove('dc-hide'); }
  }
  requestAnimationFrame(frame);
}
