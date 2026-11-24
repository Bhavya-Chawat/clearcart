const FIELDS = ['elevenKey', 'voiceId', 'theme', 'lang', 'seniorMode', 'autoSpeak', 'userName', 'userEmail', 'complaintUrl', 'backendUrl'];
const $ = (id) => document.getElementById(id);
const DEFAULT_THEME = 'light';
const applyTheme = (t) => { document.documentElement.dataset.theme = t || DEFAULT_THEME; };
applyTheme('');

chrome.storage.local.get('settings').then(({ settings = {} }) => {
  applyTheme(settings.theme);
  FIELDS.forEach((k) => {
    const el = $(k); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k] || (k === 'complaintUrl' ? 'http://localhost:8000/complaint.html' : k === 'lang' ? 'en' : k === 'theme' ? 'light' : '');
  });
});

$('theme').addEventListener('change', () => applyTheme($('theme').value));
// keep the theme picker in step if it is changed from the side panel while this page is open
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.settings && c.settings.newValue) { const t = c.settings.newValue.theme || DEFAULT_THEME; $('theme').value = t; applyTheme(t); }
});

$('save').addEventListener('click', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  FIELDS.forEach((k) => { const el = $(k); settings[k] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
  await chrome.storage.local.set({ settings });
  $('status').textContent = '✓ Saved';
  setTimeout(() => { $('status').textContent = ''; }, 2000);
});

$('mic').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    $('micStatus').textContent = '✓ Microphone allowed';
  } catch (e) {
    $('micStatus').textContent = '✗ ' + e.message;
  }
});
