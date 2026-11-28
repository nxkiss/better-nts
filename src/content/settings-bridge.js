// Better NTS: settings bridge
//
// Runs in the extension's isolated world at document_start. It can use extension storage, which
// player.js (in the page's world) can't. It mirrors the settings onto <html>:
//   data-bnts-mode="..."       the player style, changed from the toolbar popup or the player's menu
//   data-bnts-new-tab="on|off" options, changed from the Options section of the player's menu
//   data-bnts-notify="on|off"  new episode notifications, from the player's menu or the toolbar popup

(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const MODES = ['original', 'enhanced', 'redesign'];
  const DEFAULT_MODE = 'enhanced';
  const STORAGE_KEY = 'mode'; // extension storage
  const CACHE_KEY = 'better-nts:mode'; // nts.live localStorage, so the mode applies before the first paint
  const root = document.documentElement;

  // Versions before the rename to "Better NTS" used other localStorage keys: move them over once.
  function migrateOldKeys() {
    const renamed = {
      'nts-tracklist-seek:mode': 'better-nts:mode',
      'nts-tracklist-seek:volume': 'better-nts:volume',
      'nts-tracklist-seek:muted': 'better-nts:muted',
      'nts-tracklist-seek:drawer-tab': 'better-nts:drawer-tab',
    };
    try {
      for (const [oldKey, newKey] of Object.entries(renamed)) {
        const value = localStorage.getItem(oldKey);
        if (value === null) continue;
        if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
      }
      localStorage.removeItem('nts-tracklist-seek:playback-rate'); // the speed control was removed
    } catch (e) {
      /* storage blocked: nothing to migrate */
    }
  }

  function apply(mode) {
    const value = MODES.includes(mode) ? mode : DEFAULT_MODE;
    if (root.dataset.bntsMode !== value) root.dataset.bntsMode = value;
    try {
      localStorage.setItem(CACHE_KEY, value);
    } catch (e) {
      /* storage blocked: the mode still applies, it just isn't cached */
    }
  }

  migrateOldKeys();

  let cached = null;
  try {
    cached = localStorage.getItem(CACHE_KEY);
  } catch (e) {
    cached = null;
  }
  apply(cached);

  api.storage.local.get(STORAGE_KEY).then((stored) => {
    if (stored && MODES.includes(stored[STORAGE_KEY])) apply(stored[STORAGE_KEY]);
    else api.storage.local.set({ [STORAGE_KEY]: root.dataset.bntsMode });
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) apply(changes[STORAGE_KEY].newValue);
  });

  // On/off options. player.js asks for a change with the "bnts:set-option" event.
  const OPTIONS = {
    newTabClick: { attribute: 'bntsNewTab', fallback: true },
    newEpisodeNotifications: { attribute: 'bntsNotify', fallback: false },
  };

  function applyOption(key, value) {
    const option = OPTIONS[key];
    root.dataset[option.attribute] = (typeof value === 'boolean' ? value : option.fallback) ? 'on' : 'off';
  }

  for (const key of Object.keys(OPTIONS)) applyOption(key, undefined);
  api.storage.local.get(Object.keys(OPTIONS)).then((stored) => {
    for (const key of Object.keys(OPTIONS)) applyOption(key, stored && stored[key]);
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(OPTIONS)) if (changes[key]) applyOption(key, changes[key].newValue);
  });

  document.addEventListener('bnts:set-option', (event) => {
    const { key, value } = event.detail || {};
    if (!(key in OPTIONS) || typeof value !== 'boolean') return;
    applyOption(key, value);
    api.storage.local.set({ [key]: value });
  });

  // The "Player style" menu inside the player asks for a change with this event.
  document.addEventListener('bnts:set-mode', (event) => {
    const mode = event.detail;
    if (!MODES.includes(mode)) return;
    apply(mode);
    api.storage.local.set({ [STORAGE_KEY]: mode });
  });
})();
