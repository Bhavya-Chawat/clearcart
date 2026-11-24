// ClearCart content script – wires detector + defuser, keeps state, talks to background/side panel.
(function () {
  if (window.__clearcart) return; window.__clearcart = true;
  const DEFAULTS = { cleanView: false, autoUntick: true, shield: true, autoSpeak: false, lang: 'en', seniorMode: false, backendUrl: '' };
  // Ghost tabs (opened hidden by Ghost Checkout) only detect – no defusing, no memory writes, no updates.
  const GHOST = location.hash.includes('cc-ghost');
  let settings = { ...DEFAULTS };
  const memKey = 'mem:' + location.origin + location.pathname;
  const ctx = { prev: {}, current: {} };
  const findings = new Map(); // key -> finding
  let realButtons = [];
  let seq = 0, savedThisPage = 0, highSent = false, llmDone = false;
  const nagState = {};
  const removed = [];

  const safeSend = (msg) => { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { /* extension reloaded */ } };

  function score() {
    const perPattern = {};
    let s = 100;
    findings.forEach((f) => {
      const p = CC_PATTERNS[f.patternId]; if (!p) return;
      perPattern[f.patternId] = (perPattern[f.patternId] || 0) + 1;
      if (perPattern[f.patternId] <= 3) s -= p.weight * (f.extra && f.extra.fake ? 1.3 : 1);
    });
    return Math.max(0, Math.round(s));
  }

  function publicState() {
    const list = Array.from(findings.values()).map((f) => ({
      id: f.id, patternId: f.patternId, patternName: (CC_PATTERNS[f.patternId] || {}).name, label: f.label, reason: f.reason,
      confidence: f.confidence, action: f.action, amount: f.amount || null, severity: (CC_PATTERNS[f.patternId] || {}).severity,
      fake: !!(f.extra && f.extra.fake), unticked: !!f.unticked, blocked: !!f.blocked
    }));
    const sc = score();
    const meta = document.querySelector('meta[name="cc-product"]');
    return {
      url: location.href, title: document.title, findings: list, score: sc, badge: ccBadgeFor(sc),
      product: meta ? meta.content : null, listedPrice: CCDetector.listedPrice(),
      realButtons: realButtons.length, fakeButtons: list.filter((f) => f.label.startsWith('Fake button')).length,
      removed, savedThisPage, checkoutLink: CCDetector.extractCheckoutLink()
    };
  }

  function scan() {
    if (!document.body) return;
    let res;
    try { res = CCDetector.scan(ctx); } catch (e) { console.warn('[ClearCart] scan failed', e); return; }
    realButtons = res.realButtons;
    const seenNow = new Set();
    res.findings.forEach((nf) => {
      seenNow.add(nf.key);
      const old = findings.get(nf.key);
      if (old) {
        Object.assign(old, { element: nf.element, input: nf.input || old.input, label: nf.label, reason: nf.reason, confidence: nf.confidence, extra: nf.extra || old.extra });
      } else {
        nf.id = 'f' + (++seq);
        findings.set(nf.key, nf);
      }
    });
    // nag reappearance counting
    Array.from(findings.values()).filter((f) => f.patternId === 'nagging').forEach((f) => {
      const st = nagState[f.key] || (nagState[f.key] = { visible: false, shows: 0 });
      const vis = seenNow.has(f.key);
      if (vis && !st.visible) st.shows++;
      st.visible = vis;
      if (st.shows > 1) { f.label = `Nagging popup (×${st.shows})`; f.reason = `This popup came back ${st.shows - 1} time(s) after you closed it.`; f.confidence = 0.95; }
    });
    // drop findings whose element left the page (keep blocked/unticked ones and nags for counting)
    for (const [k, f] of findings) {
      if (!f.element || !f.element.isConnected) { if (!f.blocked && f.patternId !== 'nagging') findings.delete(k); }
    }
    if (GHOST) return;
    applyDefusers();
    const live = Array.from(findings.values()).filter((f) => f.element && f.element.isConnected);
    CCDefuser.render(live, settings.lang);
    try { chrome.storage.local.set({ [memKey]: ctx.current }); } catch (e) { /* ignore */ }
    const st = publicState();
    const root = document.documentElement;
    root.dataset.ccFindings = String(st.findings.length);
    root.dataset.ccScore = String(st.score);
    root.dataset.ccPatterns = Array.from(new Set(st.findings.map((f) => f.patternId))).join(',');
    root.dataset.ccLabels = st.findings.map((f) => f.label).join('|');
    safeSend({ type: 'cc:update', state: st });
    const high = st.findings.find((f) => f.severity === 'high');
    if (high && !highSent) { highSent = true; safeSend({ type: 'cc:highSeverity', finding: high, state: st }); }
    if (!llmDone && settings.backendUrl) { llmDone = true; llmPass(); }
  }

  function applyDefusers() {
    const all = Array.from(findings.values()).filter((f) => f.element && f.element.isConnected);
    if (settings.autoUntick) untickAll(all, true);
    CCDefuser.shield(settings.shield, all, realButtons);
    all.filter((f) => f.scam).forEach((f) => CCDefuser.blockScam(f));
    CCDefuser.cleanView(settings.cleanView, all);
  }

  function untickAll(list, auto) {
    let total = 0;
    (list || Array.from(findings.values())).filter((f) => f.patternId === 'basket_sneaking' && !f.unticked).forEach((f) => {
      const amt = CCDefuser.untick(f);
      if (f.unticked) removed.push({ name: (f.extra && f.extra.name) || 'add-on', amount: amt });
      total += amt;
    });
    if (total) { savedThisPage += total; safeSend({ type: 'cc:saved', amount: total, auto: !!auto }); }
    return total;
  }

  async function llmPass() {
    const snippets = CCDetector.uncertainSnippets(Array.from(findings.values()));
    if (!snippets.length) return;
    const res = await chrome.runtime.sendMessage({ type: 'cc:classify', snippets }).catch(() => null);
    if (!res || !Array.isArray(res.results)) return;
    res.results.filter((r) => r.patternId && CC_PATTERNS[r.patternId] && r.confidence >= 0.6).forEach((r) => {
      const sn = snippets.find((s) => s.id === r.id); if (!sn) return;
      const el = Array.from(document.querySelectorAll('a,button,[role=button]')).find((x) => CCDetector.textOf(x) === sn.text);
      if (!el) return;
      findings.set('llm:' + sn.text, { key: 'llm:' + sn.text, id: 'f' + (++seq), patternId: r.patternId, element: el, label: 'AI: ' + CC_PATTERNS[r.patternId].name, reason: r.reason || 'Flagged by AI classifier', confidence: r.confidence, action: 'explain' });
    });
    scan();
  }

  // ---- throttled MutationObserver ----
  let pending = null, lastRun = 0;
  function schedule() {
    if (pending) return;
    const wait = Math.max(300, 1200 - (Date.now() - lastRun));
    pending = setTimeout(() => { pending = null; lastRun = Date.now(); scan(); }, wait);
  }
  const mo = new MutationObserver((recs) => {
    if (recs.every((r) => {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      return !t || (t.closest && t.closest('[data-cc-ui]')) || (r.type === 'attributes' && r.attributeName === 'class');
    })) return;
    schedule();
  });

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    switch (msg && msg.type) {
      case 'cc:getState': reply(publicState()); break;
      case 'cc:rescan': scan(); reply(publicState()); break;
      case 'cc:highlight': { const f = Array.from(findings.values()).find((x) => x.id === msg.id); CCDefuser.highlight(f); reply({ ok: !!f }); break; }
      case 'cc:untick': { const n = untickAll(null, false); scan(); reply({ removed: n, state: publicState() }); break; }
      case 'cc:shield': {
        settings.shield = true; scan();
        reply({ fake: publicState().fakeButtons, real: realButtons.length });
        break;
      }
      case 'cc:toast': CCDefuser.toast(msg.text); reply({ ok: true }); break;
      default: return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { settings = { ...DEFAULTS, ...changes.settings.newValue }; scan(); }
  });

  chrome.storage.local.get(['settings', memKey]).then((r) => {
    settings = { ...DEFAULTS, ...(r.settings || {}) };
    ctx.prev = r[memKey] || {};
    scan();
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'open', 'aria-hidden'] });
    // store price history for a future fake-discount check
    const st = publicState();
    if (st.listedPrice) {
      const hk = 'priceHistory';
      chrome.storage.local.get(hk).then((h) => {
        const all = h[hk] || {}; const k = location.origin + location.pathname;
        all[k] = (all[k] || []).concat({ price: st.listedPrice, ts: Date.now() }).slice(-50);
        chrome.storage.local.set({ [hk]: all });
      });
    }
  });
})();
