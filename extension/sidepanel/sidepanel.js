// ClearCart side panel – UI for Detect / Defuse / Decide / Defend + Voice Guardian.
const $ = (id) => document.getElementById(id);
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
let tabId = params.get('tab') ? Number(params.get('tab')) : null;
let state = null, ghost = null, altRes = null, settings = {}, complaintText = '';

const ICONS = {
  false_urgency: '⏱️', basket_sneaking: '🛒', confirm_shaming: '😔', forced_action: '🔒', subscription_trap: '🔁',
  interface_interference: '🎛️', bait_and_switch: '🎣', drip_pricing: '💸', disguised_advertisement: '📢',
  nagging: '🔔', trick_question: '❓', saas_billing: '🧾', rogue_malpractices: '☠️'
};

const I18N = {
  hi: {
    tag: 'डार्क-पैटर्न रक्षक', sTricks: 'चालें', sFees: 'छुपे शुल्क', sSaved: 'बचत', voiceTitle: 'वॉइस गार्डियन',
    micHint: 'माइक दबाएँ या नीचे सवाल चुनें', qDeal: 'यह डील सही है?', qPrice: 'असली कीमत?', qButton: 'असली बटन कौन सा?', qCheaper: 'सस्ता विकल्प?',
    detect: 'पहचानें', defuse: 'निष्क्रिय करें', decide: 'फ़ैसला करें', defend: 'बचाव करें',
    clean: 'साफ़ व्यू', cleanD: 'नकली टाइमर और पॉपअप छुपाएँ', untick: 'एक्स्ट्रा अपने-आप हटाएँ', untickD: 'बिना पूछे जोड़ी चीज़ें हटाएँ',
    shield: 'नकली बटन कवच', shieldD: 'विज्ञापन बटन रोकें, असली दिखाएँ', speak: 'चेतावनी बोलें', speakD: 'खतरे की चेतावनी सुनाएँ',
    senior: 'वरिष्ठ मोड', seniorD: 'बड़े अक्षर, कम जानकारी',
    ghost: 'घोस्ट चेकआउट – असली कीमत', ghostHint: 'छुपे टैब में अंतिम कीमत देखता है। कभी भुगतान नहीं करता।', ghostBtn: 'असली कीमत दिखाओ',
    alts: 'ईमानदार विकल्प', altBtn: 'सस्ते ईमानदार विकल्प खोजें', evidence: 'सबूत लॉकर', evBtn: '📸 सबूत सहेजें', export: 'JSON निर्यात',
    complainBtn: '⚖ एक-क्लिक शिकायत', copy: 'टेक्स्ट कॉपी', nch: 'राष्ट्रीय उपभोक्ता हेल्पलाइन ↗',
    footer: '🔒 ClearCart कभी भुगतान या सबमिट नहीं दबाता, और पासवर्ड, OTP या कार्ड विवरण नहीं पढ़ता।',
    verdict: { green: 'ठीक लगता है', amber: 'सावधान रहें', red: 'खतरनाक – कई चालें' }, empty: 'कोई चाल नहीं मिली', inactive: 'इस पेज पर सक्रिय नहीं'
  },
  en: { verdict: { green: 'Looks fair', amber: 'Be careful', red: 'Risky – many tricks' }, empty: 'No tricks found on this page', inactive: 'Not active on this page' }
};
const EN_DEFAULTS = {};
document.querySelectorAll('[data-i]').forEach((el) => { EN_DEFAULTS[el.dataset.i] = el.textContent; });
const hi = () => settings.lang === 'hi';
const t = (k) => (hi() && I18N.hi[k]) || EN_DEFAULTS[k] || I18N.en[k] || k;

function applyLang() {
  document.querySelectorAll('[data-i]').forEach((el) => { el.textContent = t(el.dataset.i); });
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === (settings.lang || 'en')));
  document.body.classList.toggle('senior', !!settings.seniorMode);
  document.documentElement.lang = hi() ? 'hi' : 'en';
}

async function loadSettings() {
  settings = (await chrome.storage.local.get('settings')).settings || {};
  document.querySelectorAll('[data-setting]').forEach((cb) => { cb.checked = !!settings[cb.dataset.setting]; });
  applyLang();
}
async function setSetting(k, v) {
  settings = { ...((await chrome.storage.local.get('settings')).settings || {}), [k]: v };
  await chrome.storage.local.set({ settings });
  const cb = document.querySelector(`[data-setting="${k}"]`); if (cb) cb.checked = !!v;
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
    `<li>🗂 ${esc(new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))} · ${e.findings.length} tricks · <code>${esc(e.hash.slice(0, 12))}…</code></li>`).join('');
}

function render() {
  const ring = $('scoreRing');
  if (!state) {
    $('score').textContent = '–'; ring.className = 'ring green'; ring.style.setProperty('--p', 0);
    $('verdict').textContent = t('inactive'); $('verdict').style.setProperty('--vc', '#aaa');
    $('host').textContent = 'Open a shopping or booking site';
    $('findings').innerHTML = ''; $('count').textContent = '0'; $('statTricks').textContent = '0'; $('statFees').textContent = fmt(0);
    return;
  }
  $('score').textContent = state.score;
  ring.className = 'ring ' + state.badge;
  ring.style.setProperty('--p', state.score);
  $('verdict').textContent = I18N[hi() ? 'hi' : 'en'].verdict[state.badge];
  $('verdict').style.setProperty('--vc', { green: '#16a34a', amber: '#f59e0b', red: '#dc2626' }[state.badge]);
  try { $('host').textContent = new URL(state.url).host + ' · Trust Score'; } catch (e) { /* ignore */ }
  $('count').textContent = state.findings.length;
  $('statTricks').textContent = state.findings.length;
  const pageFees = state.findings.filter((f) => f.patternId === 'drip_pricing' || f.patternId === 'basket_sneaking').reduce((s, f) => s + (f.amount || 0), 0);
  $('statFees').textContent = fmt(ghost && ghost.diff > 0 ? ghost.diff : pageFees);

  const ul = $('findings');
  if (!state.findings.length) { ul.innerHTML = `<li class="empty"><b>✅</b>${esc(t('empty'))}</li>`; return; }
  const sorted = [...state.findings].sort((a, b) => ((b.severity === 'high' || b.fake) - (a.severity === 'high' || a.fake)));
  ul.innerHTML = '';
  sorted.forEach((f) => {
    const p = CC_PATTERNS[f.patternId] || {};
    const li = document.createElement('li');
    if (f.severity === 'high' || f.fake) li.className = 'high';
    const done = f.unticked ? 'removed' : f.blocked ? 'blocked' : '';
    li.innerHTML = `<div class="ic">${ICONS[f.patternId] || '⚠️'}</div>
      <div class="bd"><div class="tag">${esc(p.name)} · CCPA</div>
      <div class="tt"><span class="lbl">${esc(f.label)}</span>${done ? `<span class="ok">✓ ${done}</span>` : ''}</div>
      <div class="r">${esc(hi() ? p.hi : f.reason)}</div></div>`;
    li.title = 'Click to show on page';
    li.onclick = () => chrome.tabs.sendMessage(tabId, { type: 'cc:highlight', id: f.id }).catch(() => {});
    ul.appendChild(li);
  });
}

function renderGhost(g) {
  const box = $('ghostOut');
  if (!g || g.total == null) { box.className = 'ghost-empty'; box.textContent = 'Could not find a checkout total for this page.'; return; }
  box.className = 'ghost';
  box.innerHTML = `<div class="ghost-top">
      <div class="was">${hi() ? 'दिखाया' : 'Listed'}<br><s>${g.listed != null ? fmt(g.listed) : '—'}</s></div>
      <div class="arrow">➜</div>
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

async function doGhost() { const r = await bg('bg:ghost'); ghost = r.ghost; renderGhost(ghost); return ghost; }
async function doAlts() { altRes = await bg('bg:alternatives'); if (altRes.current) { ghost = altRes.current; renderGhost(ghost); } renderAlts(altRes); return altRes; }
async function doEvidence() { const r = await bg('bg:evidence'); await refresh(); $('complainOut').textContent = `✓ Evidence saved (SHA-256 ${r.hash.slice(0, 10)}…)`; return r; }
async function doComplain() { const r = await bg('bg:complain'); complaintText = r.text; $('complainOut').textContent = `✓ Form opened – ${r.filled.length} fields pre-filled. Review it and press Submit yourself.`; return r; }
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
document.querySelectorAll('.lang button').forEach((b) => { b.onclick = () => setSetting('lang', b.dataset.lang).then(() => { render(); if (ghost) renderGhost(ghost); if (altRes) renderAlts(altRes); }); });
document.querySelectorAll('[data-setting]').forEach((cb) => { cb.onchange = () => setSetting(cb.dataset.setting, cb.checked); });

// ---------------- Voice Guardian ----------------
async function say(text) {
  $('reply').hidden = false; $('reply').textContent = '🔊 ' + text;
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
