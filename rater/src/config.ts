// None of this is secret: PKCE has no client secret, and playlist IDs only mean something to their owner.
export const SPOTIFY_CLIENT_ID = '522aaf502dc24853b88fced700ea9bec'

export type PlaylistRef = { id: string; name: string }

// Names are stored next to the IDs so the page makes no Spotify API call just to label its buttons:
// a dev-mode app that gets rate limited can be locked out for hours.
export const SOURCE_PLAYLIST: PlaylistRef = { id: '0eeSEBuNDuxKBvRfeedQiP', name: 'Discover Weekly Archive' }

// A rating with no playlist (id '') just drops the track from the source.
export const RATING_PLAYLISTS: Record<1 | 2 | 3 | 4 | 5, PlaylistRef> = {
    1: { id: '', name: '' },
    2: { id: '', name: '' },
    3: { id: '2KFpsKhHPMEgGpcgr4XzP0', name: '⭐️⭐️⭐️' },
    4: { id: '5pN2W4nbPvEglaAjoMOVTY', name: '⭐️ ⭐️ ⭐️ ⭐️' },
    5: { id: '5lpkC7eTkBCcP2zOWS0Z0c', name: '⭐️ ⭐️ ⭐️ ⭐️ ⭐️' },
}
