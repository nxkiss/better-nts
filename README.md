# NTS Tracklist Seek

Browser extension for [nts.live](https://www.nts.live). The episode player only shows three tracks at a time, and you can't click them. This fixes that, along with a few other things I kept missing.

Not affiliated with NTS.

## What it does

- Shows the whole tracklist in the player. Click a track to jump to it, and the list follows along as the episode plays.
- Puts the save button on every track (uses NTS's own save, so it ends up in My NTS as usual).
- Adds previous / next track buttons next to the 30 second skip buttons.
- Adds a volume control for episodes (NTS's volume slider only works for the live radio).
- Marks where each track starts on the progress bar. Hovering the bar shows the time and the track at that point.
- Right-click a track (or use the ⋮ button) to copy it, copy a link to that moment, or search for it on Discogs, Bandcamp, YouTube or Spotify.
- Filter the tracklist, or copy the whole thing as text.
- Media keys and the lock screen show the current track, and next / previous skips tracks.
- Links with `?t=` start at that time, e.g. `nts.live/shows/.../episodes/...?t=1h02m30s`.

Timestamps in the player are an NTS Supporters feature. The extension only uses them if NTS already shows them to you.

## Player styles

Click the extension icon to switch:

- **Original NTS**: turns everything off.
- **Enhanced**: NTS's layout with the features above.
- **Redesign**: full-width player bar showing the current track, plus a side panel for the tracklist and Up Next. Desktop only, on smaller screens it looks like Enhanced.

## Keyboard shortcuts

Press `?` while an episode is open to see them.

| Key | |
| --- | --- |
| `Space` / `K` | Play / pause |
| `←` / `J`, `→` / `L` | Back / forward 30 seconds |
| `Shift+←` / `P`, `Shift+→` / `N` | Previous / next track |
| `-` / `+` | Volume down / up |
| `M` | Mute |
| `↑` / `↓` | Move through the tracklist |

## Install

Not on the extension stores, so load it yourself.

**Chrome / Edge / Brave** (version 111+)

1. Download or clone this repo.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and pick the folder.

**Firefox** (version 128+)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and pick `manifest.json`.

Firefox removes temporary add-ons when it closes. To keep it installed you need to sign it through [addons.mozilla.org](https://addons.mozilla.org/developers/) (it can be unlisted).

## How it works

- `content.js` runs in the page itself, so it can call NTS's own save-track code. It gets the tracklist from the same API the episode pages use.
- `bridge.js` stores the player style and passes it to the page.
- `content.css` and `redesign.css` reuse NTS's class names and colours so things look native.
- `popup.html` is the player style switch.

It depends on how nts.live is built right now, so an NTS update could break parts of it. If something stops working, open an issue.
