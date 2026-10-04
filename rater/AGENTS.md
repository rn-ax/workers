# Rater

A static page (Vite + React) served as Worker assets at `rater.rn.ax`. Spotify login is PKCE in the browser; there is no backend. See the repo `README.md` for deploys.

## Local dev

Run the dev server at `http://127.0.0.1:4417` (`npx vite --host 127.0.0.1 --port 4417 --strictPort`). Spotify only redirects back to registered URIs, and this one and `https://rater.rn.ax` are the only ones registered for the app, so login fails on any other host or port (including `localhost` and Vite's default 5173).

## Starting playback

Start the source playlist with a bare `context_uri` and nothing else (`startContext` in `spotify.ts`). Spotify answers any play command that names which song to start with `403 Player command failed: Restriction violated`: a context with an `offset` (by position or by URI) and `uris` (alone, after a transfer to the device, or with `position_ms`) are all refused. So the app can't tell the player "play exactly this song", and the player may report a relinked copy of a song under a different URI than the one the playlist stores. That is why removing a rated track tries the player's URI, then the original (`linked_from`) URI, then the URI the playlist stores for that title and artist.

## UI conventions

- **Text buttons** (log in, start/tap to play, check again, list playlists) all use the one `.button` class: white text, a thin white outline, no background fill. Don't add a filled or gradient variant; extend `.button` instead.
- Icon-only controls (skip, play/pause, stars, log out) are bare icons drawn in `currentColor`, each with an `aria-label`. They have no filled background: legibility over the cover comes from the dark glow (`--glow`, a `drop-shadow` filter) in `index.css`. Text over the cover (title, artist) uses a matching dark `text-shadow` glow. Use the glow for any new control; don't add a filled disc.
- **Home screen:** the page is installable on iOS and Android (`public/manifest.webmanifest`, `apple-touch-icon.png`, the `apple-mobile-web-app-*` tags in `index.html`, `viewport-fit=cover`). In the installed app the status bar is translucent and the page draws under it, so anything pinned to the top uses `--inset-top` (the safe-area inset) as extra offset. There is no service worker. `public/icon.svg` is the source for the PNG icons; regenerate them from it (a screenshot at 512 px, then `sips -z` for 192 and 180).
- **Rating is optimistic.** A rating moves on to the next song at once (the player's own next-track) and is saved in the background by a serial queue (`useRatingQueue`): add to the rating playlist, then a verified removal from the source. Saves run one at a time because removal is verified by counting the playlist. Don't restart the source from its first track right after a rating: the rated track is still first until its removal lands. Controls (skip, scrubber) never change the song; only the song ending or a rating does. Failed saves show a notice with Retry, and closing the page while saves are pending asks for confirmation.
- The player fills the page: track info at the top, rating and controls in the middle, the scrubber flush against the bottom edge (no background, padding or thumb). The album cover is the page background, dimmed by `.backdrop-dim`. Error and warning messages are the one exception to "no backgrounds": they keep a dark box so text stays readable.
