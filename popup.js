// Toolbar popup: picks the player style. Open NTS tabs update straight away (via bridge.js).
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const MODES = ['original', 'enhanced', 'redesign'];
  const form = document.getElementById('modes');

  api.storage.local.get('mode').then((stored) => {
    const mode = stored && MODES.includes(stored.mode) ? stored.mode : 'enhanced';
    const input = form.querySelector(`input[value="${mode}"]`);
    input.checked = true;
    input.focus();
  });

  form.addEventListener('change', (event) => {
    if (event.target.name === 'mode' && MODES.includes(event.target.value)) {
      api.storage.local.set({ mode: event.target.value });
    }
  });
})();
