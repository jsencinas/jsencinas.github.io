/* =====================================================================
   decrypt.js: letters show random characters, then lock in left to right.
   Used for every section and card title (page.js, when it scrolls into view).
   The real text stays in place (transparent) under a small canvas, so a
   line never shifts.
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

// Titles: the effect is drawn on a small canvas over the title, so no per-letter elements
// exist while the page scrolls. Letter positions are measured once, when it starts.
// A settled letter is drawn on the text's own baseline at the exact spot the page puts it,
// so nothing moves when the canvas is swapped for the real text.
export function decryptTitle(el, dur, delay = 0) {
  const box = el.getBoundingClientRect();
  const pad = 8, chars = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const m = document.createElement('canvas').getContext('2d'), ascent = {};
  while (walker.nextNode()) {
    const node = walker.currentNode, cs = getComputedStyle(node.parentElement);
    const font = cs.font;
    if (!(font in ascent)) { m.font = font; ascent[font] = m.measureText('Hg').fontBoundingBoxAscent; }
    m.font = font;
    for (let i = 0; i < node.data.length; i++) {
      const ch = node.data[i];
      if (/\s/.test(ch)) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      const x = r.left - box.left + pad;
      chars.push({
        ch, x, mid: x + m.measureText(ch).width / 2,          // left edge, and the middle for random letters
        y: r.top - box.top + pad + ascent[font],              // the baseline: the text box top plus the font's ascent
        font, color: cs.color, s: scrambleFor(ch),
      });
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
  ctx.textBaseline = 'alphabetic';
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
      if (locked) { ctx.textAlign = 'left'; ctx.fillText(c.ch, c.x, c.y); }
      else { ctx.textAlign = 'center'; ctx.fillText(c.s, c.mid, c.y); }
    }
    if (left) requestAnimationFrame(frame);
    else { canvas.remove(); el.classList.remove('dc-hide'); }
  }
  requestAnimationFrame(frame);
}
