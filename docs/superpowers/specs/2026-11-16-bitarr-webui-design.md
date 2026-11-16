# Bitarr WebUI design

## Intent

Replace the inherited qBittorrent WebUI with a modern, Sonarr/Radarr-style interface that ships inside
the application (embedded in `webui.qrc`) and talks to the unchanged `/api/v2` WebAPI. The spec doubles
as a behaviour description for the planned future port.

## Goals

- One left sidebar: brand, page entries, then Status / Categories / Tags filters.
- Phosphor-green dark theme matching the desktop app (`src/icons/bitarr.qss`).
- Plain HTML, CSS and JavaScript. No build step, no frameworks, no third-party code.
- Live updates through `sync/maindata` polling (1.5 s), keyed row updates (no full re-render).
- Torrent actions: add (links and .torrent files), resume, pause, remove (optionally with files).
- Details panel: General, Files (per-file priority, skip all .nfo), Trackers, Peers.
- Settings dialog for save path, add-stopped, the three "always" options, speed limits, listen port.

## Non-goals

Translations, torrent creation, category/tag management.

## Pages

The sidebar lists Transfers, Search, RSS, Log and Statistics (hash routes `#transfers`, `#search`, `#rss`, `#log`, `#stats`); the filters only show on Transfers.

- **Log**: polls `log/main` incrementally; level toggles, text filter, auto-scroll, clear.
- **Search**: `search/start`, `search/results` polling, sortable results, download through `search/downloadTorrent`, plugin manager (enable, install, uninstall, update).
- **RSS**: `rss/items`, read/unread state, download, add/remove feeds and folders, refresh, auto-download rules via `rss/setRule`; unread count badge in the sidebar.

## Constraints

- Served by the existing server: `public/` before login, `private/` after login.
- CSP: `script-src 'self'`; static files only. The server replaces `${CACHEID}` in text files, so links to
  scripts and styles use `?v=${CACHEID}` to avoid stale caches. No ES modules (imports cannot carry it).
- All torrent-supplied text is inserted with `textContent`, never as HTML.

## Behaviour notes

- Filters: Status groups mirror the desktop app; category/tag filters combine with the text filter.
- Progress label is drawn dark over the filled part and light over the rest.
- Add dialog sends `urls`, `torrents`, `savepath`, `category`, `tags`, `stopped`, `sequentialDownload`,
  `firstLastPiecePrio` and `excludeNfoFiles` (new, Bitarr-specific) to `torrents/add`.
- **Statistics**: a canvas line chart of download and upload speed (about five minutes, sampled from the `sync/maindata` poll even while the page is closed) and cards for transfer, all-time, network and disk/cache figures from `server_state`.
