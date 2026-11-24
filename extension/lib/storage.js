// Storage wrapper – chrome.storage.local today; swap these functions for Supabase calls later.
(function (root) {
  const local = chrome.storage.local;
  const CCStore = {
    async getEvidence() { return (await local.get('evidence')).evidence || []; },
    async addEvidence(rec) { const list = await CCStore.getEvidence(); list.push(rec); await local.set({ evidence: list }); return list.length; },
    async clearEvidence() { await local.set({ evidence: [] }); },
    async getSaved() { return (await chrome.storage.session.get('saved')).saved || 0; },
    async addSaved(n) { const v = (await CCStore.getSaved()) + (Number(n) || 0); await chrome.storage.session.set({ saved: v }); return v; },
    async getPriceHistory() { return (await local.get('priceHistory')).priceHistory || {}; }
  };
  root.CCStore = CCStore;
})(typeof self !== 'undefined' ? self : window);
