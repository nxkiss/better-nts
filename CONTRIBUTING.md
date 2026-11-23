# Contributing

No build step and no dependencies. Edit the files, reload the extension, refresh nts.live.

## Layout

```
manifest.json
icons/
src/
  content/
    player.js            everything in the player (runs in the page's own JS world)
    player.css           styles for what player.js adds
    redesign.css         the "Redesign" player style
    settings-bridge.js   syncs the player style setting into the page
  popup/
    popup.html/css/js    the toolbar popup (player style switch)
```

`player.js` is one file because scripts in the page's world can't use modules. It's split into sections with a table of contents at the top.

## Things to know

- **It builds on NTS's markup.** Everything hooks into NTS's existing class names (`.soundcloud-player`, `.episode-player-tracklist`, ...). If NTS changes their site, start by checking the selectors in `SEL` at the top of `player.js`.
- **Our names start with `bnts`.** Classes (`bnts-row`), data attributes (`data-bnts-mode`), CSS variables (`--bnts-...`) and events (`bnts:set-mode`). Storage keys start with `better-nts:`.
- **Match NTS's look.** Reuse NTS's classes where possible, and stick to their colours (`#000`, `#4c4c4c`, `#666`, `#999`, `#ccc`, `#f1f1f1`, `#fff`) and fonts (Univers-Condensed for labels, Arial for details).
- **Three player styles.** `html[data-bnts-mode]` is `original`, `enhanced` or `redesign`. Anything new has to disappear completely in `original` (see `removeEverything()`), and redesign-only styles go in `redesign.css` under `html[data-bnts-mode="redesign"]`.
- **Respect Supporters features.** Track timestamps in the player are for NTS Supporters. Features built on them check `featuresOn()`, which is only true when NTS shows the timestamps to that user.
- **Saving tracks** runs NTS's own save button code (see the "save track" section), so it uses the user's own login and stays in sync with My NTS. Don't call NTS's backend directly.

## Testing a change

1. Reload the extension (`chrome://extensions` → reload, or "Reload" in Firefox's `about:debugging`).
2. Refresh nts.live and play an archived episode.
3. Check all three player styles (extension icon), with the player collapsed and expanded, and on a narrow window.
4. If you touched the tracklist, try an episode without timestamps too.

## Pull requests

Keep them focused on one thing and describe what you tested. Screenshots help for anything visual.
