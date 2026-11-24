const FIELDS = ['elevenKey', 'voiceId', 'lang', 'seniorMode', 'autoSpeak', 'userName', 'userEmail', 'complaintUrl', 'backendUrl'];
const $ = (id) => document.getElementById(id);

chrome.storage.local.get('settings').then(({ settings = {} }) => {
  FIELDS.forEach((k) => {
    const el = $(k); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k] || (k === 'complaintUrl' ? 'http://localhost:8000/complaint.html' : k === 'lang' ? 'en' : '');
  });
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
