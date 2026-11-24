// ClearCart side panel – UI for Detect / Defuse / Decide / Defend + Voice Guardian.
const $ = (id) => document.getElementById(id);
const DEFAULT_THEME = 'light';
document.documentElement.dataset.theme = DEFAULT_THEME;
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
let tabId = params.get('tab') ? Number(params.get('tab')) : null;
const openGroups = new Set();
let state = null, ghost = null, altRes = null, settings = {}, complaintText = '';

function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === name));
  const el = document.querySelector('.tabs'); if (el && scrollY > el.offsetTop) scrollTo({ top: el.offsetTop - 60 });
}
document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
function setTabCount(n) { const e = $('tabCount'); e.textContent = n; e.hidden = !n; }

const I18N = {
  hi: {
    tag: 'डार्क-पैटर्न रक्षक', sTricks: 'चालें', sFees: 'छुपे शुल्क', sSaved: 'बचत', voiceTitle: 'वॉइस गार्डियन',
    micHint: 'माइक दबाएँ या नीचे सवाल चुनें', qDeal: 'यह डील सही है?', qPrice: 'असली कीमत?', qButton: 'असली बटन कौन सा?', qCheaper: 'सस्ता विकल्प?',
    detect: 'पहचानें', defuse: 'निष्क्रिय करें', decide: 'फ़ैसला करें', defend: 'बचाव करें',
    clean: 'साफ़ व्यू', cleanD: 'नकली टाइमर और पॉपअप छुपाएँ', untick: 'एक्स्ट्रा अपने-आप हटाएँ', untickD: 'बिना पूछे जोड़ी चीज़ें हटाएँ',
    shield: 'नकली बटन कवच', shieldD: 'विज्ञापन बटन रोकें, असली दिखाएँ', speak: 'चेतावनी बोलें', speakD: 'खतरे की चेतावनी सुनाएँ',
    senior: 'वरिष्ठ मोड', seniorD: 'बड़े अक्षर, कम जानकारी',
    ghost: 'घोस्ट चेकआउट – असली कीमत', ghostHint: 'छुपे टैब में अंतिम कीमत देखता है। कभी भुगतान नहीं करता।', ghostBtn: 'असली कीमत दिखाओ',
    alts: 'ईमानदार विकल्प', altBtn: 'सस्ते ईमानदार विकल्प खोजें', evidence: 'सबूत लॉकर', evBtn: 'सबूत सहेजें', export: 'JSON निर्यात',
    complainBtn: 'एक-क्लिक शिकायत', copy: 'टेक्स्ट कॉपी', nch: 'राष्ट्रीय उपभोक्ता हेल्पलाइन ↗',
    footer: 'ClearCart कभी भुगतान या सबमिट नहीं दबाता, और पासवर्ड, OTP या कार्ड विवरण नहीं पढ़ता।',
    verdict: { green: 'ठीक लगता है', amber: 'सावधान रहें', red: 'खतरनाक – कई चालें' }, empty: 'कोई चाल नहीं मिली', inactive: 'इस पेज पर सक्रिय नहीं'
  },
  en: { verdict: { green: 'Looks fair', amber: 'Be careful', red: 'Risky – many tricks' }, empty: 'No tricks found on this page', inactive: 'Not active on this page' }
};
const EN_DEFAULTS = {};
document.querySelectorAll('[data-i]').forEach((el) => { EN_DEFAULTS[el.dataset.i] = el.textContent; });
const hi = () => settings.lang === 'hi';
const t = (k) => (hi() && I18N.hi[k]) || EN_DEFAULTS[k] || I18N.en[k] || k;

function applyTheme() { document.documentElement.dataset.theme = settings.theme || DEFAULT_THEME; }
function syncHero() {
  const on = !!settings.cleanView;
  const h = $('cleanHero'); if (h) h.classList.toggle('on', on);
  const st = $('cleanState'); if (st) st.textContent = on ? (hi() ? 'चालू' : 'On') : (hi() ? 'बंद' : 'Off');
}
function applyLang() {
  document.querySelectorAll('[data-i]').forEach((el) => { if (el.id === 'ghostOut' && ghost) return; el.textContent = t(el.dataset.i); }); // keep a revealed price on screen
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === (settings.lang || 'en')));
  document.body.classList.toggle('senior', !!settings.seniorMode);
  document.documentElement.lang = hi() ? 'hi' : 'en';
  syncHero();
  applyTheme();
}

async function loadSettings() {
  settings = (await chrome.storage.local.get('settings')).settings || {};
  document.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!settings[cb.dataset.setting]; });
  applyLang();
}
async function setSetting(k, v) {
  settings = { ...((await chrome.storage.local.get('settings')).settings || {}), [k]: v };
  await chrome.storage.local.set({ settings });
  document.querySelectorAll(`[data-setting="${k}"]`).forEach((cb) => { cb.checked = !!v; });
  applyLang();
}

async function activeTab() {
  if (params.get('tab')) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

async function refresh() {
  tabId = await activeTab();
  if (!tabId) return;
  try { state = await chrome.tabs.sendMessage(tabId, { type: 'cc:getState' }); } catch (e) { state = null; }
  render();
  $('saved').textContent = fmt(await CCStore.getSaved());
  const ev = await CCStore.getEvidence();
  $('evCount').textContent = ev.length;
  $('evList').innerHTML = ev.slice(-3).reverse().map((e) =>
    `<li>${esc(new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))} · ${e.findings.length} tricks · <code>${esc(e.hash.slice(0, 12))}…</code></li>`).join('');
}

const PATTERN_ICON = {
  false_urgency: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  basket_sneaking: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
  confirm_shaming: '<circle cx="12" cy="12" r="9"/><path d="M8 16s1.5-2 4-2 4 2 4 2M9 9.5h.01M15 9.5h.01"/>',
  forced_action: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  subscription_trap: '<path d="M20 11a8 8 0 0 0-14.5-3.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15M20 20v-5h-5"/>',
  interface_interference: '<path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="14" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  bait_and_switch: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  drip_pricing: '<path d="M4 4h16v17l-3-2-2.5 2L12 19l-2.5 2L7 19l-3 2z"/><path d="M8 9h8M8 13h5"/>',
  disguised_advertisement: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  nagging: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  trick_question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  saas_billing: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  rogue_malpractices: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'
};

function render() {
  const ring = $('scoreRing');
  if (!state) {
    $('score').textContent = '–'; ring.className = 'ring green'; ring.style.setProperty('--p', 0);
    $('verdict').textContent = t('inactive'); $('verdict').style.setProperty('--vc', 'var(--muted)');
    $('host').textContent = 'Open a shopping or booking site';
    $('findings').innerHTML = ''; if ($('groupHint')) $('groupHint').hidden = true; setTabCount(0); $('count').textContent = '0'; $('statTricks').textContent = '0'; $('statFees').textContent = fmt(0);
    return;
  }
  $('score').textContent = state.score;
  ring.className = 'ring ' + state.badge;
  ring.style.setProperty('--p', state.score);
  $('verdict').textContent = I18N[hi() ? 'hi' : 'en'].verdict[state.badge];
  $('verdict').style.setProperty('--vc', { green: 'var(--lime-text)', amber: 'var(--amber)', red: 'var(--red)' }[state.badge]);
  try { $('host').textContent = new URL(state.url).host; } catch (e) { /* ignore */ }
  $('count').textContent = state.findings.length; setTabCount(state.findings.length);
  $('statTricks').textContent = state.findings.length;
  const pageFees = state.findings.filter((f) => f.patternId === 'drip_pricing' || f.patternId === 'basket_sneaking').reduce((s, f) => s + (f.amount || 0), 0);
  $('statFees').textContent = fmt(ghost && ghost.diff > 0 ? ghost.diff : pageFees);

  const ul = $('findings');
  if (!state.findings.length) { ul.innerHTML = `<li class="empty"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>${esc(t('empty'))}</li>`; return; }
  // group repeated findings (e.g. 26x "Scarcity claim") into one card with a stepper
  const groups = new Map();
  state.findings.forEach((f) => {
    const k = f.patternId + '|' + String(f.label).replace(/\s*\(.*\)$/, '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });
  const isHigh = (g) => g.some((f) => f.severity === 'high' || f.fake);
  const list = [...groups.entries()].sort((x, y) => (isHigh(y[1]) - isHigh(x[1])) || (y[1].length - x[1].length));
  const gh = $('groupHint');
  if (gh) { gh.hidden = list.length === state.findings.length; gh.textContent = hi() ? `${state.findings.length} मामले, ${list.length} प्रकारों में। सूची खोलकर किसी भी एक पर जाएँ।` : `${state.findings.length} found, grouped into ${list.length} ${list.length === 1 ? 'type' : 'types'}. Open a group to jump to any one on the page.`; }
  ul.innerHTML = '';
  const go = (it) => chrome.tabs.sendMessage(tabId, { type: 'cc:highlight', id: it.id }).catch(() => {});
  list.forEach(([gk, items]) => {
    const f = items[0], p = CC_PATTERNS[f.patternId] || {};
    const high = isHigh(items);
    const n = items.length;
    const done = items.every((x) => x.unticked) ? (hi() ? 'हटाया' : 'Removed') : items.every((x) => x.blocked) ? (hi() ? 'रोका' : 'Blocked') : '';
    const li = document.createElement('li');
    if (high) li.className = 'high';
    if (n > 1 && openGroups.has(gk)) li.classList.add('open');
    const chev = '<svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    li.innerHTML = `<div class="f-ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATTERN_ICON[f.patternId] || PATTERN_ICON.rogue_malpractices}</svg></div>
      <div class="f-bd"><div class="f-top"><span class="lbl">${esc(String(f.label).replace(/\s*\(.*\)$/, ''))}</span>${n > 1 ? `<span class="cnt">×${n}</span>` : ''}${done ? `<span class="ok">${done}</span>` : ''}<span class="sev">${high ? (hi() ? 'उच्च' : 'High') : (hi() ? 'मध्यम' : 'Medium')}</span></div>
      <div class="f-pat">${esc(p.name)} · CCPA</div>
      <div class="r">${esc(hi() ? p.hi : f.reason)}</div>
      <button type="button" class="f-act">${n > 1 ? `<span>${hi() ? `सभी ${n} देखें` : `Show all ${n}`}</span>${chev}` : `<span>${hi() ? 'पेज पर दिखाएँ' : 'Show on page'}</span><span aria-hidden="true">›</span>`}</button>
      ${n > 1 ? `<ul class="f-list">${items.map((it, i) => `<li data-i="${i}"><span class="ix">${i + 1}</span><span class="tx"><b>${esc(it.where || it.text || it.label)}</b>${it.where && it.text ? `<small>${esc(it.text)}</small>` : ''}</span><span class="go">›</span></li>`).join('')}</ul>` : ''}</div>`;
    li.querySelector('.f-act').onclick = (e) => {
      e.stopPropagation();
      if (n === 1) return go(items[0]);
      const open = li.classList.toggle('open');
      if (open) openGroups.add(gk); else openGroups.delete(gk);
    };
    li.onclick = () => { if (n === 1) go(items[0]); else li.querySelector('.f-act').click(); };
    li.querySelectorAll('.f-list li').forEach((row) => { row.onclick = (e) => { e.stopPropagation(); li.querySelectorAll('.f-list li').forEach((r) => r.classList.remove('cur')); row.classList.add('cur'); go(items[Number(row.dataset.i)]); }; });
    ul.appendChild(li);
  });
}

function renderGhost(g) {
  const box = $('ghostOut');
  if (!g || g.total == null) { box.className = 'ghost-empty'; box.textContent = 'Could not find a checkout total for this page.'; return; }
  box.className = 'ghost';
  box.innerHTML = `<div class="ghost-top">
      <div class="was">${hi() ? 'दिखाया' : 'Listed'}<br><s>${g.listed != null ? fmt(g.listed) : '—'}</s></div>
      <div class="arrow">→</div>
      <div class="now">${hi() ? 'असली कुल' : 'Real total'}<b>${fmt(g.total)}</b></div></div>
    ${g.diff > 0 ? `<div class="extra">+${fmt(g.diff)} ${hi() ? 'छुपे शुल्क' : 'added at checkout'}</div>` : ''}
    <ul class="fees">${g.fees.map((f) => `<li><span>${esc(f.label)}</span><span>+${fmt(f.amount)}</span></li>`).join('')}</ul>`;
  render();
}

function renderAlts(r) {
  const out = $('altOut');
  if (!r.alts || !r.alts.length) { out.innerHTML = '<div class="ghost-empty">No honest alternatives known for this product yet.</div>'; return; }
  out.innerHTML = r.alts.map((a) => {
    const save = a.cheaperBy > 0 ? `${fmt(a.cheaperBy)} ${hi() ? 'सस्ता' : 'cheaper'}` : '';
    return `<div class="alt">${save ? `<span class="save">${save}</span>` : ''}
      <b>${esc(a.name)}</b>
      <div class="p">${a.total != null ? `All-in ${fmt(a.total)}` : 'Price unavailable'} · Trust ${a.trust ?? '?'}/100${a.trust >= 90 ? ' · no tricks ✓' : ''}</div>
      <a href="${esc(a.url)}" target="_blank" rel="noopener">Open ↗</a></div>`;
  }).join('');
}

async function bg(type) {
  const r = await chrome.runtime.sendMessage({ type, tabId });
  if (!r || !r.ok) throw new Error((r && r.error) || 'failed');
  return r;
}
async function busy(btn, fn) {
  btn.disabled = true; btn.classList.add('loading');
  try { return await fn(); } catch (e) { $('complainOut').textContent = '⚠ ' + e.message; }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}

async function doGhost() { showTab('decide'); const r = await bg('bg:ghost'); ghost = r.ghost; renderGhost(ghost); return ghost; }
async function doAlts() { showTab('decide'); altRes = await bg('bg:alternatives'); if (altRes.current) { ghost = altRes.current; renderGhost(ghost); } renderAlts(altRes); return altRes; }
async function doEvidence() { showTab('defend'); const r = await bg('bg:evidence'); await refresh(); $('complainOut').textContent = `✓ Evidence saved (SHA-256 ${r.hash.slice(0, 10)}…)`; return r; }
async function doComplain() { showTab('defend'); const r = await bg('bg:complain'); complaintText = r.text; $('complainOut').textContent = `✓ Form opened – ${r.filled.length} fields pre-filled. Review it and press Submit yourself.`; return r; }
async function doUntick() { const r = await chrome.tabs.sendMessage(tabId, { type: 'cc:untick' }); await refresh(); return r; }

$('ghostBtn').onclick = (e) => busy(e.currentTarget, doGhost);
$('altBtn').onclick = (e) => busy(e.currentTarget, doAlts);
$('evBtn').onclick = (e) => busy(e.currentTarget, doEvidence);
$('complainBtn').onclick = (e) => busy(e.currentTarget, doComplain);
$('copyBtn').onclick = (e) => busy(e.currentTarget, async () => {
  if (!complaintText) complaintText = (await bg('bg:complaintText')).description;
  await navigator.clipboard.writeText(complaintText);
  $('complainOut').textContent = '✓ Complaint text copied. Paste it on the National Consumer Helpline site.';
});
$('exportBtn').onclick = async () => {
  const ev = await CCStore.getEvidence();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(ev, null, 2)], { type: 'application/json' }));
  a.download = `clearcart-evidence-${Date.now()}.json`; a.click();
};
$('openOptions').onclick = () => chrome.runtime.openOptionsPage();
$('themeBtn').onclick = () => setSetting('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
document.querySelectorAll('.lang button').forEach((b) => { b.onclick = () => setSetting('lang', b.dataset.lang).then(() => { render(); if (ghost) renderGhost(ghost); if (altRes) renderAlts(altRes); }); });
document.querySelectorAll('[data-setting]').forEach((cb) => { cb.onchange = () => setSetting(cb.dataset.setting, cb.checked); });

// ---------------- Voice Guardian ----------------
async function say(text) {
  $('reply').hidden = false; $('reply').textContent = text;
  return CCVoice.speak(text, settings.lang || 'en', settings);
}
async function handleIntent(intent) {
  const L = CCVoice.T[hi() ? 'hi' : 'en'];
  await refresh();
  switch (intent) {
    case 'deal': {
      const g = ghost || await doGhost().catch(() => null);
      const r = altRes || await doAlts().catch(() => null);
      const alt = r && r.alts && r.alts.find((a) => a.cheaperBy > 0);
      return say(L.deal({ n: state ? state.findings.length : 0, top: state && state.findings[0] && state.findings[0].label.toLowerCase(), total: g && g.total, listed: g && g.listed, alt }));
    }
    case 'price': { const g = await doGhost().catch(() => null); return say(L.price({ total: g && g.total, listed: g && g.listed, diff: g && g.diff })); }
    case 'remove': { const r = await doUntick().catch(() => null); const amt = (state && state.removed || []).reduce((s, x) => s + (x.amount || 0), 0) || (r && r.removed); return say(L.remove({ amount: amt })); }
    case 'button': {
      if (!settings.shield) await setSetting('shield', true);
      const r = await chrome.tabs.sendMessage(tabId, { type: 'cc:shield' }).catch(() => null);
      return say(L.button({ real: r && r.real, fake: r ? r.fake : 0 }));
    }
    case 'clean': { const on = !settings.cleanView; await setSetting('cleanView', on); return say(L.clean({ on })); }
    case 'cheaper': { const r = await doAlts().catch(() => null); return say(L.cheaper({ alt: r && r.alts && r.alts.find((a) => a.total != null) })); }
    case 'complaint': await doComplain().catch(() => null); return say(L.complaint());
    default: return say(L.unknown());
  }
}
$('mic').onclick = async () => {
  $('mic').classList.add('listening'); $('heard').textContent = hi() ? 'सुन रहा हूँ…' : 'Listening…';
  try {
    const heard = await CCVoice.listen(settings.lang || 'en');
    $('heard').textContent = heard ? `“${heard}”` : 'Did not hear anything – try again.';
    if (heard) await handleIntent(CCVoice.parseIntent(heard));
  } catch (e) { $('heard').textContent = e.message; }
  finally { $('mic').classList.remove('listening'); }
};
document.querySelectorAll('.chip').forEach((c) => {
  c.onclick = async () => { $('heard').textContent = `“${c.textContent}”`; c.disabled = true; try { await handleIntent(c.dataset.ask); } finally { c.disabled = false; } };
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'cc:update' && sender.tab && sender.tab.id === tabId) { state = msg.state; render(); }
  if (msg.type === 'cc:speak') { say(msg.text); reply(true); }
  return false;
});
chrome.tabs.onActivated.addListener(() => { resetDecide(); refresh(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') { resetDecide(); setTimeout(refresh, 800); } });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.saved) $('saved').textContent = fmt(c.saved.newValue || 0); });
function resetDecide() {
  ghost = null; altRes = null; $('altOut').innerHTML = '';
  const g = $('ghostOut'); g.className = 'ghost-empty'; g.textContent = t('ghostHint');
}

// exposed for tests
window.ccPanel = { handleIntent, refresh, doGhost, doAlts, parse: CCVoice.parseIntent };
loadSettings().then(refresh);
