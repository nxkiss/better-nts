// NTS Tracklist Seek: settings bridge.
// Runs in the extension's isolated world (it can use extension storage; content.js, in the page's
// world, can't). It keeps <html data-nts-seek-mode="..."> in sync with the setting, which the
// toolbar popup and the player's own "Player style" menu both change.

(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const MODES = ['original', 'enhanced', 'redesign'];
  const DEFAULT_MODE = 'enhanced';
  const STORAGE_KEY = 'mode';
  const CACHE_KEY = 'nts-tracklist-seek:mode'; // page localStorage, so the mode applies before the first paint
  const root = document.documentElement;

  function apply(mode) {
    const value = MODES.includes(mode) ? mode : DEFAULT_MODE;
    if (root.dataset.ntsSeekMode !== value) root.dataset.ntsSeekMode = value;
    try {
      localStorage.setItem(CACHE_KEY, value);
    } catch (e) {
      /* storage blocked: the mode still applies, it just isn't cached */
    }
  }

  let cached = null;
  try {
    cached = localStorage.getItem(CACHE_KEY);
  } catch (e) {
    cached = null;
  }
  apply(cached);

  api.storage.local.get(STORAGE_KEY).then((stored) => {
    if (stored && MODES.includes(stored[STORAGE_KEY])) apply(stored[STORAGE_KEY]);
    else api.storage.local.set({ [STORAGE_KEY]: root.dataset.ntsSeekMode });
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) apply(changes[STORAGE_KEY].newValue);
  });

  // The "Player style" menu inside the player asks for a change with this event.
  document.addEventListener('nts-seek:set-mode', (event) => {
    const mode = event.detail;
    if (!MODES.includes(mode)) return;
    apply(mode);
    api.storage.local.set({ [STORAGE_KEY]: mode });
  });
})();
