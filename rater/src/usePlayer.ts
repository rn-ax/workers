import { useCallback, useEffect, useRef, useState } from 'react'

export type NowPlaying = { uri: string; name: string; artists: string; image: string; paused: boolean }

// Wraps Spotify's Web Playback SDK (loaded from Spotify's CDN: its terms forbid self-hosting it).
export const usePlayer = (enabled: boolean, getToken: () => Promise<string>) => {
    const [deviceId, setDeviceId] = useState('')
    const [now, setNow] = useState<NowPlaying | null>(null)
    const [error, setError] = useState('')
    const player = useRef<any>(null)
    const tokenFn = useRef(getToken)
    tokenFn.current = getToken

    useEffect(() => {
        if (!enabled || player.current) return
        ;(window as any).onSpotifyWebPlaybackSDKReady = () => {
            const p = new (window as any).Spotify.Player({
                name: 'Rater',
                getOAuthToken: (cb: (t: string) => void) => tokenFn.current().then(cb, (e) => setError(String(e))),
                volume: 0.5,
            })
            for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'])
                p.addListener(ev, ({ message }: { message: string }) => {
                    console.error(`[rater] SDK ${ev}: ${message}`)
                    setError(`${ev}: ${message}`)
                })
            p.addListener('ready', ({ device_id }: { device_id: string }) => {
                console.info(`[rater] SDK ready, device ${device_id}`)
                setDeviceId(device_id)
            })
            p.addListener('player_state_changed', (s: any) => {
                const t = s?.track_window?.current_track
                console.debug(`[rater] player state: ${t ? `${t.name} (${s.paused ? 'paused' : 'playing'})` : 'no track'}`)
                setNow(t && {
                    uri: t.uri,
                    name: t.name,
                    artists: t.artists.map((a: any) => a.name).join(', '),
                    image: t.album.images[0]?.url ?? '',
                    paused: s.paused,
                })
            })
            p.connect().then((ok: boolean) => console.info(`[rater] SDK connect(): ${ok}`))
            player.current = p
        }
        const s = document.createElement('script')
        s.src = 'https://sdk.scdn.co/spotify-player.js'
        s.onerror = () => {
            console.error('[rater] Spotify player script failed to load')
            setError('The Spotify player script failed to load.')
        }
        console.info('[rater] loading the Spotify player script')
        document.body.appendChild(s)
    }, [enabled])

    return {
        deviceId,
        now,
        error,
        // Browsers only allow audio after a user gesture: call from a click handler.
        activate: () => player.current?.activateElement?.(),
        toggle: useCallback(() => {
            console.info('[rater] toggle play/pause')
            player.current?.togglePlay()
        }, []),
        next: useCallback(() => {
            console.info('[rater] skipping to the next track')
            player.current?.nextTrack()
        }, []),
    }
}
