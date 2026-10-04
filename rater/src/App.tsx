import { useEffect, useRef, useState } from 'react'
import { authorizeUrl, challengeFor, exchangeCode, randomVerifier, refresh, type Tokens } from './pkce'
import { collect, type Diagnostics } from './diagnostics'

const store = {
    get: (k: string) => {
        try { return localStorage.getItem(k) ?? '' } catch { return '' }
    },
    set: (k: string, v: string) => {
        try { localStorage.setItem(k, v) } catch { /* surfaced by diagnostics */ }
    },
}

const api = async (token: string, path: string, init?: RequestInit) => {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`)
    return text ? JSON.parse(text) : null
}

export default function App() {
    const [diag, setDiag] = useState<Diagnostics>({})
    const [log, setLog] = useState<string[]>([])
    const [clientId, setClientId] = useState(store.get('clientId'))
    const [redirectUri, setRedirectUri] = useState(store.get('redirectUri') || location.origin + '/')
    const [pasted, setPasted] = useState('')
    const [playlistId, setPlaylistId] = useState(store.get('playlistId'))
    const [tokens, setTokens] = useState<Tokens | null>(null)
    const [deviceId, setDeviceId] = useState('')
    const [track, setTrack] = useState('')
    const playerRef = useRef<any>(null)
    const tokenRef = useRef('')
    // Login attempt state lives in memory: the popup's page may not share storage with this one.
    const attempt = useRef({ verifier: '', clientId: '', redirectUri: '' })
    tokenRef.current = tokens?.access_token ?? ''

    const say = (m: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`])

    useEffect(() => {
        collect().then(setDiag)
    }, [])

    // The popup's redirect target is this same app page. It hands the code to the opener over a
    // BroadcastChannel (COOP on accounts.spotify.com severs window.opener); if nobody answers, it
    // finishes the exchange itself from whatever storage it can see.
    useEffect(() => {
        const channel = new BroadcastChannel('spotify-rater-spike')
        const code = new URLSearchParams(location.search).get('code')
        if (code) {
            say('code found in this frame\'s own location.search')
            let acked = false
            channel.onmessage = (e) => {
                if (e.data?.type === 'ack') acked = true
            }
            channel.postMessage({ type: 'code', code })
            setTimeout(() => {
                if (acked) {
                    say('opener acknowledged, closing popup')
                    window.close()
                } else {
                    say('no opener answered, finishing locally')
                    finishLogin(code, {
                        verifier: store.get('verifier'),
                        clientId: store.get('clientId'),
                        redirectUri: store.get('redirectUri'),
                    })
                }
            }, 1500)
        } else {
            channel.onmessage = (e) => {
                if (e.data?.type !== 'code') return
                channel.postMessage({ type: 'ack' })
                say('code received over BroadcastChannel from the popup')
                finishLogin(e.data.code, attempt.current)
            }
        }
        return () => channel.close()
    }, [])

    const login = async () => {
        store.set('clientId', clientId)
        store.set('redirectUri', redirectUri)
        const verifier = randomVerifier()
        store.set('verifier', verifier)
        attempt.current = { verifier, clientId, redirectUri }
        const url = authorizeUrl(clientId, redirectUri, await challengeFor(verifier), crypto.randomUUID())
        const popup = window.open(url, 'spotify-login', 'width=480,height=720')
        say(popup ? 'popup opened' : 'window.open returned null (popup blocked or sandboxed)')
    }

    const finishLogin = async (
        code: string,
        a: { verifier: string; clientId: string; redirectUri: string },
    ) => {
        try {
            const missing = (['verifier', 'clientId', 'redirectUri'] as const).filter((k) => !a[k])
            if (missing.length) throw new Error(`missing ${missing.join(', ')} (no shared storage and no opener?)`)
            const t = await exchangeCode(a.clientId, a.redirectUri, code, a.verifier)
            setTokens(t)
            if (t.refresh_token) store.set('refreshToken', t.refresh_token)
            say('token exchange OK (browser-only, no client secret)')
            say(`granted scope: ${t.scope ?? '(not reported)'}`)
        } catch (e) {
            say(`token exchange FAILED: ${e}`)
        }
    }

    const finishFromPasted = () => {
        const code = new URL(pasted).searchParams.get('code')
        if (!code) return say('no ?code= in pasted URL')
        finishLogin(code, attempt.current)
    }

    const tryRefresh = async () => {
        try {
            const t = await refresh(clientId, store.get('refreshToken'))
            setTokens(t)
            if (t.refresh_token) store.set('refreshToken', t.refresh_token)
            say('silent refresh OK (a stored refresh token survived a reload)')
            say(`granted scope: ${t.scope ?? '(not reported)'}`)
        } catch (e) {
            say(`refresh FAILED: ${e}`)
        }
    }

    const startPlayer = () => {
        if (playerRef.current) return say('player already created')
        ;(window as any).onSpotifyWebPlaybackSDKReady = () => {
            const p = new (window as any).Spotify.Player({
                name: 'Rater spike',
                getOAuthToken: (cb: (t: string) => void) => cb(tokenRef.current),
                volume: 0.5,
            })
            for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'])
                p.addListener(ev, ({ message }: any) => say(`SDK ${ev}: ${message}`))
            p.addListener('ready', ({ device_id }: any) => {
                setDeviceId(device_id)
                say(`SDK ready, device ${device_id}`)
            })
            p.addListener('player_state_changed', (s: any) => {
                if (s) setTrack(`${s.track_window.current_track.name} (${s.paused ? 'paused' : 'playing'})`)
            })
            p.connect().then((ok: boolean) => say(`SDK connect(): ${ok}`))
            playerRef.current = p
        }
        const s = document.createElement('script')
        s.src = 'https://sdk.scdn.co/spotify-player.js'
        s.onerror = () => say('SDK script failed to load')
        document.body.appendChild(s)
        say('SDK script requested')
    }

    const playPlaylist = async () => {
        try {
            store.set('playlistId', playlistId)
            await api(tokenRef.current, `/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
            })
            say('play request accepted')
        } catch (e) {
            say(`play FAILED: ${e}`)
        }
    }

    const addCurrentToPlaylist = async () => {
        try {
            const state = await playerRef.current.getCurrentState()
            const uri = state?.track_window.current_track.uri
            if (!uri) return say('no current track')
            await api(tokenRef.current, `/playlists/${playlistId}/items`, {
                method: 'POST',
                body: JSON.stringify({ uris: [uri] }),
            })
            say(`added ${uri} to playlist (playlist write scope works)`)
        } catch (e) {
            say(`add FAILED: ${e}`)
            try {
                const me = await api(tokenRef.current, '/me')
                const pl = await api(tokenRef.current, `/playlists/${playlistId}?fields=owner(id),collaborative,public,name`)
                say(`logged in as ${me.id}; playlist "${pl.name}" owner ${pl.owner.id}, collaborative=${pl.collaborative}, public=${pl.public}`)
            } catch (e2) {
                say(`could not read playlist details either: ${e2}`)
            }
        }
    }

    return (
        <div>
            <h2 className="ui header">Spotify rater spike</h2>

            <h4 className="ui dividing header">0. Environment</h4>
            <table className="ui very basic compact table">
                <tbody>
                    {Object.entries(diag).map(([k, v]) => (
                        <tr key={k}><td><b>{k}</b></td><td><pre>{v}</pre></td></tr>
                    ))}
                </tbody>
            </table>

            <h4 className="ui dividing header">1. Login (PKCE, no secret)</h4>
            <div className="ui form">
                <div className="field"><label>Client ID</label>
                    <input value={clientId} onChange={(e) => setClientId(e.target.value)} /></div>
                <div className="field"><label>Redirect URI (must be registered in the Spotify dashboard)</label>
                    <input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} /></div>
                <button className="ui primary button" onClick={login}>Log in with Spotify</button>
                <button className="ui button" onClick={tryRefresh}>Refresh from stored token</button>
                <div className="field" style={{ marginTop: 12 }}><label>Fallback: paste the full URL the popup ended on</label>
                    <input value={pasted} onChange={(e) => setPasted(e.target.value)} /></div>
                <button className="ui button" onClick={finishFromPasted}>Exchange pasted code</button>
            </div>
            <p>{tokens ? <span className="ui green label">token held in memory</span> : <span className="ui label">not logged in</span>}</p>

            <h4 className="ui dividing header">2. Web Playback SDK in this frame</h4>
            <button className="ui primary button" disabled={!tokens} onClick={startPlayer}>Start SDK player</button>
            <p>Device: <code>{deviceId || '-'}</code> · Now: {track || '-'}</p>

            <h4 className="ui dividing header">3. Playlist read/write</h4>
            <div className="ui form">
                <div className="field"><label>Test playlist ID (use a throwaway playlist)</label>
                    <input value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} /></div>
            </div>
            <button className="ui button" disabled={!deviceId} onClick={playPlaylist}>Play playlist</button>
            <button className="ui button" disabled={!deviceId} onClick={addCurrentToPlaylist}>Add current track to playlist</button>
            <button className="ui button" disabled={!deviceId} onClick={() => playerRef.current.togglePlay()}>Toggle play</button>

            <h4 className="ui dividing header">Log</h4>
            <pre className="ui segment">{log.join('\n') || '-'}</pre>
        </div>
    )
}
