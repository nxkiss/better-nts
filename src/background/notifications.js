// Better NTS: new episode notifications
//
// Once an hour, checks the shows you follow and shows a desktop notification when one has a new
// episode in the archive. Off by default; switched on from the toolbar popup or the player's menu.
//
// session-bridge.js passes us your NTS sign-in (Firebase user id and refresh token) from nts.live,
// and we refresh the ID token ourselves so checks keep working with nts.live closed. Follows are
// read the way NTS's site does: "favourites" docs with an empty episode_alias, looked up by device
// id. Each show's newest episode is "latest_episode" on its "shows" doc. The first check only
// records the latest episodes, so switching on doesn't notify for every show at once, and three or
// more new episodes at once get a single notification instead of one each.
//
// Switching the option off or signing out of NTS deletes the stored sign-in. Nothing runs in the
// "Original NTS" style.

(() => {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;

  const FIREBASE_API_KEY = 'AIzaSyA4Qp5AvHC8Rev72-10-_DY614w_bxUCJU'; // NTS's production web app
  const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/nts-ios-app/databases/(default)/documents';
  const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
  const NTS = 'https://www.nts.live';
  const FOLLOWED_PAGE = '/my-nts/favourites/shows';

  // Extension storage
  const MODE = 'mode'; // the player style (settings-bridge.js)
  const OPTION = 'newEpisodeNotifications'; // the on/off option (settings-bridge.js)
  const SESSION = 'notifySession'; // { uid, refreshToken, idToken, expiresAt }
  const SEEN = 'notifySeen'; // show alias -> { episode, date }

  const ALARM = 'bnts-new-episodes';
  const PERIOD_MINUTES = 60;
  const TOKEN_MARGIN_MS = 60000; // refresh the ID token when it has less than this left
  const IN_LIMIT = 10; // values in a Firestore "in" filter: NTS's own code sticks to 10
  const ID_PREFIX = 'bnts:'; // notification id: this, the nts.live path to open, then an optional #...
  const GROUP_FROM = 3; // this many new episodes in one check or more get a single notification
  const GROUP_NAMES = 3; // shows named in that notification before "and N more"

  const signedOut = (message) => Object.assign(new Error(message), { signedOut: true });

  function forget() {
    return api.storage.local.remove([SESSION, SEEN]);
  }

  // ------------------------------------------------------------------ sign-in

  async function idToken(session) {
    if (session.idToken && session.expiresAt > Date.now() + TOKEN_MARGIN_MS) return session.idToken;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
    });
    // Revoked, password changed or account gone: wait for a fresh sign-in from nts.live.
    if ([400, 401, 403].includes(res.status)) throw signedOut(`token refresh refused (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`token refresh failed (HTTP ${res.status})`);
    const data = await res.json();
    if (data.user_id !== session.uid) throw signedOut('token belongs to another user');
    const next = {
      uid: session.uid,
      refreshToken: data.refresh_token || session.refreshToken,
      idToken: data.id_token,
      expiresAt: Date.now() + Number(data.expires_in) * 1000,
    };
    await api.storage.local.set({ [SESSION]: next });
    return next.idToken;
  }

  // ------------------------------------------------------------------ Firestore

  const str = (value) => ({ stringValue: value });
  const equal = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: str(value) } });
  const among = (field, values) => ({
    fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: values.map(str) } } },
  });

  // -> the matching docs' fields
  async function runQuery(token, structuredQuery) {
    const res = await fetch(`${FIRESTORE}:runQuery`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    });
    if (res.status === 401 || res.status === 403) throw signedOut(`Firestore refused (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`Firestore query failed (HTTP ${res.status})`);
    const rows = await res.json();
    const failed = rows.find((row) => row.error);
    if (failed) throw new Error(`Firestore query failed: ${failed.error.message}`);
    return rows.filter((row) => row.document).map((row) => row.document.fields);
  }

  // The device ids NTS's site looks up your favourites with: your user id and your devices.
  async function deviceIds(token, uid) {
    const devices = await runQuery(token, {
      from: [{ collectionId: 'user_devices' }],
      where: equal('firebase_user_uid', uid),
    });
    const ids = [uid];
    for (const device of devices) {
      const id = device.device_id && device.device_id.stringValue;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, IN_LIMIT);
  }

  // Follows of guest hosts are an episode path ("guests/episodes/...") with no new episodes: left out.
  async function followedShows(token, uid) {
    const filters = [among('device_id', await deviceIds(token, uid)), equal('episode_alias', '')];
    const favourites = await runQuery(token, {
      from: [{ collectionId: 'favourites' }],
      where: { compositeFilter: { op: 'AND', filters } },
      orderBy: [{ field: { fieldPath: 'created_at' }, direction: 'DESCENDING' }],
    });
    const aliases = favourites.map((f) => f.show_alias && f.show_alias.stringValue);
    return [...new Set(aliases.filter((a) => a && !a.includes('/')))];
  }

  // -> show alias -> { show, episode, name, date }
  async function latestEpisodes(token, aliases) {
    const latest = {};
    for (let i = 0; i < aliases.length; i += IN_LIMIT) {
      const shows = await runQuery(token, {
        from: [{ collectionId: 'shows' }],
        where: among('show_alias', aliases.slice(i, i + IN_LIMIT)),
      });
      for (const show of shows) {
        const ep = show.latest_episode && show.latest_episode.mapValue && show.latest_episode.mapValue.fields;
        if (!ep || !ep.episode_alias) continue;
        latest[show.show_alias.stringValue] = {
          show: (show.name && show.name.stringValue) || show.show_alias.stringValue,
          episode: ep.episode_alias.stringValue,
          name: (ep.name && ep.name.stringValue) || '',
          date: (ep.broadcast_date && ep.broadcast_date.timestampValue) || '',
        };
      }
    }
    return latest;
  }

  // ------------------------------------------------------------------ notifications

  function notify(id, title, message) {
    api.notifications.create(id, {
      type: 'basic',
      iconUrl: api.runtime.getURL('icons/icon-128.png'),
      title,
      message,
    });
  }

  // "A", "A and B", "A, B and C", "A, B, C and 2 more"
  function listNames(names) {
    if (names.length > GROUP_NAMES) {
      return `${names.slice(0, GROUP_NAMES).join(', ')} and ${names.length - GROUP_NAMES} more`;
    }
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  // fresh: [{ alias, show, episode, name }]
  function notifyNew(fresh) {
    if (fresh.length >= GROUP_FROM) {
      notify(
        `${ID_PREFIX}${FOLLOWED_PAGE}#${Date.now()}`,
        `${fresh.length} new episodes on NTS`,
        `From ${listNames(fresh.map((f) => f.show))}`
      );
      return;
    }
    for (const f of fresh) {
      notify(
        `${ID_PREFIX}/shows/${f.alias}/episodes/${f.episode}`,
        f.show,
        f.name && f.name !== f.show ? `New episode: ${f.name}` : 'New episode on NTS'
      );
    }
  }

  api.notifications.onClicked.addListener((id) => {
    if (!id.startsWith(ID_PREFIX)) return;
    api.tabs.create({ url: NTS + id.slice(ID_PREFIX.length).split('#')[0] });
    api.notifications.clear(id);
  });

  // ------------------------------------------------------------------ checking

  async function check() {
    const stored = await api.storage.local.get([MODE, OPTION, SESSION, SEEN]);
    if (stored[OPTION] !== true || !stored[SESSION]) return;
    if (stored[MODE] === 'original') {
      // Forget what we'd seen, so switching back starts with a quiet first check.
      await api.storage.local.remove(SEEN);
      return;
    }
    const session = stored[SESSION];
    const firstCheck = !stored[SEEN];
    const seen = stored[SEEN] || {};

    let latest;
    try {
      const token = await idToken(session);
      latest = await latestEpisodes(token, await followedShows(token, session.uid));
    } catch (e) {
      if (e.signedOut) await forget();
      console.warn('[Better NTS] Could not check for new episodes', e);
      return;
    }

    // Unfollowed shows drop out; newly followed ones are recorded without a notification.
    const next = {};
    const fresh = [];
    for (const [alias, latestEp] of Object.entries(latest)) {
      const before = seen[alias];
      next[alias] = { episode: latestEp.episode, date: latestEp.date };
      if (firstCheck || !before || before.episode === latestEp.episode) continue;
      if (latestEp.date && before.date && latestEp.date < before.date) continue; // an older episode resurfaced
      fresh.push(Object.assign({ alias }, latestEp));
    }
    notifyNew(fresh);

    // The option may have been switched off, or someone else signed in, while we were checking.
    const now = await api.storage.local.get([OPTION, SESSION]);
    if (now[OPTION] === true && now[SESSION] && now[SESSION].uid === session.uid) {
      await api.storage.local.set({ [SEEN]: next });
    }
  }

  // One check at a time: the alarm, a new sign-in and switching the option on can all start one.
  let running = null;
  function checkSoon() {
    if (!running) running = check().finally(() => (running = null));
    return running;
  }

  async function schedule() {
    const stored = await api.storage.local.get(OPTION);
    if (stored[OPTION] === true) {
      if (!(await api.alarms.get(ALARM))) {
        api.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES, delayInMinutes: 1 });
      }
      return;
    }
    await api.alarms.clear(ALARM);
    await forget();
  }

  // From session-bridge.js: { type: 'bnts:session', uid, refreshToken } or { type: 'bnts:session', signedOut: true }
  async function onSession(message) {
    const stored = await api.storage.local.get([MODE, OPTION, SESSION]);
    if (stored[OPTION] !== true || stored[MODE] === 'original') return;
    if (message.signedOut) {
      await forget();
      return;
    }
    if (typeof message.uid !== 'string' || typeof message.refreshToken !== 'string') return;
    const current = stored[SESSION];
    if (current && current.uid === message.uid && current.refreshToken === message.refreshToken) return;
    if (current && current.uid !== message.uid) await api.storage.local.remove(SEEN); // someone else signed in
    await api.storage.local.set({ [SESSION]: { uid: message.uid, refreshToken: message.refreshToken } });
    checkSoon();
  }

  // ------------------------------------------------------------------ events

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) checkSoon();
  });

  api.runtime.onInstalled.addListener(schedule);
  api.runtime.onStartup.addListener(schedule);

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[OPTION]) schedule();
  });

  api.runtime.onMessage.addListener((message, sender) => {
    if (message && message.type === 'bnts:session' && sender.id === api.runtime.id) onSession(message);
  });
})();
