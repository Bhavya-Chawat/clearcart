// ClearCart DETECT – rule-based dark-pattern detector. Pure DOM reads; never clicks anything.
(function () {
  const UI_SEL = '[data-cc-ui]';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'HEAD', 'META', 'LINK', 'IFRAME', 'TEMPLATE']);

  const RX = {
    time: /\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/,
    urgency: /(ends?|ending|left|hurry|deal|offer|sale|expires?|expiring|only|limited|last chance|closes?|countdown)/i,
    scarcity: /\bonly\s+\d+\s+(?:[a-z]+\s+){0,2}(left|remaining|available|in stock)\b|\b\d+\s+left in stock\b|\bwe have\s+\d+\s+left\b|\b\d+\s+left at this price\b|\b\d+\s+(?:rooms?|seats?|units?|tickets?|items?|pieces?|spots?)\s+(?:left|remaining|available)\b|\bonly\s+(?:a\s+)?(?:few|couple)\s+(?:[a-z]+\s+){0,2}left\b/i,
    social: /\b\d+\s+(?:people|users|others|customers|travell?ers|shoppers|guests)\s+(?:are\s+)?(?:viewing|looking|watching|booked|bought|purchased)|\b\d+\s+(?:bought|sold|booked|purchased)\s+in\s+the\s+last/i,
    addon: /(insurance|protect|protection|warranty|donat|\btip\b|priority|add-?on|cover(age)?|assurance|membership|subscription|gift ?wrap)/i,
    shame: /(no thanks,?\s*i\s*(?:'d|would)?\s*(?:like|prefer|love|enjoy|don'?t|do not|hate|want)|i\s+(?:like|love|prefer|enjoy)\s+(?:taking risks|paying|missing)|i\s+don'?t\s+(?:want|care|like)\s+(?:to\s+)?(?:save|saving|protect|deals|discounts|money)|i'?ll\s+pay\s+(?:full|more)|i\s+(?:hate|don'?t like)\s+(?:saving|money|discounts|deals)|continue without (?:protection|saving)|risk it|i'?m not interested in saving)/i,
    decline: /^(no\b|no,|no thanks|not now|skip|decline|maybe later|cancel|i'?ll pass|not interested|continue without)/i,
    accept: /(yes|accept|add|protect|continue|ok\b|okay|get|allow|subscribe|install|agree|book|claim|upgrade|join)/i,
    fee: /(platform|convenience|handling|service|booking|processing|payment gateway|packaging|delivery|small cart|surge)\s*(fee|charge)s?/i,
    adLabel: /^\s*(sponsored|promoted|ad|ads|advertisement|paid partnership)\s*$/i,
    dlBtn: /(download|start now|play now|get file|get it now|^play$|install now)/i,
    file: /\.(pdf|zip|rar|7z|exe|msi|dmg|apk|mp3|mp4|mkv|docx?|xlsx?|pptx?|txt|csv|epub|iso)(\?|#|$)/i,
    closeText: /^\s*(x|×|✕|✖|close|skip ad)\s*$/i,
    nag: /(get|download|install|try)\s+(our|the)\s+app|app for \d+% off|enable notifications|turn on notifications|allow notifications|subscribe to|sign up for (our )?newsletter|join our newsletter|rate (us|our app)/i,
    scam: /(virus|viruses|infected|malware|trojan|call (tech )?support|your (device|computer|pc|phone) (is|has been)|you('ve| have) won|congratulations.{0,40}won|claim your prize|security alert)/i,
    neg: /\b(not|no|never|don'?t|doesn'?t|won'?t|uncheck|unsubscribe|opt[- ]out|without)\b|n't\b/gi,
    rupee: /(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/i
  };

  const AD_TOKEN = /^(ad|ads|advert|advertisement|adsbygoogle|sponsor.*|promo(ted)?|ad[-_].+|.+[-_]ads?|banner[-_]ad)$/i;

  const ids = new WeakMap(); let idSeq = 0;
  function eid(el) { if (!ids.has(el)) ids.set(el, ++idSeq); return ids.get(el); }
  function isOurs(el) { return !!(el.closest && el.closest(UI_SEL)); }
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('.cc-hidden')) return true; // hidden by Clean View – still "present"
    const r = el.getClientRects();
    if (!r.length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }
  function textOf(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function money(str) { const m = RX.rupee.exec(str || ''); return m ? Number(m[1].replace(/,/g, '')) : null; }
  function allElements() {
    return Array.from(document.body ? document.body.querySelectorAll('*') : []).filter((el) => !SKIP_TAGS.has(el.tagName) && !isOurs(el));
  }
  // deepest elements whose text matches rx (no child element also matches)
  function findTextElements(rx, maxLen = 300, els = allElements()) {
    const hits = els.filter((el) => { const t = textOf(el); return t.length && t.length <= maxLen && rx.test(t); });
    const set = new Set(hits);
    return hits.filter((el) => !Array.from(el.children).some((c) => set.has(c)));
  }
  function isFixedLayer(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return n;
    }
    return null;
  }
  function labelFor(input) {
    let t = '';
    if (input.id) { const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (l) t = textOf(l); }
    if (!t && input.closest('label')) t = textOf(input.closest('label'));
    if (!t && input.getAttribute('aria-label')) t = input.getAttribute('aria-label');
    if (!t && input.parentElement) t = textOf(input.parentElement);
    return t;
  }
  function rowOf(el) {
    let n = el;
    for (let i = 0; i < 3 && n; i++) { if (RX.rupee.test(textOf(n))) return n; n = n.parentElement; }
    return el;
  }
  function clickables(els) {
    return els.filter((el) => el.matches('a, button, [role="button"], input[type="button"], input[type="submit"], [onclick]'));
  }
  function ctlText(el) { return (el.value && el.tagName === 'INPUT' ? el.value : textOf(el)) || el.getAttribute('aria-label') || ''; }
  function adContainer(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.hasAttribute && (n.hasAttribute('data-ad') || n.hasAttribute('data-ad-slot'))) return n;
      const toks = [...(n.classList || []), ...(n.id ? [n.id] : [])];
      if (toks.some((t) => AD_TOKEN.test(t))) return n;
      if (/advert/i.test(n.getAttribute && (n.getAttribute('aria-label') || ''))) return n;
    }
    return null;
  }
  function hostOf(href) { try { return new URL(href, location.href).host; } catch (e) { return ''; } }
  function numIn(str) { const m = /\d+/.exec(str); return m ? Number(m[0]) : null; }
  function luminance(rgb) {
    const m = (rgb || '').match(/\d+(\.\d+)?/g); if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map((v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastWithWhite(color) { const L = luminance(color); return 1.05 / (L + 0.05); }

  /**
   * scan(ctx): ctx = { prev: {...stored values from previous page load}, current: {...values seen this load} }
   * returns findings: {key, patternId, element, label, reason, confidence, action, amount?, extra?}
   */
  function scan(ctx) {
    const out = [];
    const els = allElements();
    const add = (f) => out.push(Object.assign({ confidence: 0.8 }, f));
    const urlNow = Date.now();

    // ---- FALSE URGENCY: countdown timers ----
    const timerHits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const tn = walker.currentNode; const p = tn.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName) || isOurs(p)) continue;
      const m = RX.time.exec(tn.nodeValue); if (!m) continue;
      let box = p, ok = false;
      for (let i = 0; i < 4 && box && box !== document.body; i++) {
        const t = textOf(box);
        if (t.length > 300) break;
        if (RX.urgency.test(t.replace(RX.time, ''))) { ok = true; break; }
        box = box.parentElement;
      }
      if (!ok || !isVisible(p)) continue;
      const secs = m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      if (!timerHits.some((h) => h.box === box)) timerHits.push({ box, secs, text: m[0] });
    }
    // Stable identity for a number/timer: the product link or title it sits next to (not its position, which shuffles on listing pages).
    const anchorKey = (el, rx) => {
      const g = new RegExp(rx.source, 'gi');
      let c = el;
      for (let d = 0; d < 8 && c && c !== document.body; d++, c = c.parentElement) {
        // stop once the container holds more than one of the same kind of number: it would be shared between products
        if (((c.textContent || '').match(g) || []).length > 1) break;
        const a = c.querySelector && c.querySelector('a[href]');
        if (a && c.getBoundingClientRect().height > 60) {
          try { const u = new URL(a.href, location.href); if (u.pathname.length > 1) return u.pathname.slice(0, 60); } catch (e) { /* ignore */ }
        }
      }
      return null; // no unique product anchor
    };
    timerHits.forEach((h, i) => {
      const k = 'timer:' + (anchorKey(h.box, RX.time) || (timerHits.length === 1 ? 'single' : 'idx' + i));
      if (!ctx.current[k]) ctx.current[k] = { remaining: h.secs, ts: urlNow };
      const first = ctx.current[k]; const prev = ctx.prev[k];
      let fake = false;
      // A real countdown keeps falling across reloads; a fake one jumps back up.
      if (prev && first.ts - prev.ts > 2000) {
        const expected = prev.remaining - (first.ts - prev.ts) / 1000;
        if (first.remaining > expected + 1.5) fake = true;
      }
      add({ key: 'timer:' + eid(h.box), patternId: 'false_urgency', element: h.box,
        label: fake ? 'Fake timer' : 'Urgency timer',
        reason: fake ? `FAKE – resets on reload. The countdown went back up to ${h.text} when you reloaded the page.`
                     : 'Countdown timer used to rush you. ClearCart will check if it resets when you reload.',
        confidence: fake ? 0.97 : 0.6, action: 'hide', extra: { fake } });
    });

    // ---- FAKE SCARCITY / SOCIAL PROOF ----
    [['scarcity', RX.scarcity, 'Scarcity claim'], ['social', RX.social, 'Social proof']].forEach(([kind, rx, lbl]) => {
      const arr = findTextElements(rx, 200, els).filter(isVisible);
      arr.forEach((el) => {
        // identity = the product this number belongs to; with no unique anchor we can't tell a change from a reshuffle, so we don't claim "fake"
        const ak = anchorKey(el, rx) || (arr.length === 1 ? 'single' : null);
        const k = ak ? kind + ':' + ak : null, n = numIn(textOf(el).match(rx)[0]);
        let prev = null, fake = false;
        if (k) {
          if (!ctx.current[k]) ctx.current[k] = { n, ts: urlNow };
          prev = ctx.prev[k];
          fake = !!prev && prev.n !== ctx.current[k].n;
        }
        add({ key: kind + ':' + eid(el), patternId: 'false_urgency', element: el,
          label: fake ? `Fake ${kind === 'scarcity' ? 'scarcity' : 'social proof'}` : lbl,
          reason: fake ? `FAKE – the number changed from ${prev.n} to ${n} on reload.`
                       : `"${textOf(el).slice(0, 60)}" cannot be verified and is used to pressure you.`,
          confidence: fake ? 0.95 : 0.65, action: 'hide', extra: { fake } });
      });
    });

    // ---- BASKET SNEAKING: pre-ticked paid add-ons ----
    document.querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]').forEach((inp, i) => {
      if (isOurs(inp)) return;
      const checked = inp.matches('input') ? inp.checked : inp.getAttribute('aria-checked') === 'true';
      const lbl = labelFor(inp);
      if (!RX.addon.test(lbl)) return;
      const already = inp.dataset.ccPrechecked;
      if (already === undefined) inp.dataset.ccPrechecked = checked ? '1' : '0';
      if (inp.dataset.ccPrechecked !== '1') return;
      const row = inp.closest('label, .row, li, tr') || inp.parentElement;
      const amount = money(lbl) || money(textOf(row));
      add({ key: 'sneak:' + eid(inp), patternId: 'basket_sneaking', element: row, input: inp,
        label: 'Sneaked-in add-on', amount,
        reason: `"${lbl.replace(RX.rupee, '').trim().slice(0, 50)}"${amount ? ' (₹' + amount + ')' : ''} was ticked for you without asking.`,
        confidence: 0.9, action: 'untick', extra: { name: lbl.replace(RX.rupee, '').replace(/^add\s+/i, '').trim().slice(0, 50) } });
    });

    // ---- TRICK QUESTION: double negatives ----
    document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((inp, i) => {
      if (isOurs(inp)) return;
      const lbl = labelFor(inp);
      const negs = (lbl.match(RX.neg) || []).length;
      if (negs >= 2 && lbl.length < 220) {
        add({ key: 'trick:' + eid(inp), patternId: 'trick_question', element: inp.closest('label') || inp.parentElement,
          label: 'Trick question', reason: `Confusing double negative: "${lbl.slice(0, 80)}". Read carefully – ticking/unticking may do the opposite of what you think.`,
          confidence: 0.85, action: 'explain' });
      }
    });

    // ---- CONFIRM SHAMING + INTERFACE INTERFERENCE ----
    const ctls = clickables(els).filter(isVisible);
    ctls.forEach((el, i) => {
      const t = ctlText(el);
      if (!t || t.length > 90) return;
      // accessibility skip links / in-page anchors and footer policy links are not "decline" buttons
      if (/^skip to\b|^skip (navigation|nav|main|links?)\b/i.test(t) || (el.tagName === 'A' && /^#/.test(el.getAttribute('href') || '') && /skip/i.test(t))) return;
      const shame = RX.shame.test(t);
      if (shame) add({ key: 'shame:' + eid(el), patternId: 'confirm_shaming', element: el, label: 'Guilt-trip button',
        reason: `"${t}" uses guilt to push you into saying yes.`, confidence: 0.9, action: 'rewrite', extra: { text: t } });
      if (!shame && !RX.decline.test(t)) return;
      // find accept control in the same container
      let box = el.parentElement, accept = null;
      for (let d = 0; d < 3 && box && !accept; d++, box = box.parentElement) {
        accept = clickables(Array.from(box.querySelectorAll('*'))).find((c) => c !== el && isVisible(c) && RX.accept.test(ctlText(c)) && !RX.decline.test(ctlText(c)) && !RX.shame.test(ctlText(c)));
      }
      if (!accept) return;
      const a = accept.getBoundingClientRect(), b = el.getBoundingClientRect();
      const ca = getComputedStyle(accept), cb = getComputedStyle(el);
      const areaRatio = (a.width * a.height) / Math.max(1, b.width * b.height);
      const fontRatio = parseFloat(ca.fontSize) / Math.max(1, parseFloat(cb.fontSize));
      const lowContrast = contrastWithWhite(cb.color) < 2.2 && cb.backgroundColor.replace(/\s/g, '').match(/rgba\(0,0,0,0\)|transparent/);
      if (b.width < 10 || b.height < 10) return; // visually hidden control, not a real choice
      if (areaRatio > 3 || fontRatio > 1.4 || lowContrast) {
        add({ key: 'iface:' + eid(el), patternId: 'interface_interference', element: el, label: 'Hidden "No" option',
          reason: `The "${ctlText(accept).slice(0, 30)}" button is ${areaRatio > 3 ? Math.round(areaRatio) + '× bigger' : 'much more prominent'} than "${t.slice(0, 30)}"${lowContrast ? ' (which is faint grey)' : ''}.`,
          confidence: 0.85, action: 'equalise', extra: { acceptEl: accept } });
      }
    });

    // ---- DRIP PRICING: fee lines ----
    findTextElements(RX.fee, 120, els).filter(isVisible).forEach((el, i) => {
      const row = rowOf(el), amount = money(textOf(row));
      if (!amount) return;
      add({ key: 'fee:' + eid(row), patternId: 'drip_pricing', element: row, label: 'Hidden fee', amount,
        reason: `"${textOf(el).replace(RX.rupee, '').trim().slice(0, 40)}" of ₹${amount} was not in the price you were shown.`,
        confidence: 0.85, action: 'explain' });
    });

    // ---- DISGUISED ADS: sponsored markers styled like organic results ----
    const adMarkers = els.filter((el) => el.children.length <= 1 && (el.textContent || '').trim().length < 24 && RX.adLabel.test((el.textContent || '').trim()) && isVisible(el));
    const adCards = new Set();
    adMarkers.slice(0, 40).forEach((marker) => {
      // find the result card: nearest ancestor that holds an image + link and has similar siblings
      let card = marker.parentElement, found = null;
      for (let d = 0; d < 12 && card && card !== document.body; d++, card = card.parentElement) {
        const par = card.parentElement; if (!par) break;
        const r = card.getBoundingClientRect();
        if (r.width < 120 || r.height < 80 || r.width > innerWidth * 0.98) continue;
        if (!card.querySelector('img, picture, svg') || !card.querySelector('a[href]')) continue;
        const sibs = Array.from(par.children).filter((s2) => s2 !== card && s2.tagName === card.tagName && !s2.querySelector('[data-cc-ui]'));
        const similar = sibs.filter((s2) => { const q = s2.getBoundingClientRect(); return q.height > 0 && Math.abs(q.height - r.height) / Math.max(r.height, 1) < 0.5 && Math.abs(q.width - r.width) / Math.max(r.width, 1) < 0.5; });
        if (similar.length >= 1) { found = card; break; }
      }
      if (!found) { // fallback: card with an identical-class sibling (simple/demo markup)
        let c2 = marker.parentElement;
        for (let d = 0; d < 4 && c2 && c2 !== document.body; d++, c2 = c2.parentElement) {
          const sib = Array.from(c2.parentElement ? c2.parentElement.children : []).find((s3) => s3 !== c2 && s3.tagName === c2.tagName && s3.className === c2.className && !RX.adLabel.test(textOf(s3)));
          if (sib) { found = c2; break; }
        }
      }
      if (!found || adCards.has(found)) return;
      adCards.add(found);
      const fs = parseFloat(getComputedStyle(marker).fontSize);
      add({ key: 'ad:' + eid(found), patternId: 'disguised_advertisement', element: found, label: 'Disguised ad',
        reason: `This paid listing looks exactly like the real results; the "${textOf(marker)}" label is ${fs < 12 ? 'tiny (' + fs + 'px)' : 'easy to miss'}.`,
        confidence: 0.85, action: 'explain' });
    });

    // ---- FAKE BUTTONS: download/start buttons that are ads ----
    const APP_PROMO = /\b(app|apps|audible|audio ?books?|kindle|play store|app store|google play)\b/i, APP_HOST = /(play\.google\.com|apps\.apple\.com|itunes\.apple\.com|app\.link|onelink\.me)/i;
    const dl = clickables(els).filter((el) => RX.dlBtn.test(ctlText(el)) && !APP_PROMO.test(ctlText(el)) && !APP_HOST.test(el.getAttribute('href') || '') && isVisible(el));
    const realButtons = [];
    if (dl.length >= 2) {
      dl.forEach((el, i) => {
        const href = el.getAttribute('href') || '';
        const off = href && hostOf(href) && hostOf(href) !== location.host;
        const ad = adContainer(el);
        const isFile = RX.file.test(href) || el.hasAttribute('download');
        if (ad || off || (el.tagName === 'A' && !isFile)) {
          add({ key: 'fakebtn:' + eid(el), patternId: 'disguised_advertisement', element: el, label: 'Fake button (AD)', fakeButton: true,
            reason: ad ? 'This "download" button sits inside an advertisement.' : off ? `This button goes to another website (${hostOf(href)}), not your file.` : 'This button does not point to a real file.',
            confidence: 0.9, action: 'shield' });
        } else realButtons.push(el);
      });
    }

    // ---- FAKE CLOSE BUTTONS ----
    clickables(els).forEach((el, i) => {
      const t = ctlText(el), aria = el.getAttribute('aria-label') || '';
      if (!(RX.closeText.test(t) || /^close$/i.test(aria))) return;
      const href = el.getAttribute('href') || '', oc = el.getAttribute('onclick') || '';
      const navigates = (href && !/^(#|javascript:)/i.test(href)) || /window\.open|location/.test(oc);
      if (navigates && isVisible(el)) add({ key: 'fakeclose:' + eid(el), patternId: 'rogue_malpractices', element: el, label: 'Fake close (X)', fakeClose: true,
        reason: `This "close" button actually opens ${hostOf(href) || 'another page'}.`, confidence: 0.9, action: 'shield' });
    });

    // ---- NAGGING + FAKE ALERTS (fixed overlays) ----
    const seenLayers = new Set();
    els.forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (seenLayers.has(el) || !isVisible(el)) return;
      const t = textOf(el); if (!t || t.length > 600) return;
      if (RX.scam.test(t)) {
        seenLayers.add(el);
        add({ key: 'scam:' + eid(el), patternId: 'rogue_malpractices', element: el, label: 'Fake alert / scam', scam: true,
          reason: 'Websites cannot scan your device. This "virus" warning is a scam to make you call a fake support number or install malware.',
          confidence: 0.95, action: 'block' });
      } else if (RX.nag.test(t)) {
        seenLayers.add(el);
        const sig = 'nag:' + t.replace(/\d+/g, '#').slice(0, 40);
        add({ key: sig, patternId: 'nagging', element: el, label: 'Nagging popup', reason: 'This popup keeps asking you to install/subscribe.', confidence: 0.8, action: 'hide', sig });
      }
    });

    return { findings: out, realButtons };
  }

  // Short uncertain snippets for the optional LLM pass (never the whole page).
  function uncertainSnippets(known) {
    const knownEls = new Set(known.map((f) => f.element));
    return clickables(allElements()).filter((el) => isVisible(el) && !knownEls.has(el))
      .map((el) => ctlText(el)).filter((t) => t && t.length > 12 && t.length < 90 && /^(no|not|skip|i |maybe|continue)/i.test(t))
      .slice(0, 8).map((text, i) => ({ id: 'llm' + i, text, context: document.title.slice(0, 60) }));
  }

  function extractCheckoutLink() {
    const sel = document.querySelector('#bookNow, [data-cc-checkout]');
    if (sel && sel.href) return sel.href;
    const rx = /(book now|book direct|checkout|check out|proceed|reserve|buy now|go to cart|continue to book)/i;
    const a = Array.from(document.querySelectorAll('a[href]')).find((x) => rx.test(textOf(x)) && !/pay/i.test(textOf(x)) && !isOurs(x));
    return a ? a.href : null;
  }

  function listedPrice() {
    const meta = document.querySelector('meta[name="cc-price"]');
    if (meta) return Number(meta.content);
    const el = document.querySelector('.price, [itemprop="price"], [class*="price"]');
    return el ? money(textOf(el)) : null;
  }

  self.CCDetector = { scan, uncertainSnippets, extractCheckoutLink, listedPrice, money, textOf };
})();
