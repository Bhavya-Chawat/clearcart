// ClearCart DEFUSE – overlays, Clean View, auto-untick, Fake Button Shield, fake-alert blocker.
// Safety: never clicks pay/confirm/submit; only unticks add-ons and changes presentation.
(function () {
  let layer = null, toastBox = null;
  const badges = new Map(); // finding id -> badge el

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.id = 'cc-layer'; layer.setAttribute('data-cc-ui', '');
    document.documentElement.appendChild(layer);
    let raf = 0;
    const re = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; position(); }); };
    addEventListener('scroll', re, { passive: true, capture: true });
    addEventListener('resize', re);
    setInterval(position, 600);
    return layer;
  }
  let current = [];
  function position() {
    current.forEach((f) => {
      const b = badges.get(f.id); if (!b) return;
      const el = f.element;
      const r = el && el.isConnected ? el.getBoundingClientRect() : null;
      if (!r || (!r.width && !r.height) || el.closest('.cc-hidden, .cc-blocked')) { b.style.display = 'none'; return; }
      b.style.display = 'block';
      b.style.top = Math.max(0, r.top - 20 + (f.stack || 0) * 20) + 'px';
      b.style.left = Math.max(0, Math.max(r.left, r.right - b.offsetWidth)) + 'px';
    });
  }

  function render(findings, lang) {
    ensureLayer();
    current = findings;
    const live = new Set(findings.map((f) => f.id));
    for (const [id, b] of badges) if (!live.has(id)) { b.remove(); badges.delete(id); }
    const perEl = new Map();
    findings.forEach((f) => {
      const p = CC_PATTERNS[f.patternId] || {};
      const sev = p.severity === 'high' || (f.extra && f.extra.fake) ? 'high' : 'med';
      f.stack = perEl.get(f.element) || 0; perEl.set(f.element, f.stack + 1);
      if (f.element && f.element.classList && !f.fakeButton) {
        f.element.classList.add(sev === 'high' ? 'cc-flag-high' : 'cc-flag-med');
      }
      let b = badges.get(f.id);
      if (!b) {
        b = document.createElement('div');
        b.className = 'cc-badge'; b.setAttribute('data-cc-ui', '');
        layer.appendChild(b); badges.set(f.id, b);
      }
      b.classList.toggle('cc-badge-high', sev === 'high');
      b.textContent = '⚠ ' + f.label;
      b.title = `${p.name || ''}: ${f.reason}\n\n${lang === 'hi' ? p.hi : p.en}`;
    });
    position();
  }

  function highlight(f) {
    if (!f || !f.element) return;
    f.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    f.element.classList.add('cc-pulse');
    setTimeout(() => f.element.classList.remove('cc-pulse'), 2200);
  }

  // ---------- Clean View ----------
  function cleanView(on, findings) {
    findings.forEach((f) => {
      const el = f.element; if (!el || !el.isConnected) return;
      if (f.patternId === 'false_urgency' || f.patternId === 'nagging') el.classList.toggle('cc-hidden', on);
      if (f.patternId === 'confirm_shaming') {
        if (on && el.dataset.ccOrigText === undefined) { el.dataset.ccOrigText = el.textContent; el.textContent = 'No thanks'; el.classList.add('cc-equal'); }
        if (!on && el.dataset.ccOrigText !== undefined) { el.textContent = el.dataset.ccOrigText; delete el.dataset.ccOrigText; el.classList.remove('cc-equal'); }
      }
      if (f.patternId === 'interface_interference') el.classList.toggle('cc-equal', on);
    });
  }

  // ---------- Auto-untick ----------
  function untick(f) {
    const inp = f.input; if (!inp || f.unticked) return 0;
    f.unticked = true;
    const isInput = inp.matches('input');
    if (isInput ? !inp.checked : inp.getAttribute('aria-checked') !== 'true') return 0;
    if (isInput) {
      inp.checked = false;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      inp.setAttribute('aria-checked', 'false');
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const name = (f.extra && f.extra.name) || 'add-on';
    toast(`✅ Removed ${f.amount ? '₹' + f.amount + ' ' : ''}${name} you didn't choose`);
    return f.amount || 0;
  }

  // ---------- Fake Button Shield ----------
  let clickGuard = false;
  function shield(on, findings, realButtons) {
    findings.forEach((f) => {
      if (f.fakeButton) f.element.classList.toggle('cc-fake-btn', on);
      if (f.fakeClose) f.element.classList.toggle('cc-fake-close', on);
    });
    realButtons.forEach((el) => el.classList.toggle('cc-real-btn', on));
    if (on && !clickGuard) {
      clickGuard = true;
      document.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('.cc-fake-btn, .cc-fake-close');
        if (!t) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (t.classList.contains('cc-fake-close')) {
          const box = t.parentElement; if (box) box.classList.add('cc-hidden');
          toast('🛡️ That X was a trick link. ClearCart closed the ad safely.');
        } else toast('🛡️ Blocked: that button is an ad, not your download.');
      }, true);
    }
  }

  // ---------- Fake alert blocker ----------
  function blockScam(f) {
    if (!f.element || f.blocked) return;
    f.blocked = true;
    f.element.classList.add('cc-blocked');
    banner('🛡️ This was a scam popup. ClearCart blocked it. Do not call any number shown.');
  }

  function toast(msg) {
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement('div'); toastBox.id = 'cc-toasts'; toastBox.setAttribute('data-cc-ui', '');
      document.documentElement.appendChild(toastBox);
    }
    const t = document.createElement('div'); t.className = 'cc-toast'; t.textContent = msg;
    toastBox.appendChild(t); setTimeout(() => t.remove(), 5000);
  }
  function banner(msg) {
    const b = document.createElement('div'); b.className = 'cc-banner'; b.setAttribute('data-cc-ui', '');
    b.innerHTML = '<span></span><button aria-label="Dismiss">×</button>';
    b.firstChild.textContent = msg;
    b.lastChild.onclick = () => b.remove();
    document.documentElement.appendChild(b);
  }

  self.CCDefuser = { render, highlight, cleanView, untick, shield, blockScam, toast, banner };
})();
