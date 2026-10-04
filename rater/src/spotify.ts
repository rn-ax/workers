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

export const startContext = (token: string, deviceId: string, playlistId: string) =>
    api(token, `/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
    })

export const addItem = (token: string, playlistId: string, uri: string) =>
    api(token, `/playlists/${playlistId}/items`, { method: 'POST', body: JSON.stringify({ uris: [uri] }) })

export const removeItem = (token: string, playlistId: string, uri: string) =>
    api(token, `/playlists/${playlistId}/items`, { method: 'DELETE', body: JSON.stringify({ items: [{ uri }] }) })

export const myPlaylists = async (token: string): Promise<{ id: string; name: string }[]> => {
    const out: { id: string; name: string }[] = []
    for (let path: string | null = '/me/playlists?limit=50'; path; ) {
        const page: any = await api(token, path)
        out.push(...page.items.map((p: any) => ({ id: p.id, name: p.name })))
        path = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null
    }
    return out
}
