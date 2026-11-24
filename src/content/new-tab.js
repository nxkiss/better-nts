// Better NTS: Ctrl/Cmd+click opens in a new tab
//
// NTS's site is a single-page app: its links and the play button on episode artwork go through its
// own click code, so Ctrl/Cmd+click plays the episode or navigates in the same tab. With the option
// on (Options in the player's style menu), we catch those clicks first (capture phase on window)
// and keep them away from NTS:
//   - links: the browser opens them in a new tab, as on any normal site
//   - the play button on episode/show artwork: opens the episode page (data-permalink) in a new tab
// Middle-clicking the artwork does the same. Nothing happens in the "Original NTS" style.
//
// Runs in the extension's isolated world at document_start, so it's registered before NTS's code.

(() => {
  'use strict';

  // settings-bridge.js keeps both attributes in sync with the stored settings.
  const root = document.documentElement;
  const isOn = () => root.dataset.bntsMode !== 'original' && root.dataset.bntsNewTab !== 'off';

  // A link we can hand to the browser: a real http(s) URL, not "#" or javascript:.
  function linkOf(target) {
    const a = target.closest('a[href]');
    if (!a) return null;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return null;
    try {
      const url = new URL(href, location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? a : null;
    } catch (e) {
      return null;
    }
  }

  // An artwork play button that knows which page it belongs to.
  function permalinkOf(target) {
    const el = target.closest('[data-permalink]');
    if (!el || el.closest('a[href]')) return null;
    const permalink = el.getAttribute('data-permalink');
    if (!permalink) return null;
    try {
      return new URL(permalink, location.origin).href;
    } catch (e) {
      return null;
    }
  }

  function handle(event, modifierClick) {
    if (!isOn() || !(event.target instanceof Element)) return;

    if (modifierClick && linkOf(event.target)) {
      // Let the browser do its normal Ctrl+click (new background tab); just keep NTS's router out of it.
      event.stopImmediatePropagation();
      return;
    }

    const url = permalinkOf(event.target);
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(url, '_blank', 'noopener');
  }

  window.addEventListener(
    'click',
    (event) => {
      if (event.button === 0 && (event.ctrlKey || event.metaKey)) handle(event, true);
    },
    true
  );

  // Middle click: links already open in a new tab natively, so only the artwork buttons need help.
  window.addEventListener(
    'auxclick',
    (event) => {
      if (event.button === 1 && !linkOf(event.target)) handle(event, false);
    },
    true
  );
  // Stop the middle-button press from starting autoscroll on the artwork.
  window.addEventListener(
    'mousedown',
    (event) => {
      if (isOn() && event.button === 1 && event.target instanceof Element && permalinkOf(event.target)) {
        event.preventDefault();
      }
    },
    true
  );
})();
