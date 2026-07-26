# tracercoin.org

Static public website for **Tracercoin (TFX)** plus the member-only
status / release-notes page.

- **Live host:** empire-web-1 (`167.71.111.60`), served by nginx from
  `/var/www/tracercoin.org`.
- **Deploy:** static files are pushed by `scp` (checksum-compare changed
  files, then `chown www-data:www-data`). No build step.
- **Source of truth:** this repo's `main` mirrors the live server. The
  initial import was taken directly from the droplet.

## Layout
- `index.html`, `pool/`, `start/`, `portal/` — public pages
- `status/` — member-only status board + release notes (gated by waitlist
  state via `js/auth-state.js`), rendered from `data/*.json`
- `data/status.json`, `data/release-notes.json` — edit + `scp` to update the report
- `css/`, `js/`, `assets/`
- `investor-status/` — investor mini-deck (HTML + rendered PDF)

The backend (waitlist + miner portal API) lives in **TraceRcoin/tracercoin-backend**.
