# Better NTS

Browser extension that improves the episode player on [nts.live](https://www.nts.live). Not affiliated with NTS.

- Full tracklist in the player, click a track to jump to it
- Save button on every track
- Previous / next track buttons and a volume control
- Track markers on the progress bar
- Keyboard shortcuts (press `?` in the player)
- Ctrl+click (or middle-click) a show or episode to open it in a new tab (can be turned off in the player)
- Optional redesigned layout, switch styles from the extension icon

## Install

Not on the extension stores, so load it yourself. Grab the latest `better-nts-x.y.z.zip` from [Releases](https://github.com/nxkiss/better-nts/releases) and unzip it somewhere you'll keep it (the browser loads it from that folder). You can also clone the repo instead.

**Chrome / Edge / Brave** (version 111+)

1. Go to `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and pick the unzipped folder (the one with `manifest.json` in it).

To update, unzip the new version over the old folder and click the reload icon on the extension.

**Firefox** (version 128+)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and pick `manifest.json` in the unzipped folder (or the zip itself).

Firefox removes temporary add-ons when it closes. To keep it installed you need to sign it through [addons.mozilla.org](https://addons.mozilla.org/developers/) (it can be unlisted).

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is laid out.
