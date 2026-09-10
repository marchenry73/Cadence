// In-page accessibility and layout audit for Cadence.
//
// Run it against a running page, not a build: most of what it checks does not
// exist until the CSS has resolved. The server only serves www/, so put a copy
// where the page can fetch it and remove it afterwards — it must never ship.
//
//   cp tools/audit-a11y.js www/_audit.js
//   node tools/serve.js www 5599
//   # then in the page's console, or via a JS-eval tool:
//   const r = await eval(await (await fetch('/_audit.js')).text());
//   # and when you are done:
//   rm www/_audit.js
//
// It returns { considered, problems, canary, gradientCanary }.
//
// WHAT IT CHECKS
//   text contrast against every surface the text sits on (WCAG 1.4.3)
//   interactive elements nested inside other interactive elements
//   controls with no accessible name
//   horizontal overflow of the page
//   blocks below the 56px legibility floor
//   touch targets under 24x24 (WCAG 2.5.8), hit area included
//
// TWO RULES THIS FILE EXISTS TO ENFORCE
//
// 1. It reports elements-CONSIDERED next to problems-FOUND. A checker that
//    skips a case reports zero failures for that case, and zero reads as a
//    pass. If considered.blocks is 0, the block checks told you nothing.
//
// 2. It carries two canaries that MUST come back detected:true. If either
//    says false, the numbers below it are meaningless no matter how clean
//    they look. They are not decoration; check them first.
//      canary          plain text on a flat background
//      gradientCanary  text on an oklab gradient, because a gradient lives
//                      in background-image while backgroundColor stays
//                      transparent. An audit reading only backgroundColor
//                      walks past it to the page behind and scores the
//                      wrong surface — silently. That blind spot hid a real
//                      2.67:1 failure in the hero once, and later invented
//                      a 1.15:1 failure in a hero that was fine.
//
// BEFORE YOU BELIEVE ANY MEASUREMENT: freeze motion first.
//   document.head.appendChild(Object.assign(document.createElement("style"),
//     { textContent: "*,*::before,*::after{animation:none!important;transition:none!important}" }));
// Entrance animations carry a 0.995 scale. Measured mid-flight, a 24x24
// target reads 23.88 and looks like a failure by 0.12px.
(async () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 8;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  // Cleared, transparent canvas: getComputedStyle returns oklab() for
  // color-mix, so painting is the only way to read a true RGBA.
  const paint = c => { cx.clearRect(0, 0, 8, 8); cx.fillStyle = c; cx.fillRect(0, 0, 8, 8);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (fg, bg) => { const a = fg[3] / 255; return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a))); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  // Colour stops out of a background-image. A gradient lives in
  // background-image while backgroundColor stays transparent, so an audit
  // that reads only backgroundColor is blind to it — it walks past the
  // element to the page behind and scores against the wrong thing. That
  // cuts both ways: it hid the hero's real 2.67:1 failure once, and later
  // invented a 1.15:1 failure on a hero that was fine.
  const stopsOf = (bgImage) => {
    if (!bgImage || bgImage === 'none') return [];
    const out = [];
    // Function-form colours, paren-balanced so color-mix(in oklab, a, b)
    // comes out whole rather than truncated at its first inner ")".
    const re = /\b(oklab|oklch|rgba?|hsla?|color-mix|color)\(/g;
    let m;
    while ((m = re.exec(bgImage))) {
      let i = re.lastIndex, depth = 1;
      while (i < bgImage.length && depth > 0) {
        if (bgImage[i] === '(') depth++;
        else if (bgImage[i] === ')') depth--;
        i++;
      }
      out.push(bgImage.slice(m.index, i));
    }
    for (const hex of bgImage.match(/#[0-9a-f]{3,8}\b/gi) || []) out.push(hex);
    return out;
  };

  // Every opaque surface a piece of text is actually sitting on: the first
  // opaque backgroundColor walking up, plus every gradient stop on the way.
  const groundsOf = el => {
    const grounds = [];
    let n = el.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      // An opaque gradient HIDES everything behind it, so the walk stops
      // here. Collecting these stops and then carrying on up scored the text
      // against the page as well, and the page always lost — which reported
      // white-on-plum as 1.15:1 while the hero was perfectly legible.
      let opaqueHere = false;
      for (const s of stopsOf(cs.backgroundImage)) {
        const c = paint(s);
        if (c[3] === 255) { grounds.push([c[0], c[1], c[2]]); opaqueHere = true; }
      }
      const c = paint(cs.backgroundColor);
      if (c[3] === 255) { grounds.push([c[0], c[1], c[2]]); break; }
      if (opaqueHere) break;
      n = n.parentElement;
    }
    if (!grounds.length) grounds.push([255, 255, 255]);
    return grounds;
  };
  const groundOf = el => groundsOf(el)[0];

  const out = { considered: {}, problems: [] };
  const push = (kind, el, detail) => out.problems.push({ kind, detail,
    at: (el.tagName || '?').toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
    text: (el.innerText || el.textContent || '').trim().slice(0, 40) });

  // ---- 1. text contrast (WCAG 1.4.3) ----
  const texts = [...document.querySelectorAll('body *')].filter(el => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    return own;
  });
  out.considered.textNodes = texts.length;
  for (const el of texts) {
    const cs = getComputedStyle(el);
    if (el.matches(':disabled, [disabled], [aria-disabled=true]')) continue;   // 1.4.3 exempts disabled
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = (px >= 24 || (bold && px >= 18.66)) ? 3.0 : 4.5;
    // Scored against EVERY surface the text can be over — each gradient stop
    // as well as the flat colour — and judged on the worst of them, because
    // that is the part of the element someone actually has to read.
    let r = Infinity;
    for (const ground of groundsOf(el)) {
      const bg = over(paint(cs.backgroundColor), ground);
      r = Math.min(r, ratio(over(paint(cs.color), bg), bg));
    }
    if (r + 0.005 < need) push('contrast', el, `${r.toFixed(2)}:1 needs ${need} (${px}px${bold ? ' bold' : ''})`);
  }

  // ---- 2. a button inside a button is not clickable ----
  const nested = [...document.querySelectorAll('button button, a button, button a')];
  out.considered.buttons = document.querySelectorAll('button').length;
  nested.forEach(el => push('nested-interactive', el, 'interactive element inside another'));

  // ---- 3. controls with no accessible name ----
  const named = el => (el.innerText || '').trim() || el.getAttribute('aria-label')
    || el.getAttribute('title') || (el.getAttribute('aria-labelledby') && 'ref');
  const unnamed = [...document.querySelectorAll('button, a[href], [role=button]')]
    .filter(el => el.offsetParent && !named(el));
  unnamed.forEach(el => push('no-accessible-name', el, 'no text, aria-label or title'));

  // ---- 4. horizontal overflow of the page body ----
  out.considered.docWidth = document.documentElement.scrollWidth;
  if (document.documentElement.scrollWidth > innerWidth + 1)
    out.problems.push({ kind: 'page-overflow', detail: `${document.documentElement.scrollWidth} > ${innerWidth}`, at: 'html', text: '' });

  // ---- 5. blocks below the legibility floor ----
  const blocks = [...document.querySelectorAll('.block')];
  out.considered.blocks = blocks.length;
  blocks.forEach(b => { const r = b.getBoundingClientRect();
    if (r.width > 0 && r.width < 56) push('below-min-legible', b, `${Math.round(r.width)}px < 56`); });

  // ---- 6. touch targets (WCAG 2.2 SC 2.5.8, 24x24 minimum) ----
  // The element box is NOT the hit area. Several controls are pinned to a
  // narrow strip by the layout and grow their target with an absolutely
  // positioned ::after on negative insets. Measuring the box alone reported
  // the week grid's +N chip as a 23px failure when its real target is 35x55.
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const hitArea = el => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    if (a.content === 'none' || a.position !== 'absolute') return { w: r.width, h: r.height };
    // A negative inset pushes the pseudo-element outside the box on that side.
    return { w: r.width - Math.min(0, num(a.left)) - Math.min(0, num(a.right)),
             h: r.height - Math.min(0, num(a.top)) - Math.min(0, num(a.bottom)) };
  };
  const small = [...document.querySelectorAll('button, [role=button], a[href]')].filter(el => {
    if (!el.offsetParent) return false;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const h = hitArea(el);
    return h.h < 24 || h.w < 24;
  });
  out.considered.tapTargets = document.querySelectorAll('button, [role=button], a[href]').length;
  small.forEach(el => { const h = hitArea(el); push('small-target', el, `hit ${Math.round(h.w)}x${Math.round(h.h)}`); });

  // ---- CANARY: must be reported, or the contrast pass is not running ----
  const canary = document.createElement('span');
  canary.textContent = 'canary';
  canary.style.cssText = 'color:#eeeeee;background:#ffffff;font-size:12px;position:fixed;left:0;top:0;z-index:9999';
  document.body.appendChild(canary);
  const ccs = getComputedStyle(canary);
  const cbg = over(paint(ccs.backgroundColor), groundOf(canary));
  const cr = ratio(over(paint(ccs.color), cbg), cbg);
  canary.remove();
  out.canary = { ratio: +cr.toFixed(2), detected: cr < 4.5, note: 'must be detected:true or the contrast maths is dead' };

  // A SECOND canary, because the first one cannot fail on a gradient. The
  // hero paints its colour into background-image and leaves backgroundColor
  // transparent, so a checker that reads only backgroundColor scores the
  // page behind it instead — silently, with no error and no finding. This
  // one is white text on a pale gradient: if the gradient path is working it
  // must be caught, and if it reports "detected:false" every gradient in the
  // app is going unchecked no matter what the problem count says.
  const gwrap = document.createElement('div');
  // Written in oklab, not hex, because that is what color-mix() computes to
  // throughout this stylesheet. A canary in a syntax the app never uses
  // proves the parser handles a case that never arises.
  gwrap.style.cssText = 'position:fixed;left:0;top:40px;z-index:9999;'
    + 'background-image:linear-gradient(90deg,oklab(0.98 0 0),oklab(0.95 0 0))';
  const gtext = document.createElement('span');
  gtext.textContent = 'gradient canary';
  gtext.style.cssText = 'color:#ffffff;font-size:12px';
  gwrap.appendChild(gtext);
  document.body.appendChild(gwrap);
  const gcs = getComputedStyle(gtext);
  let gr = Infinity;
  for (const ground of groundsOf(gtext)) {
    const bg = over(paint(gcs.backgroundColor), ground);
    gr = Math.min(gr, ratio(over(paint(gcs.color), bg), bg));
  }
  const sawStops = stopsOf(getComputedStyle(gwrap).backgroundImage).length;
  gwrap.remove();
  out.gradientCanary = { ratio: +gr.toFixed(2), stopsParsed: sawStops, detected: gr < 4.5,
    note: 'must be detected:true, or gradients are being skipped entirely' };

  return out;
})()
