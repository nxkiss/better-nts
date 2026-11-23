// NTS Tracklist Seek
//
// Makes NTS's episode player more useful:
//   - The full tracklist in the player, in a scrollable list that follows the current track.
//     Click a track (or press Enter on it) to jump to it.
//   - NTS's own "Save track" button on every track.
//   - A menu on every track: play from here, copy track info, copy a link to the track,
//     search for it on Discogs, Bandcamp, YouTube or Spotify.
//   - Filter the tracklist, copy the whole tracklist, copy a link to the current moment.
//   - Previous / next track buttons and a volume control next to NTS's ±30s buttons
//     (NTS's own volume slider only controls the live radio).
//   - Track markers on the progress bar, and a preview of the time and track under the mouse.
//   - Media keys and the lock screen show the current track and can skip between tracks.
//   - Keyboard shortcuts (press ? to see them).
//   - Links with ?t=15m48s start the episode at that time.
//
// Track timestamps in the player are an NTS Supporters feature, so everything based on them only
// switches on when NTS itself shows the timestamps to you.
//
// This script runs in the page's own JavaScript world (manifest "world": "MAIN") so it can use
// NTS's own "Save track" logic. Everything it adds reuses NTS's own class names, so it looks native.

(() => {
  'use strict';

  if (window.__ntsTracklistSeek) return;
  window.__ntsTracklistSeek = true;

  // ------------------------------------------------------------------ constants

  const SEL = {
    footerPlayer: '.footer-player--episode-player',
    openPlayer: '.footer-player--episode-player.footer-player--open',
    tracklist: '.episode-player-tracklist',
    ntsRow: '.episode-player-tracklist > .episode-player-tracklist__track',
    ntsSaveButton: '.save-track-button:not(.nts-seek-save)',
    promo: '.episode-player-tracklist__promo',
    time: '.episode-player-tracklist__time',
    artist: '.episode-player-tracklist__artist',
    title: '.episode-player-tracklist__title',
    episodeLink: '.expanded-episode-player__link, .soundcloud-player__thumbnail',
    episodeTitle: '.expanded-episode-player__title, .soundcloud-player__episode-title-container h4',
    player: '.soundcloud-player',
    progressBar: '.soundcloud-player__progress-bar',
    playButton: 'button.soundcloud-player__play-button',
    skipGroup: '.episode-player__skip',
    ntsSkipButton: '.episode-player__skip-button:not(.nts-seek-control)',
    radioAudio: '#nts-player-audio',
  };

  const LIST_ACTIVE = 'nts-seek-full-active'; // on NTS's list while ours replaces its 3 rows
  const PLAYING = 'episode-player-tracklist__track--is-playing'; // NTS's "now playing" row style

  const VOLUME_KEY = 'nts-tracklist-seek:volume';
  const MUTED_KEY = 'nts-tracklist-seek:muted';
  const VOLUME_STEP = 0.05;
  const SKIP_SECONDS = 30; // same as NTS's own skip buttons
  const PREV_RESTARTS_AFTER = 3; // "previous" restarts the current track after this many seconds
  const AUTOSCROLL_PAUSE_MS = 8000; // after you scroll the list yourself, stop following for a bit
  const RETRY_DELAYS_MS = [3000, 10000, 30000, 60000];
  const EPISODE_PATH = /^(?:https?:\/\/[^/]+)?(\/shows\/([^/?#]+)\/episodes\/([^/?#]+))/;
  const REACT_KEY = /^__react(?:Fiber|InternalInstance)\$/;

  // Player style, set by the toolbar popup or the "Player style" menu (stored by bridge.js):
  //   original: NTS untouched   enhanced: NTS's layout + features   redesign: + full-width bar and side drawer
  const MODES = [
    { id: 'original', label: 'Original NTS' },
    { id: 'enhanced', label: 'Enhanced' },
    { id: 'redesign', label: 'Redesign' },
  ];
  const MODE_CACHE_KEY = 'nts-tracklist-seek:mode';
  const TAB_KEY = 'nts-tracklist-seek:drawer-tab';

  // NTS's own icons (taken from nts.live) plus a few in the same style.
  const ICON = {
    save: {
      box: '0 0 32 32', size: 32, fill: 'none', paths: [
        { fill: '#fff', d: 'M27.64 13.081a12 12 0 1 1-8.059-8.534L19.08 6.15a10.32 10.32 0 1 0 6.93 7.34l1.63-.409Z' },
        { fill: '#fff', d: 'M28 8.988h-3.413V12.4h-1.575V8.988H19.6V7.413h3.412V4h1.575v3.413H28v1.575ZM20.8 16a4.8 4.8 0 1 1-9.6 0 4.8 4.8 0 0 1 9.6 0Zm-8.736 0a3.936 3.936 0 1 0 7.872 0 3.936 3.936 0 0 0-7.872 0Z' },
        { fill: '#fff', d: 'M16.6 16a.6.6 0 1 1-1.2 0 .6.6 0 0 1 1.2 0Z' },
      ],
    },
    unsave: {
      box: '0 0 32 32', size: 32, fill: 'none', paths: [
        { fill: '#fff', evenodd: true, d: 'M17.386 27.919c6.582-.766 11.298-6.722 10.533-13.305-.766-6.582-6.722-11.298-13.305-10.533-6.582.766-11.298 6.722-10.533 13.305.766 6.582 6.722 11.298 13.305 10.533ZM16 20.799a4.8 4.8 0 1 0 0-9.598 4.8 4.8 0 0 0 0 9.599Z' },
        { fill: '#fff', d: 'M16.6 16a.6.6 0 1 1-1.2 0 .6.6 0 0 1 1.2 0Z' },
      ],
    },
    unavailable: {
      box: '0 0 32 32', size: 32, fill: 'none', paths: [
        { fill: '#4C4C4C', d: 'M28 8.988h-3.412V12.4h-1.575V8.988h-3.411V7.413h3.412V4h1.574v3.412H28v1.576ZM6.713 8.406A12 12 0 0 0 23.595 25.29l-1.194-1.195a10.31 10.31 0 0 1-8.006 2.098A10.318 10.318 0 0 1 7.908 9.6L6.713 8.406Z' },
        { fill: '#4C4C4C', d: 'M11.868 13.562a4.8 4.8 0 0 0 6.573 6.574l-.636-.636a3.935 3.935 0 0 1-5.302-5.303l-.635-.635ZM14.2 12.5l-.635-.635a4.8 4.8 0 0 1 6.572 6.574l-.635-.636A3.935 3.935 0 0 0 14.2 12.5Zm9.897 9.9 1.195 1.194a11.999 11.999 0 0 0 2.348-10.513l-1.63.409a10.323 10.323 0 0 1-1.913 8.91ZM9.604 7.904 8.41 6.709a11.995 11.995 0 0 1 11.173-2.162L19.08 6.15a10.316 10.316 0 0 0-9.477 1.754h.001ZM4 5.692l.848-.848L27.14 27.14l-.848.848L4 5.692Z' },
      ],
    },
    prev: { box: '0 0 24 24', paths: ['M17.5 6.5v11L9.25 12z', 'M6.5 6.5h1.9v11H6.5z'] },
    next: { box: '0 0 24 24', paths: ['M6.5 6.5v11l8.25-5.5z', 'M15.6 6.5h1.9v11h-1.9z'] },
    more: { box: '0 0 24 24', paths: ['M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'] },
    copy: { box: '0 0 24 24', paths: ['M6.33 2h8.617v1.765H5.702v11.709H4V4.426C4 3.086 5.043 2 6.33 2z', 'M17.668 5.368C18.956 5.368 20 6.463 20 7.814v11.109c0 1.35-1.044 2.445-2.332 2.445H9.7c-1.288 0-2.332-1.095-2.332-2.445V7.814c0-1.35 1.044-2.446 2.332-2.446h7.968zm.527 1.847H9.173v12.307h9.022V7.215z'] },
    share: { box: '0 0 24 24', paths: ['M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z'] },
    search: { box: '0 0 24 24', paths: ['M17.74 15.6a8.53 8.53 0 0 0 1-1.45A9 9 0 1 0 16.35 17l4 4 1.42-1.41zm-10.34.81a7.22 7.22 0 1 1 9.74-3.08 7.22 7.22 0 0 1-9.74 3.08z'] },
    clear: { box: '0 0 24 24', paths: ['M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'] },
    keyboard: {
      box: '0 0 24 24', paths: [
        { evenodd: true, d: 'M2.75 5.5h18.5c.69 0 1.25.56 1.25 1.25v10.5c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V6.75c0-.69.56-1.25 1.25-1.25zM3 7v10h18V7z' },
        'M4.5 8.5h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h3v2h-3zM4.5 11.5h3v2h-3zm4 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2zM7 14.5h10v1.25H7z',
      ],
    },
    check: { box: '0 0 24 24', paths: ['M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'] },
    volumeHigh: { name: 'high', box: '0 0 24 24', paths: ['M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'] },
    volumeLow: { name: 'low', box: '0 0 24 24', paths: ['M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z'] },
    volumeOff: { name: 'off', box: '0 0 24 24', paths: ['M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z'] },
    // "Player style": settings sliders (a sidebar-looking icon was easy to mistake for the drawer button)
    layout: { box: '0 0 24 24', paths: ['M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z'] },
    external: { box: '0 0 600 600', paths: ['M514 86v330h-98V247.84l-264.83 266.3L86 447.55 354.21 184H184V86h330z'] },
  };

  // ------------------------------------------------------------------ small helpers

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(def, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', def.box);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (def.size) {
      svg.setAttribute('width', String(def.size));
      svg.setAttribute('height', String(def.size));
    }
    if (def.fill) svg.setAttribute('fill', def.fill);
    if (className) svg.setAttribute('class', className);
    for (const spec of def.paths) {
      const p = typeof spec === 'string' ? { d: spec } : spec;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', p.d);
      if (p.fill) path.setAttribute('fill', p.fill);
      if (p.evenodd) {
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
      }
      svg.append(path);
    }
    return svg;
  }

  // h('div', { class: 'x', text: 'hi', onclick: fn, 'aria-label': '…' }, ...children)
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function toSeconds(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // "0:11:50" -> 710, "11:50" -> 710, "~0:11:50" -> 710 (NTS marks estimates with ~)
  function parseTimestamp(text) {
    const parts = String(text || '').replace(/^[\s~]+/, '').trim().split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    let total = 0;
    for (const part of parts) {
      if (!/^\d+$/.test(part)) return null;
      total = total * 60 + Number(part);
    }
    return total;
  }

  // 710 -> "0:11:50" (the format NTS uses)
  function formatTimestamp(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // 3725 -> "1h2m5s", for share links
  function formatShareTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    return `${hours ? `${hours}h` : ''}${hours || minutes ? `${minutes}m` : ''}${s % 60}s`;
  }

  // Accepts "948", "15m48s", "1h2m5s" and "0:15:48".
  function parseShareTime(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    if (/^\d+$/.test(v)) return Number(v);
    const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
    return parseTimestamp(v);
  }


  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textOf(root, selector) {
    const node = root.querySelector(selector);
    return node ? node.textContent : '';
  }

  function trackLabel(track) {
    return [track.artist, track.title].filter(Boolean).join(' – ');
  }

  function hasTextSelection() {
    const selection = window.getSelection();
    return !!(selection && !selection.isCollapsed && selection.toString());
  }

  function isEditable(node) {
    return !!node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));
  }

  function isShown(node) {
    if (!node || !node.isConnected || !node.getClientRects().length) return false;
    if (typeof node.checkVisibility === 'function') return node.checkVisibility({ visibilityProperty: true });
    return getComputedStyle(node).visibility !== 'hidden';
  }

  // ------------------------------------------------------------------ the episode player

  // NTS's episode player always plays SoundCloud audio through this <audio> element.
  // (#nts-player-audio is the live radio player.)
  function findAudio() {
    return document.querySelector(`${SEL.player} audio`);
  }

  function radioIsPlaying() {
    const radio = document.querySelector(SEL.radioAudio);
    return !!(radio && !radio.paused);
  }

  function isEpisodePlayerOpen() {
    return !!document.querySelector(SEL.openPlayer);
  }

  function episodeDuration() {
    const audio = findAudio();
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    const bar = document.querySelector(SEL.progressBar);
    const max = bar ? Number(bar.max) : NaN;
    return Number.isFinite(max) && max > 0 ? max : null;
  }

  function currentTime() {
    const audio = findAudio();
    return audio ? audio.currentTime : 0;
  }

  // -> { path: "/shows/x/episodes/y", show: "x", episode: "y" } for the episode in the player
  function currentEpisode() {
    for (const link of document.querySelectorAll(SEL.episodeLink)) {
      const match = (link.getAttribute('href') || '').match(EPISODE_PATH);
      if (match) return { path: match[1], show: match[2], episode: match[3] };
    }
    return null;
  }

  function episodeName() {
    const node = document.querySelector(SEL.episodeTitle);
    return node ? node.textContent.trim() : '';
  }

  function episodeUrl(path, seconds) {
    const url = new URL(path, location.origin);
    if (seconds !== null && seconds !== undefined && seconds >= 1) url.searchParams.set('t', formatShareTime(seconds));
    return url.href;
  }

  // ------------------------------------------------------------------ player style (mode)

  function getMode() {
    let mode = document.documentElement.dataset.ntsSeekMode;
    if (!mode) {
      try {
        mode = localStorage.getItem(MODE_CACHE_KEY);
      } catch (e) {
        mode = null;
      }
    }
    return MODES.some((m) => m.id === mode) ? mode : 'enhanced';
  }

  const enabled = () => getMode() !== 'original';
  const redesigned = () => getMode() === 'redesign';

  function setMode(mode) {
    // bridge.js stores it (and updates the popup); setting it here too makes the switch instant.
    document.documentElement.dataset.ntsSeekMode = mode;
    try {
      localStorage.setItem(MODE_CACHE_KEY, mode);
    } catch (e) {
      /* fine: bridge.js keeps the real setting */
    }
    document.dispatchEvent(new CustomEvent('nts-seek:set-mode', { detail: mode }));
  }

  function showModeMenu(anchor) {
    const current = getMode();
    showMenu(anchor, 'Player style', [
      { heading: 'Player style' },
      ...MODES.map((m) => ({
        label: m.label,
        checked: m.id === current,
        onSelect: () => {
          if (m.id === getMode()) return;
          setMode(m.id);
          snackbar(m.id === 'original'
            ? 'Original NTS player. Switch back from the extension’s toolbar button.'
            : `Player style: ${m.label}`);
        },
      })),
    ]);
  }

  let lastMode = null;
  function onModeChange() {
    const mode = getMode();
    if (mode === lastMode) return;
    lastMode = mode;
    closePopover();
    hideBarTip();
    if (mode === 'original') {
      removeEverything();
      return;
    }
    if (mode !== 'redesign') removeRedesign();
    applyVolume();
    sync();
  }

  // Original mode: take out everything this extension added, so NTS is exactly as NTS made it.
  function removeEverything() {
    teardownView();
    removeRedesign();
    document.querySelectorAll('.nts-seek-control, .nts-seek-markers, .nts-seek-snackbar').forEach((n) => n.remove());
    document.querySelectorAll('.nts-seek-skip').forEach((n) => n.classList.remove('nts-seek-skip'));
    document.querySelectorAll('.nts-seek-bar').forEach((n) => n.classList.remove('nts-seek-bar'));
    document.documentElement.style.removeProperty('--nts-seek-drawer-height');
    releaseMediaSession();
    const ms = navigator.mediaSession;
    if (ms && media.base && ms.metadata && media.ours.has(ms.metadata) && typeof MediaMetadata === 'function') {
      ms.metadata = new MediaMetadata(media.base);
    }
    cancelSeekChecks();
    resetAudio();
  }

  // NTS never changes the episode's volume or speed itself, so "as NTS made it" means full volume,
  // unmuted, normal speed (an earlier version of this extension had a speed control).
  function resetAudio() {
    const audio = findAudio();
    if (!audio) return;
    audio.volume = 1;
    audio.muted = false;
    audio.defaultPlaybackRate = 1;
    audio.playbackRate = 1;
  }

  // ------------------------------------------------------------------ seeking

  // Each seek gets a token; the follow-up checks of an older seek never undo a newer one.
  let seekToken = 0;
  let seekTimers = [];
  let dispatchingBarInput = false;

  function cancelSeekChecks() {
    seekToken++;
    seekTimers.forEach(clearTimeout);
    seekTimers = [];
  }

  function clampToEpisode(seconds) {
    const duration = episodeDuration();
    const s = Math.max(0, seconds);
    return duration ? Math.min(s, Math.max(0, duration - 1)) : s;
  }

  // Fallback: move NTS's own progress slider, as if the user dragged it.
  function seekViaProgressBar(seconds) {
    const bar = document.querySelector(SEL.progressBar);
    if (!bar) return false;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(bar, String(Math.floor(seconds))); // native setter, so React notices
    dispatchingBarInput = true;
    try {
      bar.dispatchEvent(new Event('input', { bubbles: true }));
      bar.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      dispatchingBarInput = false;
    }
    return true;
  }

  function togglePlay() {
    const button = document.querySelector(SEL.playButton);
    if (button) {
      button.click(); // NTS's own button keeps its play/pause icon in sync
      return true;
    }
    const audio = findAudio();
    if (!audio) return false;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return true;
  }

  function seekTo(seconds, { play = false } = {}) {
    const target = clampToEpisode(seconds);
    const audio = findAudio();
    cancelSeekChecks();
    if (!audio) return seekViaProgressBar(target);

    audio.currentTime = target;
    if (play && audio.paused) togglePlay();

    // NTS's resume logic can snap the position back right after playback starts.
    // Re-apply this seek if that happens, unless a newer seek or the user moved it since.
    const token = seekToken;
    const startedAt = Date.now();
    for (const delay of [1000, 2500]) {
      seekTimers.push(
        setTimeout(() => {
          if (token !== seekToken) return;
          const elapsed = audio.paused ? 0 : ((Date.now() - startedAt) / 1000) * (audio.playbackRate || 1);
          const pos = audio.currentTime;
          if (pos < target - 3 || pos > target + elapsed + 5) {
            seekViaProgressBar(target);
            audio.currentTime = target;
          }
        }, delay)
      );
    }
    updateCurrent(false);
    updatePositionState(true);
    return true;
  }

  function seekBy(delta) {
    const audio = findAudio();
    if (!audio) return false;
    return seekTo(audio.currentTime + delta);
  }

  // ------------------------------------------------------------------ volume
  // NTS's own volume slider (in the live radio header) only controls the radio stream, so the episode
  // player gets its own. The level and mute state are remembered between visits.

  const sound = readStoredSound();

  function readStoredSound() {
    try {
      const volume = Number(localStorage.getItem(VOLUME_KEY));
      return {
        volume: localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(volume) ? clamp(volume, 0, 1) : 1,
        muted: localStorage.getItem(MUTED_KEY) === 'true',
      };
    } catch (e) {
      return { volume: 1, muted: false };
    }
  }

  function storeSound() {
    try {
      localStorage.setItem(VOLUME_KEY, String(sound.volume));
      localStorage.setItem(MUTED_KEY, String(sound.muted));
    } catch (e) {
      /* private mode: the level just isn't remembered */
    }
  }

  function applyVolume(audio = findAudio()) {
    if (!audio || !enabled()) return;
    if (Math.abs(audio.volume - sound.volume) > 0.001) audio.volume = sound.volume;
    if (audio.muted !== sound.muted) audio.muted = sound.muted;
  }

  function setVolume(volume, { muted = false } = {}) {
    sound.volume = Math.round(clamp(volume, 0, 1) * 100) / 100;
    sound.muted = muted;
    storeSound();
    applyVolume();
    updateVolumeControls();
  }

  function stepVolume(delta) {
    setVolume((sound.muted ? 0 : sound.volume) + delta);
    snackbar(`Volume ${Math.round(sound.volume * 100)}%`);
    return true;
  }

  function toggleMute() {
    if (sound.muted || sound.volume === 0) setVolume(sound.volume || 0.5);
    else setVolume(sound.volume, { muted: true });
    return true;
  }

  // The speaker button (mute / unmute) and a slider: always shown in the redesign, slides out on
  // hover in NTS's own (narrower) bar.
  function volumeControl(className) {
    const button = h('button', {
      type: 'button', class: 'nts-seek-volume__button nts-link', title: 'Mute (M)', 'aria-label': 'Mute',
      onclick: () => toggleMute(),
    });
    const slider = h('input', {
      type: 'range', class: 'nts-seek-volume__slider', min: '0', max: '100', step: '1',
      'aria-label': 'Volume', title: 'Volume (- and +)',
    });
    slider.addEventListener('input', () => setVolume(Number(slider.value) / 100));
    const control = h('div', { class: `nts-seek-volume ${className}` }, button, h('div', { class: 'nts-seek-volume__track' }, slider));
    control.addEventListener('wheel', (e) => {
      e.preventDefault();
      setVolume((sound.muted ? 0 : sound.volume) + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP));
    }, { passive: false });
    return control;
  }

  function updateVolumeControls() {
    const level = sound.muted ? 0 : sound.volume;
    const def = level === 0 ? ICON.volumeOff : level < 0.5 ? ICON.volumeLow : ICON.volumeHigh;
    const percent = Math.round(level * 100);
    for (const control of document.querySelectorAll('.nts-seek-volume')) {
      const button = control.querySelector('.nts-seek-volume__button');
      const slider = control.querySelector('.nts-seek-volume__slider');
      if (button.dataset.icon !== def.name) {
        button.dataset.icon = def.name;
        button.replaceChildren(icon(def));
      }
      const silent = level === 0;
      button.title = silent ? 'Unmute (M)' : 'Mute (M)';
      button.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
      button.setAttribute('aria-pressed', String(silent));
      if (slider.value !== String(percent)) slider.value = String(percent);
      slider.setAttribute('aria-valuetext', `${percent}%`);
      slider.style.setProperty('--nts-seek-volume', `${percent}%`);
    }
  }

  // ------------------------------------------------------------------ tracklist data

  // episode path -> { status: 'loading' | 'ready' | 'empty' | 'error', tracks, attempts, retryAt }
  const tracklists = new Map();

  function parseTracklistResponse(data) {
    const results = data && Array.isArray(data.results) ? data.results : [];
    const tracks = results
      .map((t) => {
        const exact = toSeconds(t.offset);
        const estimate = exact === null ? toSeconds(t.offset_estimate) : null;
        return {
          artist: String(t.artist ?? '').trim(),
          title: String(t.title ?? '').trim(),
          uid: t.uid ? String(t.uid) : null,
          offset: exact ?? estimate,
          estimated: exact === null && estimate !== null,
        };
      })
      .filter((t) => t.artist || t.title);
    if (tracks.length && tracks.every((t) => t.offset !== null)) tracks.sort((a, b) => a.offset - b.offset);
    return tracks;
  }

  // The same endpoint the NTS site uses for episode pages. Failed loads are retried with a back-off.
  function getTracklist(ep) {
    let entry = tracklists.get(ep.path);
    if (!entry) {
      entry = { status: 'loading', tracks: null, attempts: 0, retryAt: 0 };
      tracklists.set(ep.path, entry);
      loadTracklist(entry, ep);
    } else if (entry.status === 'error' && Date.now() >= entry.retryAt) {
      loadTracklist(entry, ep);
    }
    return entry;
  }

  function loadTracklist(entry, ep) {
    entry.status = 'loading';
    const url = `${location.origin}/api/v2/shows/${ep.show}/episodes/${ep.episode}/tracklist`;
    fetch(url, { credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 404) return { results: [] }; // no tracklist for this episode
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        entry.tracks = parseTracklistResponse(data);
        entry.status = entry.tracks.length ? 'ready' : 'empty';
      })
      .catch(() => {
        const delay = RETRY_DELAYS_MS[Math.min(entry.attempts, RETRY_DELAYS_MS.length - 1)];
        entry.attempts++;
        entry.status = 'error';
        entry.retryAt = Date.now() + delay;
        setTimeout(scheduleSync, delay + 50);
      })
      .then(scheduleSync);
  }

  window.addEventListener('online', () => {
    for (const entry of tracklists.values()) if (entry.status === 'error') entry.retryAt = 0;
    scheduleSync();
  });

  // ------------------------------------------------------------------ NTS's React app

  function fiberOf(node) {
    if (!node) return null;
    const key = Object.keys(node).find((k) => REACT_KEY.test(k));
    return key ? node[key] : null;
  }

  // NTS's Redux store, found through React's Provider. Optional: everything works without it.
  let store = null;
  let storeLookupAt = 0;

  function getStore() {
    if (store || Date.now() - storeLookupAt < 3000) return store;
    storeLookupAt = Date.now();
    const start = document.querySelector('.footer-player') || document.getElementById('react-content');
    let depth = 0;
    for (let f = fiberOf(start); f && depth < 400; f = f.return, depth++) {
      const candidate = f.memoizedProps && f.memoizedProps.store;
      if (candidate && typeof candidate.getState === 'function' && typeof candidate.subscribe === 'function') {
        store = candidate;
        watchStore(store);
        break;
      }
    }
    return store;
  }

  function storeState() {
    try {
      const s = getStore();
      return s ? s.getState() : null;
    } catch (e) {
      return null;
    }
  }

  function watchStore(s) {
    let lastMyTracks;
    let lastUserStatus;
    s.subscribe(() => {
      const state = s.getState() || {};
      if (state.myTracks !== lastMyTracks) {
        lastMyTracks = state.myTracks;
        scheduleSaveRefresh();
      }
      if (state.userStatus !== lastUserStatus) {
        lastUserStatus = state.userStatus;
        scheduleSync();
      }
    });
  }

  // ------------------------------------------------------------------ save track (NTS's own logic)

  // NTS's "Save track" button component. Any mounted one will do: we run its own code for our
  // tracks, so saving, the login prompt, "Saved in My NTS" and the saved state all work like NTS.
  function ntsSaveComponent() {
    const buttons = [
      ...document.querySelectorAll(`${SEL.tracklist} ${SEL.ntsSaveButton}`),
      ...document.querySelectorAll(SEL.ntsSaveButton),
    ];
    for (const button of buttons) {
      let depth = 0;
      for (let f = fiberOf(button); f && depth < 20; f = f.return, depth++) {
        const inst = f.stateNode;
        if (
          inst &&
          inst.props &&
          typeof inst._isSaved === 'function' &&
          typeof Object.getPrototypeOf(inst)._onClick === 'function'
        ) {
          return inst;
        }
      }
    }
    return null;
  }

  // The component, but pointing at another track.
  function saveProxy(inst, track, ep) {
    const proxy = Object.create(inst);
    proxy.props = Object.assign({}, inst.props, {
      trackUid: track.uid,
      artistNames: [track.artist],
      songTitle: track.title,
      episodeAlias: ep.episode,
      showAlias: ep.show,
    });
    proxy.state = { isAwaitingAuth: false };
    proxy.setState = () => {};
    proxy._trackMatches = (item) =>
      !!item && (typeof item.matches === 'function' ? item.matches(track.uid) : item.trackUid === track.uid);
    return proxy;
  }

  // -> { state: 'ready' | 'busy' | 'missing' | 'unavailable', saved }
  function saveStatus(inst, track, ep) {
    if (!track.uid) return { state: 'unavailable', saved: false };
    if (!inst) return { state: 'missing', saved: false };
    try {
      const props = inst.props;
      const loading = props.context === 'episodePlayer' ? props.isLoadingInPlayer : props.isLoading;
      const ready = !!(props.userStatus && props.userStatus.isReady) && !loading;
      const saved = !!Object.getPrototypeOf(inst)._isSaved.call(saveProxy(inst, track, ep));
      return { state: ready ? 'ready' : 'busy', saved };
    } catch (e) {
      return { state: 'missing', saved: false };
    }
  }

  function toggleSave(track, ep) {
    const inst = ntsSaveComponent();
    if (!inst || !track.uid) return false;
    try {
      Object.getPrototypeOf(inst)._onClick.call(saveProxy(inst, track, ep));
      return true;
    } catch (e) {
      console.warn('[NTS Tracklist Seek] Could not save track', e);
      return false;
    }
  }

  // ------------------------------------------------------------------ snackbar (NTS's look)

  let snackbarEl = null;
  let snackbarTimer = null;

  function snackbar(message) {
    if (!snackbarEl || !snackbarEl.isConnected) {
      snackbarEl = h('div', { class: 'snackbar snackbar--fade nts-seek-snackbar', role: 'status', 'aria-live': 'polite' },
        h('span', { class: 'snackbar__text' }));
      const host = document.getElementById('react-content') || document.getElementById('react-content-mobile') || document.body;
      host.append(snackbarEl);
      void snackbarEl.offsetWidth; // let the fade-in run
    }
    snackbarEl.firstChild.textContent = message;
    snackbarEl.classList.add('snackbar--show');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => snackbarEl && snackbarEl.classList.remove('snackbar--show'), 2600);
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const area = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0' });
      area.value = text;
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      area.remove();
      if (!ok) {
        snackbar('Could not copy :(');
        return;
      }
    }
    snackbar(message);
  }

  // ------------------------------------------------------------------ popovers (menus, help)

  let popover = null; // { el, anchor }

  function closePopover({ restoreFocus = false } = {}) {
    if (!popover) return;
    const { el, anchor } = popover;
    popover = null;
    el.remove();
    anchor.setAttribute('aria-expanded', 'false');
    anchor.classList.remove('nts-seek-anchor--open');
    if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  // Below / above the anchor, right-aligned; or at `point` (a right-click), opening to the right.
  function positionPopover(el, anchor, point) {
    const r = point
      ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
      : anchor.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    const left = clamp(point ? r.left : r.right - w, margin, Math.max(margin, vw - w - margin));
    let top = r.bottom + 4;
    if (top + ht > vh - margin) top = r.top - 4 - ht >= margin ? r.top - 4 - ht : Math.max(margin, vh - margin - ht);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  // Opens a popover under (or above) anchor. Clicking the same anchor again closes it.
  // With `point` (a right-click) it opens at the mouse instead, and always (re)opens.
  function openPopover(anchor, role, label, content, point) {
    const sameAnchor = popover && popover.anchor === anchor;
    closePopover();
    if (sameAnchor && !point) return null;
    const el = h('div', { class: `nts-seek-popover nts-seek-popover--${role}`, role, 'aria-label': label }, content);
    document.body.append(el);
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('nts-seek-anchor--open');
    popover = { el, anchor };
    positionPopover(el, anchor, point);
    return el;
  }

  // items: { label, onSelect } | { label, href } | { label, checked, onSelect } | { heading } | { separator: true }
  function showMenu(anchor, label, items, point) {
    const nodes = items.map((item) => {
      if (item.separator) return h('div', { class: 'nts-seek-popover__separator', role: 'separator' });
      if (item.heading) return h('div', { class: 'nts-seek-popover__heading', text: item.heading });
      if (item.href) {
        return h('a', {
          class: 'nts-seek-popover__item', role: 'menuitem', tabindex: '-1',
          href: item.href, target: '_blank', rel: 'noopener noreferrer',
          onclick: () => closePopover(),
        }, h('span', { text: item.label }), icon(ICON.external, 'nts-seek-popover__external'));
      }
      const isRadio = typeof item.checked === 'boolean';
      return h('button', {
        type: 'button', class: 'nts-seek-popover__item', tabindex: '-1',
        role: isRadio ? 'menuitemradio' : 'menuitem',
        'aria-checked': isRadio ? String(item.checked) : null,
        onclick: () => {
          closePopover({ restoreFocus: true });
          item.onSelect();
        },
      }, isRadio ? icon(ICON.check, 'nts-seek-popover__check') : null, h('span', { text: item.label }));
    });

    const el = openPopover(anchor, 'menu', label, nodes, point);
    if (!el) return;
    const entries = () => Array.from(el.querySelectorAll('[role^="menuitem"]'));
    el.addEventListener('keydown', (e) => {
      const list = entries();
      const i = list.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = list[(i + 1) % list.length];
      else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      else if (e.key === 'Escape') closePopover({ restoreFocus: true });
      else if (e.key === 'Tab') closePopover({ restoreFocus: true });
      else return;
      e.preventDefault();
      e.stopPropagation();
      if (next) next.focus();
    });
    const first = entries().find((n) => n.getAttribute('aria-checked') === 'true') || entries()[0];
    if (first) first.focus({ preventScroll: true });
  }

  const SHORTCUTS = [
    [['Space', 'K'], 'Play / pause'],
    [['←', 'J'], `Back ${SKIP_SECONDS} seconds`],
    [['→', 'L'], `Forward ${SKIP_SECONDS} seconds`],
    [['Shift+←', 'P'], 'Previous track'],
    [['Shift+→', 'N'], 'Next track'],
    [['-', '+'], 'Volume down / up'],
    [['M'], 'Mute / unmute'],
    [['↑', '↓'], 'Move through the tracklist'],
    [['?'], 'Show these shortcuts'],
  ];

  function showShortcuts(anchor) {
    const rows = SHORTCUTS.map(([keys, text]) => [
      h('dt', null, keys.map((k) => h('kbd', { text: k }))),
      h('dd', { text }),
    ]);
    const el = openPopover(anchor, 'dialog', 'Keyboard shortcuts', [
      h('div', { class: 'nts-seek-popover__title', text: 'Keyboard shortcuts' }),
      h('dl', { class: 'nts-seek-keys' }, rows),
    ]);
    if (!el) return;
    el.tabIndex = -1;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        closePopover({ restoreFocus: true });
      }
    });
    el.focus({ preventScroll: true });
  }

  function toggleShortcuts() {
    if (popover && popover.el.classList.contains('nts-seek-popover--dialog')) {
      closePopover({ restoreFocus: true });
      return true;
    }
    const candidates = [
      view && view.dom && view.dom.shortcutsButton,
      ...document.querySelectorAll('.nts-seek-volume__button'),
    ];
    const anchor = candidates.find(isShown);
    if (!anchor) return false;
    showShortcuts(anchor);
    return true;
  }

  // ------------------------------------------------------------------ the episode's tracks

  // view: what we know about the episode in the player.
  // { ep, tracks, timed (indexes with a time, in time order), version, currentIndex, access, dom }
  let view = null;

  function startView(ep) {
    teardownView();
    view = { ep, tracks: null, timed: [], version: 0, currentIndex: -1, access: null, dom: null };
    media.key = '';
  }

  function teardownView() {
    closePopover();
    unmountList();
    view = null;
  }

  function setTracks(tracks) {
    view.tracks = tracks.map((t) => Object.assign({}, t));
    view.currentIndex = -1;
    if (view.dom) unmountList();
    view.dom = null;
    indexTimes();
  }

  function indexTimes() {
    view.timed = view.tracks
      .map((t, i) => i)
      .filter((i) => view.tracks[i].offset !== null)
      .sort((a, b) => view.tracks[a].offset - view.tracks[b].offset);
    view.version++;
  }

  // Timestamps are an NTS Supporters feature: only use them when NTS shows them to this user.
  // true / false, or null while that isn't known yet.
  function timestampAccess() {
    const state = storeState();
    const status = state && state.userStatus;
    if (status && status.isReady && 'canSeePremiumFeature' in status) return !!status.canSeePremiumFeature;
    const list = document.querySelector(SEL.tracklist);
    if (!list) return null;
    return !list.querySelector(SEL.promo);
  }

  function featuresOn() {
    return !!(view && view.access === true && view.tracks && view.timed.length);
  }

  // The track playing at `now`: the last one that started.
  function trackIndexAt(now) {
    if (!view) return -1;
    let index = -1;
    for (const i of view.timed) {
      if (view.tracks[i].offset <= now + 0.5) index = i;
      else break;
    }
    return index;
  }

  function previousTarget(now) {
    if (!featuresOn()) return null;
    const cur = trackIndexAt(now);
    if (cur !== -1 && now - view.tracks[cur].offset > PREV_RESTARTS_AFTER) return view.tracks[cur].offset;
    const pos = view.timed.indexOf(cur);
    if (pos > 0) return view.tracks[view.timed[pos - 1]].offset;
    return now > PREV_RESTARTS_AFTER ? 0 : null;
  }

  function nextTarget(now) {
    if (!featuresOn()) return null;
    const duration = episodeDuration();
    for (const i of view.timed) {
      const offset = view.tracks[i].offset;
      if (offset > now + 0.5) return duration && offset >= duration ? null : offset;
    }
    return null;
  }

  function prevTrack() {
    const target = previousTarget(currentTime());
    if (target === null) return false;
    seekTo(target);
    return true;
  }

  function nextTrack() {
    const target = nextTarget(currentTime());
    if (target === null) return false;
    seekTo(target);
    return true;
  }

  // If NTS shows a time we don't have, take it from NTS's own rows.
  function learnFromNtsRows() {
    if (!view.tracks.some((t) => t.offset === null)) return;
    let learned = false;
    for (const ntsRow of document.querySelectorAll(SEL.ntsRow)) {
      const timeText = textOf(ntsRow, SEL.time);
      const offset = parseTimestamp(timeText);
      if (offset === null) continue;
      const key = `${normalize(textOf(ntsRow, SEL.artist))}|${normalize(textOf(ntsRow, SEL.title))}`;
      const i = view.tracks.findIndex((t) => t.offset === null && `${normalize(t.artist)}|${normalize(t.title)}` === key);
      if (i === -1) continue;
      view.tracks[i].offset = offset;
      view.tracks[i].estimated = timeText.trim().startsWith('~');
      learned = true;
      if (view.dom) updateRowTime(view.dom.rows[i]);
    }
    if (learned) indexTimes();
  }

  // ------------------------------------------------------------------ the full tracklist

  function buildList() {
    const v = view;
    const input = h('input', {
      type: 'text', class: 'nts-seek-filter__input', placeholder: 'Filter tracks',
      'aria-label': 'Filter tracks', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    });
    const clear = h('button', { type: 'button', class: 'nts-seek-filter__clear nts-link', title: 'Clear filter', 'aria-label': 'Clear filter', hidden: true },
      icon(ICON.clear));
    const count = h('span', { class: 'nts-seek-toolbar__count', 'aria-live': 'polite' });
    const iconButton = (def, title, onclick) =>
      h('button', { type: 'button', class: 'nts-seek-toolbar__button nts-link', title, 'aria-label': title, onclick }, icon(def));
    const shortcutsButton = iconButton(ICON.keyboard, 'Keyboard shortcuts (?)', (e) => showShortcuts(e.currentTarget));
    shortcutsButton.setAttribute('aria-haspopup', 'dialog');
    shortcutsButton.setAttribute('aria-expanded', 'false');

    const toolbar = h('div', { class: 'nts-seek-toolbar' },
      h('div', { class: 'nts-seek-filter', role: 'search' }, icon(ICON.search, 'nts-seek-filter__icon'), input, clear),
      count,
      iconButton(ICON.share, 'Copy link to the current moment', () => {
        copyText(episodeUrl(v.ep.path, currentTime()), 'Link copied');
      }),
      iconButton(ICON.copy, 'Copy tracklist', () => copyText(tracklistText(), 'Tracklist copied')),
      shortcutsButton,
      modeButton('nts-seek-toolbar__button nts-link'));

    const scroller = h('div', { class: 'nts-seek-full__scroller', role: 'list', 'aria-label': 'Tracklist' });
    const rows = v.tracks.map((track, index) => buildRow(track, index));
    const empty = h('div', { class: 'nts-seek-full__empty', text: 'No matching tracks', hidden: true });
    scroller.append(...rows.map((r) => r.row), empty);
    const playing = rows[v.currentIndex];
    if (playing) {
      playing.row.classList.add(PLAYING);
      playing.row.setAttribute('aria-current', 'true');
    }

    const root = h('div', { class: 'nts-seek-full' }, toolbar, scroller);
    v.dom = { root, scroller, rows, rowByEl: new Map(rows.map((r) => [r.row, r])), input, clear, count, empty,
      shortcutsButton, active: -1, query: '', lastUserScroll: 0 };

    const markUserScroll = () => {
      v.dom.lastUserScroll = Date.now();
    };
    scroller.addEventListener('wheel', markUserScroll, { passive: true });
    scroller.addEventListener('touchmove', markUserScroll, { passive: true });
    scroller.addEventListener('pointerdown', markUserScroll);
    scroller.addEventListener('scroll', () => {
      if (popover && scroller.contains(popover.anchor)) closePopover();
    }, { passive: true });
    scroller.addEventListener('click', onListClick);
    scroller.addEventListener('contextmenu', onListContextMenu);
    scroller.addEventListener('keydown', onListKeyDown);
    scroller.addEventListener('focusin', (e) => {
      const r = rowFromNode(e.target);
      if (r) setActiveRow(r.index, false);
    });

    input.addEventListener('input', () => applyFilter(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        applyFilter('');
      } else if (e.key === 'Escape') {
        input.blur();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        const first = visibleRows()[0];
        if (!first) return;
        setActiveRow(first.index, true);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      applyFilter('');
      input.focus();
    });

    updateCount();
    setActiveRow(Math.max(0, v.currentIndex), false);
  }

  function buildRow(track, index) {
    const time = h('div', { class: 'episode-player-tracklist__time' });
    const detail = h('div', { class: 'episode-player-tracklist__detail nts-seek-row__detail', tabindex: '-1' },
      time,
      h('div', null, visualiser()),
      h('div', { class: 'nts-seek-row__text' },
        h('div', { class: 'episode-player-tracklist__artist', text: track.artist }),
        h('div', { class: 'episode-player-tracklist__title', text: track.title })));
    const more = h('button', {
      type: 'button', class: 'nts-seek-row__more nts-link', tabindex: '-1', title: 'More options',
      'aria-label': `More options: ${trackLabel(track)}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    }, icon(ICON.more));
    const save = h('button', { type: 'button', class: 'save-track-button nts-seek-save', tabindex: '-1' });
    const row = h('div', { class: 'episode-player-tracklist__track nts-seek-row', role: 'listitem' },
      detail, h('div', { class: 'nts-seek-row__actions' }, more, save));

    const r = { track, index, row, detail, time, more, save, saveKey: '', haystack: '' };
    updateRowTime(r);
    return r;
  }

  function updateRowTime(r) {
    const t = r.track;
    const timed = t.offset !== null;
    r.time.textContent = timed ? `${t.estimated ? '~' : ''}${formatTimestamp(t.offset)}` : '--:--';
    r.time.classList.toggle('episode-player-tracklist__time--empty', !timed);
    if (t.estimated) r.time.title = 'Estimated timestamp';
    else r.time.removeAttribute('title');
    r.row.classList.toggle('nts-seek-row--no-time', !timed);
    if (timed) {
      r.detail.setAttribute('role', 'button');
      r.detail.setAttribute('aria-label', `Play from ${formatTimestamp(t.offset)}: ${trackLabel(t)}`);
    } else {
      r.detail.removeAttribute('role');
      r.detail.setAttribute('aria-label', `${trackLabel(t)} (no timestamp)`);
    }
    r.haystack = normalize(`${t.artist} ${t.title} ${r.time.textContent}`);
  }

  // The same little visualiser NTS shows next to the playing track, animated with CSS.
  function visualiser() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'visualiser episode-player-tracklist__visualiser nts-seek-visualiser');
    svg.setAttribute('viewBox', '-15 -15 130 130');
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('stroke', 'white');
    g.setAttribute('stroke-width', '10');
    g.setAttribute('transform', 'rotate(180, 50, 50)');
    for (const x of [10, 30, 50, 70, 90]) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'visualiser__bar');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', '100');
      g.append(line);
    }
    svg.append(g);
    return svg;
  }

  function mountList(list) {
    if (!view.dom) buildList();
    const root = view.dom.root;
    if (root.parentNode !== list) {
      list.insertBefore(root, list.firstChild);
      list.classList.add(LIST_ACTIVE);
      refreshSaves();
      updatePausedState();
      updateCurrent(true);
    } else if (!list.classList.contains(LIST_ACTIVE)) {
      list.classList.add(LIST_ACTIVE);
    }
  }

  function unmountList() {
    if (view && view.dom) view.dom.root.remove();
    document.querySelectorAll(`.${LIST_ACTIVE}`).forEach((n) => n.classList.remove(LIST_ACTIVE));
  }

  function listMounted() {
    return !!(view && view.dom && view.dom.root.isConnected);
  }

  function rowFromNode(node) {
    if (!listMounted() || !(node instanceof Element)) return null;
    const rowEl = node.closest('.nts-seek-row');
    return rowEl ? view.dom.rowByEl.get(rowEl) || null : null;
  }

  function visibleRows() {
    return view.dom.rows.filter((r) => !r.row.hidden);
  }

  // Roving tab stop: only one row (and its buttons) is in the Tab order; ↑/↓ move between rows.
  function setActiveRow(index, focus) {
    const d = view.dom;
    const r = d.rows[index];
    if (!r) return;
    if (d.active !== index) {
      const old = d.rows[d.active];
      if (old) [old.detail, old.more, old.save].forEach((n) => (n.tabIndex = -1));
      d.active = index;
    }
    [r.detail, r.more, r.save].forEach((n) => (n.tabIndex = 0));
    if (focus) {
      r.detail.focus({ preventScroll: true });
      r.row.scrollIntoView({ block: 'nearest' });
    }
  }

  function flash(row) {
    row.classList.remove('nts-seek-flash');
    void row.offsetWidth; // restart the animation if the row is clicked twice
    row.classList.add('nts-seek-flash');
    setTimeout(() => row.classList.remove('nts-seek-flash'), 700);
  }

  function playRow(r) {
    if (r.track.offset === null) return;
    seekTo(r.track.offset, { play: true });
    flash(r.row);
  }

  function onListClick(e) {
    if (e.button !== 0) return;
    const r = rowFromNode(e.target);
    if (!r) return;
    if (e.target.closest('.nts-seek-row__more')) {
      setActiveRow(r.index, false);
      openRowMenu(r);
      return;
    }
    if (e.target.closest('.nts-seek-save')) {
      setActiveRow(r.index, false);
      onSaveClick(r);
      return;
    }
    if (e.target.closest('button, a, input, label') || hasTextSelection()) return;
    setActiveRow(r.index, false);
    playRow(r);
    // A mouse click shouldn't leave focus on the row, so Space keeps meaning play / pause.
    if (e.detail > 0 && document.activeElement === r.detail) r.detail.blur();
  }

  function onListKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const r = rowFromNode(e.target);
    if (!r) return;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      openRowMenu(r);
      return;
    }
    const rows = visibleRows();
    const pos = rows.indexOf(r);
    let target = null;
    switch (e.key) {
      case 'Enter':
      case ' ':
        if (e.target !== r.detail) return;
        playRow(r);
        break;
      case 'ArrowDown':
        target = rows[Math.min(pos + 1, rows.length - 1)];
        break;
      case 'ArrowUp':
        if (pos === 0) {
          view.dom.input.focus();
          break;
        }
        target = rows[Math.max(pos - 1, 0)];
        break;
      case 'Home':
        target = rows[0];
        break;
      case 'End':
        target = rows[rows.length - 1];
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (target) {
      view.dom.lastUserScroll = Date.now();
      setActiveRow(target.index, true);
    }
  }

  // Right-click on a track opens its menu at the mouse (links and the filter keep the browser's menu).
  function onListContextMenu(e) {
    const r = rowFromNode(e.target);
    if (!r || e.target.closest('a, input') || hasTextSelection()) return;
    e.preventDefault();
    setActiveRow(r.index, false);
    openRowMenu(r, { x: e.clientX, y: e.clientY });
  }

  function openRowMenu(r, point) {
    const t = r.track;
    const query = encodeURIComponent([t.artist, t.title].filter(Boolean).join(' '));
    const items = [];
    if (t.offset !== null) items.push({ label: 'Play from here', onSelect: () => playRow(r) });
    items.push({ label: 'Copy track info', onSelect: () => copyText(`${t.artist} - ${t.title}`, 'Track info copied') });
    if (t.offset !== null) {
      items.push({ label: 'Copy link to this track', onSelect: () => copyText(episodeUrl(view.ep.path, t.offset), 'Link copied') });
    }
    items.push(
      { separator: true },
      { heading: 'Search on' },
      { label: 'Discogs', href: `https://www.discogs.com/search/?q=${query}&type=all` },
      { label: 'Bandcamp', href: `https://bandcamp.com/search?q=${query}` },
      { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${query}` },
      { label: 'Spotify', href: `https://open.spotify.com/search/${query}` }
    );
    showMenu(r.more, `Options: ${trackLabel(t)}`, items, point);
  }

  function applyFilter(value) {
    const d = view.dom;
    d.query = value;
    const terms = normalize(value).split(' ').filter(Boolean);
    let shown = 0;
    for (const r of d.rows) {
      const match = terms.every((term) => r.haystack.includes(term));
      r.row.hidden = !match;
      if (match) shown++;
    }
    d.empty.hidden = shown > 0;
    d.clear.hidden = !value;
    updateCount();
    if (d.rows[d.active] && d.rows[d.active].row.hidden) {
      const first = visibleRows()[0];
      if (first) setActiveRow(first.index, false);
    }
    if (terms.length) d.scroller.scrollTop = 0;
    else updateCurrent(true);
  }

  function updateCount() {
    const d = view.dom;
    const total = d.rows.length;
    const shown = d.query ? visibleRows().length : total;
    d.count.textContent = d.query ? `${shown} of ${total}` : `${total} ${total === 1 ? 'track' : 'tracks'}`;
  }

  function tracklistText() {
    const lines = [episodeName() || view.ep.episode, episodeUrl(view.ep.path), ''];
    for (const t of view.tracks) {
      const time = t.offset === null ? '' : `${t.estimated ? '~' : ''}${formatTimestamp(t.offset)}  `;
      lines.push(`${time}${t.artist} - ${t.title}`);
    }
    return lines.join('\n');
  }

  // ---- save buttons

  let saveRefreshTimer = null;

  function scheduleSaveRefresh() {
    clearTimeout(saveRefreshTimer);
    saveRefreshTimer = setTimeout(refreshSaves, 30);
  }

  function refreshSaves() {
    if (!listMounted()) return;
    const inst = ntsSaveComponent();
    for (const r of view.dom.rows) renderSave(r, inst);
  }

  function renderSave(r, inst) {
    const { state, saved } = saveStatus(inst, r.track, view.ep);
    const key = `${state}|${saved}`;
    if (r.saveKey === key) return;
    r.saveKey = key;
    const usable = state === 'ready';
    const title = state === 'unavailable'
      ? 'Track not available to save'
      : state === 'missing'
        ? 'Saving tracks isn’t available here right now'
        : saved ? 'Remove saved track' : 'Save track';
    r.save.disabled = !usable;
    r.save.classList.toggle('nts-link', usable); // like NTS: no hover effect when disabled
    r.save.classList.toggle('save-track-button--saved', saved);
    r.save.title = title;
    r.save.setAttribute('aria-label', `${title}: ${trackLabel(r.track)}`);
    r.save.setAttribute('aria-pressed', String(saved));
    r.save.replaceChildren(icon(state === 'unavailable' ? ICON.unavailable : saved ? ICON.unsave : ICON.save));
  }

  function onSaveClick(r) {
    if (!toggleSave(r.track, view.ep)) {
      snackbar('Unable to save track :(');
      return;
    }
    // NTS updates its store straight away; catch up even if we couldn't subscribe to it.
    scheduleSaveRefresh();
    setTimeout(refreshSaves, 400);
    setTimeout(refreshSaves, 2500);
  }

  // ---- following the current track

  function updatePausedState() {
    if (!listMounted()) return;
    const audio = findAudio();
    view.dom.root.classList.toggle('nts-seek-full--paused', !audio || audio.paused);
  }

  function scrollToCurrent(behavior) {
    const d = view.dom;
    const r = d.rows[view.currentIndex];
    if (!r || r.row.hidden) return;
    const box = d.scroller;
    const top = Math.max(0, r.row.offsetTop - box.clientHeight / 3);
    if (typeof box.scrollTo === 'function') box.scrollTo({ top, behavior });
    else box.scrollTop = top;
  }

  function updateCurrent(force) {
    if (!view || !view.tracks) return;
    const audio = findAudio();
    if (!audio) return;
    const index = featuresOn() ? trackIndexAt(audio.currentTime) : -1;
    const changed = index !== view.currentIndex;

    if (changed) {
      const previous = view.currentIndex;
      view.currentIndex = index;
      if (view.dom) {
        const old = view.dom.rows[previous];
        if (old) {
          old.row.classList.remove(PLAYING);
          old.row.removeAttribute('aria-current');
        }
        const cur = view.dom.rows[index];
        if (cur) {
          cur.row.classList.add(PLAYING);
          cur.row.setAttribute('aria-current', 'true');
          // Keep Tab landing on the playing track, unless the user is moving around the list.
          if (!view.dom.root.contains(document.activeElement)) setActiveRow(index, false);
        }
      }
      updateMediaSession(false);
      updateNow();
    }
    updateSkipControls();

    if (listMounted() && index >= 0 && (changed || force)) {
      const d = view.dom;
      const userBusy = Date.now() - d.lastUserScroll < AUTOSCROLL_PAUSE_MS || d.query || (popover && d.root.contains(popover.anchor));
      if (force || !userBusy) scrollToCurrent(force ? 'auto' : 'smooth');
    }
  }

  // ------------------------------------------------------------------ previous / next buttons (+ volume)

  function skipButton(def, label, onclick, extraClass) {
    return h('button', {
      type: 'button',
      class: `episode-player__skip-button mobile-link mobile-link--button nts-link nts-seek-control ${extraClass}`,
      title: label, 'aria-label': label, onclick,
    }, icon(def, 'episode-player__skip-icon nts-seek-skip-icon'));
  }

  function ensureSkipControls() {
    for (const group of document.querySelectorAll(SEL.skipGroup)) {
      if (group.querySelector(':scope > .nts-seek-control')) continue;
      const prev = skipButton(ICON.prev, 'Previous track (Shift+←)', () => prevTrack(), 'nts-seek-prev');
      const next = skipButton(ICON.next, 'Next track (Shift+→)', () => nextTrack(), 'nts-seek-next');
      group.classList.add('nts-seek-skip');
      group.insertBefore(prev, group.firstChild);
      group.append(next, volumeControl('nts-seek-control nts-seek-volume--compact'));
    }
    updateSkipControls();
    updateVolumeControls();
  }

  function updateSkipControls() {
    const on = featuresOn();
    const now = currentTime();
    const canPrev = on && previousTarget(now) !== null;
    const canNext = on && nextTarget(now) !== null;
    for (const b of document.querySelectorAll('.nts-seek-prev')) {
      b.hidden = !on;
      b.disabled = !canPrev;
    }
    for (const b of document.querySelectorAll('.nts-seek-next')) {
      b.hidden = !on;
      b.disabled = !canNext;
    }
  }

  // ------------------------------------------------------------------ progress bar: markers + preview

  let barTip = null;

  function ensureMarkers() {
    const bar = document.querySelector(SEL.progressBar);
    const wrap = bar && bar.parentElement;
    if (!wrap) return;
    if (!wrap.classList.contains('nts-seek-bar')) {
      wrap.classList.add('nts-seek-bar');
      wrap.addEventListener('pointermove', onBarHover);
      wrap.addEventListener('pointerleave', hideBarTip);
    }
    let layer = wrap.querySelector(':scope > .nts-seek-markers');
    if (!layer) {
      layer = h('div', { class: 'nts-seek-markers', 'aria-hidden': 'true' });
      wrap.append(layer);
    }
    const duration = episodeDuration();
    const on = featuresOn() && duration;
    const key = on ? `${view.ep.path}|${Math.round(duration)}|${view.version}` : 'off';
    if (layer.dataset.key === key) return;
    layer.dataset.key = key;
    const ticks = [];
    if (on) {
      for (const i of view.timed) {
        const offset = view.tracks[i].offset;
        if (offset <= 0 || offset >= duration) continue;
        ticks.push(h('span', { class: 'nts-seek-markers__tick', style: `left:${((offset / duration) * 100).toFixed(3)}%` }));
      }
    }
    layer.replaceChildren(...ticks);
  }

  function onBarHover(e) {
    if (!enabled()) return hideBarTip();
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const bar = e.currentTarget.querySelector(SEL.progressBar);
    const duration = episodeDuration();
    if (!bar || !duration) return hideBarTip();
    const rect = bar.getBoundingClientRect();
    // The thumb's centre travels from 10px (1px border + half the 18px thumb) to width - 10px.
    const inset = 10;
    const fraction = clamp((e.clientX - rect.left - inset) / Math.max(1, rect.width - inset * 2), 0, 1);
    const seconds = fraction * duration;
    const index = featuresOn() ? trackIndexAt(seconds) : -1;
    const track = index >= 0 ? view.tracks[index] : null;

    if (!barTip) barTip = h('div', { class: 'nts-seek-bar-tip', role: 'tooltip' });
    barTip.replaceChildren(
      h('div', { class: 'nts-seek-bar-tip__time', text: formatTimestamp(seconds) }),
      track && track.artist ? h('div', { class: 'nts-seek-bar-tip__artist', text: track.artist }) : null,
      track && track.title ? h('div', { class: 'nts-seek-bar-tip__title', text: track.title }) : null
    );
    if (!barTip.isConnected) document.body.append(barTip);
    const x = rect.left + inset + fraction * (rect.width - inset * 2);
    const half = barTip.offsetWidth / 2;
    const left = clamp(x, half + 8, document.documentElement.clientWidth - half - 8);
    barTip.style.left = `${Math.round(left)}px`;
    barTip.style.top = `${Math.round(rect.top - 10)}px`;
    barTip.style.setProperty('--nts-seek-arrow', `${Math.round(x - left)}px`);
  }

  function hideBarTip() {
    if (barTip) barTip.remove();
  }

  // ------------------------------------------------------------------ redesign: full-width bar + side drawer

  // Redesign mode is mostly CSS on NTS's own markup (content.css, html[data-nts-seek-mode="redesign"]).
  // Here we add the few pieces NTS doesn't have: the "now playing" line and the volume / style controls
  // in the bar, and artwork plus Tracklist / Up next tabs in the drawer.

  function modeButton(className) {
    return h('button', {
      type: 'button', class: `${className} nts-seek-mode`, title: 'Player style', 'aria-label': 'Player style',
      'aria-haspopup': 'menu', 'aria-expanded': 'false',
      onclick: (e) => showModeMenu(e.currentTarget),
    }, icon(ICON.layout));
  }

  function storedDrawerTab() {
    try {
      return localStorage.getItem(TAB_KEY) === 'upnext' ? 'upnext' : 'tracks';
    } catch (e) {
      return 'tracks';
    }
  }

  function setDrawerTab(tab) {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch (e) {
      /* not remembered, still switches */
    }
    document.documentElement.dataset.ntsSeekTab = tab;
    for (const b of document.querySelectorAll('.nts-seek-tabs__tab')) {
      const selected = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
    }
    if (tab === 'tracks') updateCurrent(true);
  }

  function drawerIsOpen() {
    return !!document.querySelector(`${SEL.footerPlayer}.footer-player--expanded`);
  }

  // NTS's own expand / collapse button (the chevron at the right of the bar).
  function toggleDrawer() {
    const button = Array.from(document.querySelectorAll(`${SEL.footerPlayer} .episode-player__up-next-expand-button`)).find(isShown);
    if (button) button.click();
    return !!button;
  }

  function showCurrentInDrawer() {
    setDrawerTab('tracks');
    if (!drawerIsOpen()) toggleDrawer();
    if (view && view.dom) view.dom.lastUserScroll = 0;
    setTimeout(() => updateCurrent(true), 200); // after the drawer has slid in
  }

  // NTS's own link to the episode page (it navigates inside the app, without stopping playback).
  function goToEpisode() {
    const link = document.querySelector(`${SEL.footerPlayer} .soundcloud-player__thumbnail`);
    if (link) link.click();
  }

  function ensureRedesign() {
    if (!redesigned()) return;
    const root = document.documentElement;
    if (!root.dataset.ntsSeekTab) root.dataset.ntsSeekTab = storedDrawerTab();

    const player = document.querySelector(`${SEL.footerPlayer} ${SEL.player}`);
    if (player && !player.querySelector(':scope > .nts-seek-now')) {
      // [ARTIST  Title] • [EPISODE NAME]
      const now = h('div', { class: 'nts-seek-now' },
        h('button', { type: 'button', class: 'nts-seek-now__track', onclick: showCurrentInDrawer },
          h('span', { class: 'nts-seek-now__artist' }),
          h('span', { class: 'nts-seek-now__title' })),
        h('span', { class: 'nts-seek-now__sep', 'aria-hidden': 'true', text: '•' }),
        h('button', { type: 'button', class: 'nts-seek-now__episode', title: 'Go to episode', onclick: goToEpisode }));
      const extras = h('div', { class: 'nts-seek-extras' },
        volumeControl('nts-seek-volume--wide'),
        modeButton('nts-seek-extras__button nts-link'));
      player.append(now, extras);
    }

    const drawer = document.querySelector(`${SEL.footerPlayer} .expanded-episode-player`);
    if (drawer) {
      const header = drawer.querySelector(':scope > .expanded-episode-player__header');
      if (header && !header.querySelector(':scope > .nts-seek-art')) {
        header.insertBefore(h('img', { class: 'nts-seek-art', alt: '', decoding: 'async' }), header.firstChild);
      }
      if (!drawer.querySelector(':scope > .nts-seek-tabs')) {
        const current = root.dataset.ntsSeekTab;
        const tab = (id, label) => h('button', {
          type: 'button', role: 'tab', class: 'nts-seek-tabs__tab', 'data-tab': id,
          'aria-selected': String(current === id), tabindex: current === id ? '0' : '-1',
          onclick: () => setDrawerTab(id),
        }, label);
        const tabs = h('div', { class: 'nts-seek-tabs', role: 'tablist', 'aria-label': 'Player panel' },
          tab('tracks', 'Tracklist'), tab('upnext', 'Up next'));
        tabs.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const next = root.dataset.ntsSeekTab === 'tracks' ? 'upnext' : 'tracks';
          setDrawerTab(next);
          tabs.querySelector(`[data-tab="${next}"]`).focus();
        });
        drawer.insertBefore(tabs, header ? header.nextSibling : drawer.firstChild);
      }
    }

    updateArt();
    updateNow();
    measureDrawerTop();
  }

  function removeRedesign() {
    document.querySelectorAll('.nts-seek-now, .nts-seek-extras, .nts-seek-tabs, .nts-seek-art').forEach((n) => n.remove());
    delete document.documentElement.dataset.ntsSeekTab;
  }

  // Bigger version of NTS's 100×100 thumbnail for the drawer.
  function updateArt() {
    const art = document.querySelector('.nts-seek-art');
    const thumb = document.querySelector(`${SEL.footerPlayer} .soundcloud-player__thumbnail img`);
    if (!art || !thumb || !thumb.src) return;
    const src = thumb.src.replace(/\/resize\/\d+x\d+\//, '/resize/400x400/');
    if (art.getAttribute('src') !== src) art.setAttribute('src', src);
  }

  // "ARTIST Title · Episode" above the progress bar.
  function updateNow() {
    const now = document.querySelector('.nts-seek-now');
    if (!now) return;
    const trackButton = now.querySelector('.nts-seek-now__track');
    const separator = now.querySelector('.nts-seek-now__sep');
    const episodeButton = now.querySelector('.nts-seek-now__episode');
    const track = featuresOn() && view.currentIndex >= 0 ? view.tracks[view.currentIndex] : null;
    trackButton.hidden = !track;
    if (track) {
      trackButton.children[0].textContent = track.artist;
      trackButton.children[1].textContent = track.title;
      trackButton.children[1].hidden = !track.title;
      trackButton.title = `Show in tracklist: ${trackLabel(track)}`;
    }
    const name = episodeName();
    if (episodeButton.textContent !== name) episodeButton.textContent = name;
    episodeButton.hidden = !name;
    episodeButton.title = name ? `Go to episode: ${name}` : 'Go to episode';
    separator.hidden = !track || !name;
    now.classList.toggle('nts-seek-now--track', !!track);
  }

  // The drawer runs from below NTS's fixed header down to the top of the player bar.
  function measureDrawerTop() {
    let top = 0;
    for (const n of document.querySelectorAll('header.header, .live-header')) {
      const position = getComputedStyle(n).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      const r = n.getBoundingClientRect();
      if (r.height && r.bottom > top && r.bottom < window.innerHeight / 2) top = r.bottom;
    }
    const bar = document.querySelector(`${SEL.footerPlayer} .episode-player-wrapper`);
    const barTop = bar && bar.getBoundingClientRect().height ? bar.getBoundingClientRect().top : window.innerHeight - 58;
    const value = `${Math.max(200, Math.round(barTop - top))}px`;
    const style = document.documentElement.style;
    if (style.getPropertyValue('--nts-seek-drawer-height') !== value) style.setProperty('--nts-seek-drawer-height', value);
  }

  // ------------------------------------------------------------------ media keys / lock screen

  const media = { ours: new WeakSet(), base: null, key: '', handlers: {}, lastPosition: 0 };

  function setMediaHandler(action, handler) {
    if (media.handlers[action] === handler) return;
    media.handlers[action] = handler;
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (e) {
      /* action not supported by this browser */
    }
  }

  const HANDLERS = {
    previoustrack: () => prevTrack(),
    nexttrack: () => nextTrack(),
    seekbackward: (d) => seekBy(-((d && d.seekOffset) || SKIP_SECONDS)),
    seekforward: (d) => seekBy((d && d.seekOffset) || SKIP_SECONDS),
    seekto: (d) => {
      if (d && Number.isFinite(d.seekTime)) seekTo(d.seekTime);
    },
  };

  function releaseMediaSession() {
    if (!('mediaSession' in navigator)) return;
    for (const action of Object.keys(HANDLERS)) setMediaHandler(action, null);
    media.key = '';
  }

  // While an episode plays: show the current track as the title and let
  // previous / next track and seeking work from media keys and the lock screen.
  function updateMediaSession(force) {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata !== 'function') return;
    const audio = findAudio();
    if (!audio || audio.paused || radioIsPlaying()) return;

    const tracksOn = featuresOn();
    setMediaHandler('previoustrack', tracksOn ? HANDLERS.previoustrack : null);
    setMediaHandler('nexttrack', tracksOn ? HANDLERS.nexttrack : null);
    setMediaHandler('seekbackward', HANDLERS.seekbackward);
    setMediaHandler('seekforward', HANDLERS.seekforward);
    setMediaHandler('seekto', HANDLERS.seekto);

    const current = ms.metadata;
    if (current && !media.ours.has(current)) {
      // NTS set new metadata (new episode): remember it as the base, then add the track to it.
      media.base = {
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: Array.from(current.artwork || [], (a) => ({ src: a.src, sizes: a.sizes, type: a.type })),
      };
      media.key = '';
    }
    const track = tracksOn && view.currentIndex >= 0 ? view.tracks[view.currentIndex] : null;
    const key = track ? `${view.ep.path}#${view.currentIndex}` : 'episode';
    if (!force && key === media.key) return;
    media.key = key;

    let metadata = null;
    if (track) {
      metadata = new MediaMetadata({
        title: track.title || track.artist,
        artist: track.artist,
        album: (media.base && media.base.title) || episodeName(),
        artwork: (media.base && media.base.artwork) || [],
      });
    } else if (media.base && current && media.ours.has(current)) {
      metadata = new MediaMetadata(media.base); // back to NTS's own metadata
    }
    if (metadata) {
      media.ours.add(metadata);
      ms.metadata = metadata;
    }
  }

  function updatePositionState(force) {
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setPositionState !== 'function' || radioIsPlaying()) return;
    const now = Date.now();
    if (!force && now - media.lastPosition < 5000) return;
    media.lastPosition = now;
    const audio = findAudio();
    const duration = episodeDuration();
    if (!audio || !duration) return;
    try {
      ms.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: clamp(audio.currentTime, 0, duration),
      });
    } catch (e) {
      /* ignore invalid states while loading */
    }
  }

  // ------------------------------------------------------------------ links that start at a time

  let pendingStart = null; // { path, seconds }
  let lastHref = '';

  function readShareParam() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const match = location.pathname.match(EPISODE_PATH);
    const seconds = parseShareTime(new URLSearchParams(location.search).get('t'));
    if (match && seconds !== null && seconds > 0) pendingStart = { path: match[1], seconds };
    else if (pendingStart && (!match || match[1] !== pendingStart.path)) pendingStart = null;
  }

  function applyPendingStart(audio) {
    if (!pendingStart || audio.paused) return;
    const ep = currentEpisode();
    if (!ep || ep.path !== pendingStart.path) return;
    const { seconds } = pendingStart;
    pendingStart = null;
    seekTo(seconds);
    snackbar(`Playing from ${formatTimestamp(seconds)}`);
  }

  // ------------------------------------------------------------------ keyboard shortcuts

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key === 'Escape' && popover) {
      closePopover({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (!enabled() || !isEpisodePlayerOpen() || !findAudio()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (isEditable(target)) return;
    if (e.key === 'Escape' && redesigned() && drawerIsOpen()) {
      if (toggleDrawer()) e.preventDefault();
      return;
    }
    const onControl = !!(target && target.closest('button, a[href], [role="button"], [role^="menuitem"], summary'));

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = false;
    if (key === ' ' && !onControl) handled = togglePlay();
    else if (key === 'k') handled = togglePlay();
    else if ((key === 'ArrowLeft' && e.shiftKey) || key === 'p') handled = prevTrack();
    else if ((key === 'ArrowRight' && e.shiftKey) || key === 'n') handled = nextTrack();
    else if (key === 'ArrowLeft' || key === 'j') handled = seekBy(-SKIP_SECONDS);
    else if (key === 'ArrowRight' || key === 'l') handled = seekBy(SKIP_SECONDS);
    else if (key === '-' || key === '_') handled = stepVolume(-VOLUME_STEP);
    else if (key === '+' || key === '=') handled = stepVolume(VOLUME_STEP);
    else if (key === 'm') handled = toggleMute();
    else if (key === '?') handled = toggleShortcuts();
    if (handled) e.preventDefault();
  }

  // ------------------------------------------------------------------ events

  // Clicking NTS's own rows (shown when our full list isn't available) also jumps to the track.
  function onDocumentClick(e) {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const target = e.target;
    if (target.closest(SEL.ntsSkipButton)) cancelSeekChecks(); // NTS's ±30s wins over a pending re-seek
    if (!enabled()) return;

    const row = target.closest(SEL.ntsRow);
    if (!row || target.closest('button, a, input, label') || hasTextSelection()) return;
    const seconds = parseTimestamp(textOf(row, SEL.time));
    if (seconds === null) return;
    seekTo(seconds, { play: true });
    flash(row);
  }

  function onPointerDown(e) {
    if (!popover) return;
    const target = e.target instanceof Node ? e.target : null;
    if (target && (popover.el.contains(target) || popover.anchor.contains(target))) return;
    closePopover();
  }

  function onInput(e) {
    if (!dispatchingBarInput && e.target instanceof Element && e.target.matches(SEL.progressBar)) cancelSeekChecks();
  }

  function onMediaEvent(e) {
    const audio = e.target;
    if (!(audio instanceof HTMLMediaElement)) return;
    if (audio.matches(SEL.radioAudio)) {
      if (e.type === 'play' || e.type === 'playing') releaseMediaSession();
      return;
    }
    if (!audio.closest(SEL.player) || !enabled()) return;

    switch (e.type) {
      case 'loadedmetadata':
      case 'durationchange':
        applyVolume(audio);
        ensureMarkers();
        updatePositionState(true);
        break;
      case 'play':
      case 'playing':
        applyVolume(audio);
        updatePausedState();
        applyPendingStart(audio);
        updateMediaSession(true);
        updatePositionState(true);
        break;
      case 'pause':
      case 'ended':
        updatePausedState();
        updatePositionState(true);
        break;
      case 'ratechange':
      case 'seeked':
        updateCurrent(false);
        updatePositionState(true);
        break;
      case 'timeupdate':
        updateCurrent(false);
        applyPendingStart(audio);
        updatePositionState(false);
        break;
      default:
        break;
    }
  }

  // Runs whenever the page changes: keeps everything we add in place inside NTS's player.
  function sync() {
    if (!enabled()) return;
    readShareParam();
    const ep = currentEpisode();
    if (!ep) {
      if (view) teardownView();
      ensureSkipControls();
      ensureMarkers();
      ensureRedesign();
      return;
    }
    if (!view || view.ep.path !== ep.path) startView(ep);

    const entry = getTracklist(ep);
    if (entry.status === 'ready' && !view.tracks) setTracks(entry.tracks);
    view.access = timestampAccess();

    const list = document.querySelector(SEL.tracklist);
    if (view.tracks && view.access === true && list) {
      learnFromNtsRows();
      mountList(list);
      refreshSaves();
    } else {
      unmountList();
    }

    ensureSkipControls();
    ensureMarkers();
    ensureRedesign();
    updateCurrent(false);
  }

  let syncTimer = null;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      sync();
    }, 100);
  }

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', () => {
    closePopover();
    hideBarTip();
    if (redesigned()) measureDrawerTop();
  });
  // Media events don't bubble, but capture-phase listeners on the document still see them.
  for (const type of ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'ended', 'ratechange', 'seeked', 'timeupdate']) {
    document.addEventListener(type, onMediaEvent, true);
  }

  try {
    localStorage.removeItem('nts-tracklist-seek:playback-rate'); // left over from the removed speed control
  } catch (e) {
    /* nothing to clean up */
  }

  new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true });
  new MutationObserver(onModeChange).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nts-seek-mode'] });
  onModeChange();
})();
