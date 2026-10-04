# Rater

A static page (Vite + React) served as Worker assets at `rater.rn.ax`. Spotify login is PKCE in the browser; there is no backend. See the repo `README.md` for deploys.

## UI conventions

- **Text buttons** (log in, start/tap to play, check again, list playlists) all use the one `.button` class: white text, a thin white outline, no background fill. Don't add a filled or gradient variant; extend `.button` instead.
- Icon-only controls (skip, play/pause, stars, log out) are bare icons drawn in `currentColor`, each with an `aria-label`. They have no filled background: legibility over the cover comes from the dark glow (`--glow`, a `drop-shadow` filter) in `index.css`. Text over the cover (title, artist) uses a matching dark `text-shadow` glow. Use the glow for any new control; don't add a filled disc.
- The player fills the page: track info at the top, rating and controls in the middle, the scrubber flush against the bottom edge (no background, padding or thumb). The album cover is the page background, dimmed by `.backdrop-dim`. Error and warning messages are the one exception to "no backgrounds": they keep a dark box so text stays readable.
