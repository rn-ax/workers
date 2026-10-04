export class SpotifyError extends Error {
    constructor(
        readonly status: number,
        readonly retryAfter: number | null,
        message: string,
    ) {
        super(message)
    }
}

export const friendlyError = (e: unknown) => {
    if (e instanceof SpotifyError && e.status === 429) {
        const wait = e.retryAfter ? ` Try again in ${Math.ceil(e.retryAfter / 60)} min.` : ''
        return `Spotify is rate limiting this app.${wait}`
    }
    return e instanceof Error ? e.message : String(e)
}

export const api = async (token: string, path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) {
        const retry = res.headers.get('Retry-After')
        console.error(`[rater] ${method} ${path} -> ${res.status}${retry ? ` (Retry-After ${retry}s)` : ''}`, text)
        throw new SpotifyError(res.status, retry ? Number(retry) : null, `Spotify ${res.status} on ${path}: ${text}`)
    }
    console.debug(`[rater] ${method} ${path} -> ${res.status}`)
    return text ? JSON.parse(text) : null
}

// Always starts the playlist from its first track. The player is made the active device first: Spotify refuses a
// play command ("Restriction violated") for a device that isn't the active one.
export const startContext = async (token: string, deviceId: string, playlistId: string) => {
    await api(token, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) })
    return api(token, `/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}`, offset: { position: 0 } }),
    })
}

export const playlistTotal = async (token: string, playlistId: string): Promise<number> =>
    (await api(token, `/playlists/${playlistId}/items?limit=1&fields=total`)).total

export const addItem = (token: string, playlistId: string, uri: string) =>
    api(token, `/playlists/${playlistId}/items`, { method: 'POST', body: JSON.stringify({ uris: [uri] }) })

export const removeItem = (token: string, playlistId: string, uri: string) =>
    api(token, `/playlists/${playlistId}/items`, { method: 'DELETE', body: JSON.stringify({ items: [{ uri }] }) })

// A track relinked to the listener's market plays under a different URI than the one the playlist stores;
// Spotify says to operate on the original, which only the Web API (not the player SDK) exposes.
const originalUriOfCurrentTrack = async (token: string): Promise<string | null> =>
    (await api(token, '/me/player/currently-playing?market=from_token'))?.item?.linked_from?.uri ?? null

export type TrackRef = { uri: string; name: string; artists: string }

// What the playlist itself stores for a track, found by title and artist among its first entries (the
// player always works from the front of the list). Also logs the head of the list, to show what Spotify holds.
const storedUrisOf = async (token: string, playlistId: string, track: TrackRef): Promise<string[]> => {
    const page = await api(token, `/playlists/${playlistId}/items?limit=50&fields=items(item(uri,name,artists(name)))`)
    const entries: { uri: string; name: string; artists: string[] }[] = (page?.items ?? [])
        .filter((e: any) => e.item)
        .map((e: any) => ({ uri: e.item.uri, name: e.item.name, artists: e.item.artists.map((a: any) => a.name) }))
    console.info(`[rater] first entries of the playlist: ${entries.slice(0, 3).map((e) => `"${e.name}" ${e.uri}`).join(' | ')}`)
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    return entries
        .filter((e) => same(e.name, track.name) && e.artists.some((a) => track.artists.toLowerCase().includes(a.toLowerCase())))
        .map((e) => e.uri)
}

// Spotify answers 200 with the unchanged snapshot when a removal matched nothing, so success is only
// believed once the playlist is actually shorter. Tries, in order: the URI the player reports, the original
// URI of a relinked track, then whatever URI the playlist itself stores for that title and artist.
// Reports whether the track is gone, and how many entries the playlist has left.
export const removeFromPlaylist = async (
    token: string,
    playlistId: string,
    track: TrackRef,
): Promise<{ removed: boolean; total: number }> => {
    const before = await playlistTotal(token, playlistId)
    const tried = new Set<string>()
    let total = before
    const attempt = async (candidate: string) => {
        tried.add(candidate)
        const res = await removeItem(token, playlistId, candidate)
        total = await playlistTotal(token, playlistId)
        console.info(`[rater] remove ${candidate}: items ${before} -> ${total}, snapshot ${res?.snapshot_id}`)
        return total < before
    }
    if (await attempt(track.uri)) return { removed: true, total }

    const original = await originalUriOfCurrentTrack(token)
    console.warn(`[rater] removing ${track.uri} changed nothing; original (linked_from) uri: ${original ?? 'none'}`)
    if (original !== null && !tried.has(original) && (await attempt(original))) return { removed: true, total }

    const stored = await storedUrisOf(token, playlistId, track)
    console.warn(`[rater] uris the playlist stores for "${track.name}": ${stored.length ? stored.join(', ') : 'none found in its first 50 entries'}`)
    for (const candidate of stored) {
        if (!tried.has(candidate) && (await attempt(candidate))) return { removed: true, total }
    }
    return { removed: false, total }
}

export const myPlaylists = async (token: string): Promise<{ id: string; name: string }[]> => {
    const out: { id: string; name: string }[] = []
    for (let path: string | null = '/me/playlists?limit=50'; path; ) {
        const page: any = await api(token, path)
        out.push(...page.items.map((p: any) => ({ id: p.id, name: p.name })))
        path = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null
    }
    return out
}
