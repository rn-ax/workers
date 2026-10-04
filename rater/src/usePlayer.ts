import { useCallback, useEffect, useRef, useState } from 'react'

export type NowPlaying = {
    uri: string
    name: string
    artists: string
    image: string
    paused: boolean
    // Where the track was at `receivedAt`; the UI interpolates from there while playing.
    positionMs: number
    durationMs: number
    receivedAt: number
    // Whether the playlist has a track after this one.
    hasNext: boolean
}

// Wraps Spotify's Web Playback SDK (loaded from Spotify's CDN: its terms forbid self-hosting it).
export const usePlayer = (enabled: boolean, getToken: () => Promise<string>) => {
    const [deviceId, setDeviceId] = useState('')
    const [now, setNow] = useState<NowPlaying | null>(null)
    const [error, setError] = useState('')
    const [autoplayBlocked, setAutoplayBlocked] = useState(false)
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
            // The browser refused to start audio without a user gesture; the UI then asks for a tap.
            p.addListener('autoplay_failed', () => {
                console.warn('[rater] the browser blocked autoplay, waiting for a tap')
                setAutoplayBlocked(true)
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
                    positionMs: s.position,
                    durationMs: s.duration,
                    receivedAt: Date.now(),
                    hasNext: (s.track_window.next_tracks?.length ?? 0) > 0,
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
        autoplayBlocked,
        // Browsers only allow audio after a user gesture: call from a click handler.
        activate: () => {
            setAutoplayBlocked(false)
            return player.current?.activateElement?.()
        },
        toggle: useCallback(() => {
            console.info('[rater] toggle play/pause')
            player.current?.togglePlay()
        }, []),
        pause: useCallback(() => player.current?.pause(), []),
        // Only a rating moves on to the next track (the controls never do), and only when one exists.
        next: useCallback(() => {
            console.info('[rater] moving on to the next track')
            return player.current?.nextTrack()
        }, []),
        // Moves within the current track only. The song changes when it ends, or when a rating moves on.
        seek: useCallback((ms: number) => {
            console.info(`[rater] seeking to ${Math.round(ms / 1000)}s`)
            return player.current?.seek(ms)
        }, []),
    }
}
