// ClearCart service worker – DECIDE (Ghost Checkout, Honest Alternatives) + DEFEND (evidence, complaint).
// HARD SAFETY RULES: never clicks pay/confirm/submit, never completes a purchase, never submits forms,
// never reads passwords/OTPs/card details. Ghost Checkout only *navigates* a hidden tab and *reads* text.
importScripts('lib/patterns.js', 'lib/storage.js');

const DEFAULT_SETTINGS = {
  cleanView: false, autoUntick: true, shield: true, autoSpeak: false, lang: 'en', seniorMode: false,
  backendUrl: '', elevenKey: '', voiceId: '', userName: '', userEmail: '',
  complaintUrl: 'http://localhost:8000/complaint.html'
};
const GHOST_TAG = '#cc-ghost';
const lastState = {};   // tabId -> content state
const lastGhost = {};   // tabId -> ghost result
const evidenceTaken = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getSettings() { return { ...DEFAULT_SETTINGS, ...((await chrome.storage.local.get('settings')).settings || {}) }; }

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  await chrome.storage.local.set({ settings: s });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));
chrome.tabs.onRemoved.addListener((id) => { delete lastState[id]; delete lastGhost[id]; });

// ---------------- helpers ----------------
async function tabMsg(tabId, msg, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try { const r = await chrome.tabs.sendMessage(tabId, msg); if (r !== undefined) return r; } catch (e) { /* not ready */ }
    await sleep(250);
  }
  return null;
}
async function getState(tabId) { return (await tabMsg(tabId, { type: 'cc:getState' })) || lastState[tabId] || null; }

async function waitComplete(tabId, urlPart, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) throw new Error('tab closed');
    if (t.status === 'complete' && t.url && t.url !== 'about:blank' && (!urlPart || t.url.includes(urlPart))) return t;
    await sleep(150);
  }
  throw new Error('timeout loading page');
}

// Runs inside the page. Reads text only – no clicks.
function extractTotals() {
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const RUP = /(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/i;
  const num = (s) => { const m = RUP.exec(s || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const els = Array.from(document.body.querySelectorAll('*')).filter((e) => !e.closest('[data-cc-ui]') && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName));
  const TOT = /(total payable|grand total|amount payable|amount to pay|order total|you pay|total amount|\btotal\b)/i;
  let total = null;
  for (const rx of [/(total payable|grand total|amount payable|amount to pay|order total|you pay|total amount)/i, /\btotal\b/i]) {
    for (const e of els.filter((x) => txt(x).length < 80 && rx.test(txt(x)))) {
      let n = e;
      for (let i = 0; i < 3 && n && total == null; i++, n = n.parentElement) { if (txt(n).length < 120) total = num(txt(n)); }
      if (total != null) break;
    }
    if (total != null) break;
  }
  const FEE = /(fee|charge|tax|gst|protection|insurance|warranty|surcharge|convenience|donation|\btip\b|add-?on)/i;
  const rows = els.filter((e) => { const t = txt(e); return t.length < 100 && num(t) != null && FEE.test(t) && !TOT.test(t) && !/includ/i.test(t); });
  const set = new Set(rows);
  const fees = rows.filter((e) => !Array.from(e.children).some((c) => set.has(c)))
    .filter((e) => { const cb = e.querySelector('input[type=checkbox]'); return !cb || cb.checked; })
    .map((e) => ({ label: txt(e).replace(RUP, '').replace(/[:\s]+$/, '').trim(), amount: num(txt(e)) }));
  let next = null;
  if (total == null) {
    const rx = /(book now|book direct|checkout|check out|proceed|reserve|buy now|go to cart|continue to book)/i;
    const a = document.querySelector('#bookNow, [data-cc-checkout]') || Array.from(document.querySelectorAll('a[href]')).find((x) => rx.test(txt(x)) && !/pay/i.test(txt(x)));
    if (a && a.href) next = a.href;
  }
  return { total, fees, next, url: location.href.replace(/#cc-ghost$/, ''), title: document.title };
}

// Opens url in a hidden background tab, follows up to `hops` checkout links, reads totals, closes the tab.
async function ghostFromUrl(url, hops = 2, withTrust = false) {
  const tab = await chrome.tabs.create({ url: url.split('#')[0] + GHOST_TAG, active: false });
  let trust = null;
  try {
    let target = url.split('#')[0];
    for (let hop = 0; hop < hops; hop++) {
      await waitComplete(tab.id, target.split('?')[0].split('/').pop());
      await sleep(350); // let page scripts compute totals
      if (withTrust && hop === 0) { const st = await tabMsg(tab.id, { type: 'cc:getState' }, 6); trust = st ? st.score : null; }
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractTotals });
      if (result.total != null || !result.next) return { ...result, trust };
      target = result.next.split('#')[0];
      await chrome.tabs.update(tab.id, { url: target + GHOST_TAG });
      await sleep(200);
    }
    return { total: null, fees: [], trust };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ---------------- DECIDE ----------------
async function ghostCheckout(tabId) {
  const state = await getState(tabId);
  if (!state) throw new Error('ClearCart is not active on this page');
  let res;
  if (state.checkoutLink) res = await ghostFromUrl(state.checkoutLink, 2);
  else { const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractTotals }); res = result; }
  const listed = state.listedPrice;
  const out = {
    listed, total: res.total, fees: res.fees || [], checkoutUrl: res.url,
    diff: res.total != null && listed != null ? res.total - listed : null, product: state.product, ts: Date.now()
  };
  lastGhost[tabId] = out;
  return out;
}

async function alternatives(tabId) {
  const state = await getState(tabId);
  if (!state || !state.product) return { product: null, alts: [] };
  const data = await (await fetch(chrome.runtime.getURL('data/alternatives.json'))).json();
  const list = data[state.product] || [];
  const ghost = lastGhost[tabId] || await ghostCheckout(tabId).catch(() => null);
  const alts = [];
  for (const a of list) {
    const url = new URL(a.url, state.url).href;
    const g = await ghostFromUrl(url, 2, true).catch((e) => ({ error: String(e) }));
    alts.push({ name: a.name, url, total: g.total, trust: g.trust, fees: g.fees || [],
      cheaperBy: ghost && ghost.total != null && g.total != null ? ghost.total - g.total : null });
  }
  alts.sort((x, y) => (x.total || 1e12) - (y.total || 1e12));
  return { product: state.product, current: ghost, currentTrust: state.score, alts };
}

// ---------------- DEFEND ----------------
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function saveEvidence(tabId, reason = 'manual') {
  const tab = await chrome.tabs.get(tabId);
  const state = await getState(tabId);
  let screenshot = null;
  try { if (tab.active) screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 }); } catch (e) { /* not capturable */ }
  const rec = {
    id: 'ev_' + Date.now(), reason, url: tab.url.replace(GHOST_TAG, ''), title: tab.title, timestamp: new Date().toISOString(),
    score: state ? state.score : null,
    findings: state ? state.findings.map((f) => ({ patternId: f.patternId, patternName: f.patternName, label: f.label, reason: f.reason, amount: f.amount })) : [],
    prices: { listed: state ? state.listedPrice : null, ghost: lastGhost[tabId] || null },
    screenshot
  };
  rec.hash = await sha256(JSON.stringify(rec));
  await CCStore.addEvidence(rec);
  return { id: rec.id, hash: rec.hash, hasScreenshot: !!screenshot, count: (await CCStore.getEvidence()).length };
}

function complaintTemplate(d) {
  return `To the Grievance Officer / Consumer Helpline,

I wish to report unfair trade practices ("dark patterns") on ${d.company} (${d.url}), observed on ${d.date}.

The following practices specified in the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 were found:
${d.patterns.map((p) => '- ' + p).join('\n')}

Details:
${d.details.map((x) => '- ' + x).join('\n')}
${d.listed != null && d.total != null ? `\nThe price shown was ₹${d.listed.toLocaleString('en-IN')}, but the amount payable at checkout was ₹${d.total.toLocaleString('en-IN')} (₹${(d.total - d.listed).toLocaleString('en-IN')} added through extra fees/add-ons).` : ''}

Evidence (screenshots with SHA-256 hashes) was saved by the ClearCart browser extension and is listed below. I request that the platform be directed to stop these practices and refund any amounts charged through them.

Regards,
${d.name || '[Your name]'}`;
}

async function buildComplaint(tabId) {
  const s = await getSettings();
  const state = await getState(tabId);
  if (!state) throw new Error('No page state');
  const ev = (await CCStore.getEvidence()).filter((e) => e.url.split('#')[0] === state.url.split('#')[0]);
  const ghost = lastGhost[tabId];
  const patterns = Array.from(new Set(state.findings.map((f) => f.patternName)));
  const ghostDetails = [];
  if (ghost && ghost.diff > 0) {
    if (!patterns.includes('Drip Pricing')) patterns.push('Drip Pricing');
    ghostDetails.push(`Hidden checkout charges: ${ghost.fees.map((f) => `${f.label} ₹${f.amount}`).join(', ')}`);
    const sneaked = ghost.fees.filter((f) => /protection|insurance|warranty|donation|tip|add-?on/i.test(f.label));
    if (sneaked.length) {
      if (!patterns.includes('Basket Sneaking')) patterns.push('Basket Sneaking');
      ghostDetails.push(`Pre-selected paid add-on(s) at checkout: ${sneaked.map((f) => `${f.label} ₹${f.amount}`).join(', ')}`);
    }
  }
  const d = {
    name: s.userName, email: s.userEmail, company: new URL(state.url).host + ' – ' + state.title.split(/[–|-]/)[0].trim(),
    url: state.url, date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    patterns, details: state.findings.slice(0, 8).map((f) => `${f.label}: ${f.reason}`).concat(ghostDetails),
    listed: ghost ? ghost.listed : state.listedPrice, total: ghost ? ghost.total : null
  };
  let text = complaintTemplate(d);
  if (s.backendUrl) {
    try {
      const r = await fetch(s.backendUrl.replace(/\/$/, '') + '/complaint', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: d.company, url: d.url, findings: state.findings, prices: { listed: d.listed, total: d.total }, evidence: ev.map((e) => ({ ts: e.timestamp, hash: e.hash })) }) });
      if (r.ok) { const j = await r.json(); if (j.text) text = j.text; }
    } catch (e) { /* template fallback */ }
  }
  const travel = /hotel|resort|stay|travel|flight|booking/i.test(state.title + state.url);
  return {
    name: s.userName || '', email: s.userEmail || '', company: d.company, category: travel ? 'travel' : 'ecommerce',
    patternType: patterns.join(', '), amount: String(d.total || d.listed || ''), description: text,
    evidence: ev.length ? ev.map((e) => `${e.timestamp} – ${e.url} – SHA-256 ${e.hash}`).join('\n') : `No saved screenshots yet. Page: ${state.url} (${new Date().toISOString()})`
  };
}

// Runs inside the complaint page. Pre-fills only – NEVER submits.
function fillComplaintForm(data) {
  const filled = [];
  const labelRx = { name: /name/i, email: /e-?mail/i, company: /company|website|trader|seller/i, category: /category|sector/i,
    patternType: /dark.?pattern|type/i, amount: /amount|value/i, description: /description|details|grievance|complaint/i, evidence: /evidence|document|attachment/i };
  const byLabel = (rx) => {
    const l = Array.from(document.querySelectorAll('label')).find((x) => rx.test(x.textContent));
    return l && (l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,select,textarea'));
  };
  for (const [k, v] of Object.entries(data)) {
    const el = document.getElementById(k) || document.querySelector(`[name="${k}"]`) || byLabel(labelRx[k] || new RegExp(k, 'i'));
    if (!el || el.type === 'password' || el.type === 'submit') continue;
    if (el.tagName === 'SELECT') {
      const opt = Array.from(el.options).find((o) => o.value === v) || Array.from(el.options).find((o) => v && o.text.toLowerCase().includes(String(v).toLowerCase()));
      if (opt) el.value = opt.value;
    } else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '2px solid #FD9B36';
    filled.push(k);
  }
  const b = document.createElement('div');
  b.setAttribute('data-cc-ui', '');
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1B1F6B;color:#fff;font:600 15px system-ui;padding:12px 18px;border-bottom:4px solid #FD9B36';
  b.textContent = '✍️ ClearCart pre-filled this form. Please review every field and submit it yourself – ClearCart never submits for you.';
  document.documentElement.appendChild(b);
  return filled;
}

async function complain(tabId) {
  const s = await getSettings();
  const data = await buildComplaint(tabId);
  const tab = await chrome.tabs.create({ url: s.complaintUrl, active: true });
  await waitComplete(tab.id);
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillComplaintForm, args: [data] });
  return { tabId: tab.id, filled: result, text: data.description };
}

// ---------------- voice / misc ----------------
async function speakWarning(text, lang) {
  const delivered = await chrome.runtime.sendMessage({ type: 'cc:speak', text, lang }).catch(() => null);
  if (!delivered) chrome.tts.speak(text, { lang: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.95, volume: 1 });
}

function setBadge(tabId, state) {
  const color = { green: '#1fbf4a', amber: '#FD9B36', red: '#e53935' }[state.badge];
  chrome.action.setBadgeText({ tabId, text: state.findings.length ? String(state.findings.length) : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

async function classify(snippets) {
  const s = await getSettings();
  if (!s.backendUrl) return { results: [] };
  try {
    const r = await fetch(s.backendUrl.replace(/\/$/, '') + '/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snippets }) });
    return { results: r.ok ? await r.json() : [] };
  } catch (e) { return { results: [] }; }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = msg.tabId || (sender.tab && sender.tab.id);
  const run = (p) => { p.then((r) => reply({ ok: true, ...r })).catch((e) => reply({ ok: false, error: String(e && e.message || e) })); return true; };
  switch (msg && msg.type) {
    case 'cc:update':
      if (sender.tab) { lastState[sender.tab.id] = msg.state; setBadge(sender.tab.id, msg.state); }
      return false;
    case 'cc:highSeverity':
      (async () => {
        if (!sender.tab || evidenceTaken.has(sender.tab.url)) return;
        evidenceTaken.add(sender.tab.url);
        await saveEvidence(sender.tab.id, 'auto: ' + msg.finding.label).catch(() => {});
        const s = await getSettings();
        if (s.autoSpeak) {
          const f = msg.finding;
          const fees = (msg.state.findings || []).filter((x) => x.patternId === 'drip_pricing').reduce((a, x) => a + (x.amount || 0), 0);
          const important = f.patternId === 'rogue_malpractices' || /Fake button/.test(f.label) || fees > 200 || f.patternId === 'basket_sneaking';
          if (important) speakWarning(s.lang === 'hi' ? `सावधान! ${CC_PATTERNS[f.patternId].hi}` : `Careful! ${f.label}. ${f.reason}`, s.lang);
        }
      })();
      return false;
    case 'cc:saved': CCStore.addSaved(msg.amount).then(() => reply({ ok: true })); return true;
    case 'cc:classify': return run(classify(msg.snippets));
    case 'bg:ghost': return run(ghostCheckout(tabId).then((g) => ({ ghost: g })));
    case 'bg:alternatives': return run(alternatives(tabId));
    case 'bg:evidence': return run(saveEvidence(tabId, 'manual'));
    case 'bg:complaintText': return run(buildComplaint(tabId));
    case 'bg:complain': return run(complain(tabId));
    default: return false;
  }
});

// exposed for tests / debugging
self.cc = { ghostCheckout, alternatives, saveEvidence, complain, buildComplaint, getState, extractTotals };
