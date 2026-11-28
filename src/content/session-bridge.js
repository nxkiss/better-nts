// Better NTS: sign-in for new episode notifications
//
// Runs in the extension's isolated world on nts.live. While new episode notifications are on, it
// reads NTS's Firebase sign-in (the site keeps it in IndexedDB) and passes your user id and refresh
// token to the background worker (src/background/notifications.js). If you're signed out of NTS,
// it tells the worker to forget the sign-in. Nothing happens in the "Original NTS" style.

(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const OPTION = 'newEpisodeNotifications';
  const AUTH_KEY = 'firebase:authUser:AIzaSyA4Qp5AvHC8Rev72-10-_DY614w_bxUCJU:[DEFAULT]';

  // -> NTS's signed-in Firebase user, null when signed out, undefined when it can't be read
  function readFirebaseUser() {
    return new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open('firebaseLocalStorageDb');
      } catch (e) {
        resolve(undefined);
        return;
      }
      request.onupgradeneeded = () => {
        // No database yet: leave creating it to NTS's Firebase code.
        request.transaction.abort();
        resolve(null);
      };
      request.onerror = () => resolve(undefined);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const get = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').get(AUTH_KEY);
          get.onsuccess = () => resolve(get.result ? get.result.value : null);
          get.onerror = () => resolve(undefined);
        } catch (e) {
          resolve(undefined);
        } finally {
          db.close(); // closes once the read is done
        }
      };
    });
  }

  async function sendSession() {
    const stored = await api.storage.local.get(['mode', OPTION]);
    if (stored[OPTION] !== true || stored.mode === 'original') return;
    const user = await readFirebaseUser();
    if (user === undefined) return;
    const refreshToken = user && user.stsTokenManager && user.stsTokenManager.refreshToken;
    if (user && user.uid && refreshToken) {
      api.runtime.sendMessage({ type: 'bnts:session', uid: user.uid, refreshToken });
    } else {
      api.runtime.sendMessage({ type: 'bnts:session', signedOut: true });
    }
  }

  sendSession();

  // Switching the option on, or leaving "Original NTS", starts it straight away.
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[OPTION] || changes.mode)) sendSession();
  });

  // Signing in or out doesn't reload the page: check again when the tab comes back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendSession();
  });
})();
