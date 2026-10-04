# Rater

A static page (Vite + React) served as Worker assets at `rater.rn.ax`. Spotify login is PKCE in the browser; there is no backend. See the repo `README.md` for deploys.

## UI conventions

- **Text buttons** (log in, start/tap to play, check again, list playlists) all use the one `.button` class: white text, a thin white outline, no background fill. Don't add a filled or gradient variant; extend `.button` instead.
- Icon-only controls (skip, stars, log out) are bare icons drawn in `currentColor`, with an `aria-label`.
