// Better NTS: toolbar popup. Picks the player style and switches new episode notifications; open NTS tabs
// update straight away (via settings-bridge.js).
(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const MODES = ['original', 'enhanced', 'redesign'];
  const form = document.getElementById('modes');
  const notify = document.getElementById('notify');

  api.storage.local.get('mode').then((stored) => {
    const mode = stored && MODES.includes(stored.mode) ? stored.mode : 'enhanced';
    const input = form.querySelector(`input[value="${mode}"]`);
    input.checked = true;
    input.focus();
  });

  // Notifications are a background feature, not a player one, so unlike the other options they're here too.
  api.storage.local.get('newEpisodeNotifications').then((stored) => {
    notify.checked = stored.newEpisodeNotifications === true;
  });
  notify.addEventListener('change', () => api.storage.local.set({ newEpisodeNotifications: notify.checked }));

  form.addEventListener('change', (event) => {
    if (event.target.name === 'mode' && MODES.includes(event.target.value)) {
      api.storage.local.set({ mode: event.target.value });
    }
  });
})();
