import { useEffect, useRef, useState } from 'react'
import { SOURCE_PLAYLIST } from './config'
import { skipTarget } from './seek'
import { rateTrack, type Stars } from './ratingJob'
import { friendlyError, playlistTotal, startContext } from './spotify'
import { useAuth } from './useAuth'
import { usePlayer } from './usePlayer'
import { useCoverBackground } from './useCoverBackground'
import { usePosition } from './usePosition'
import { useRatingQueue } from './useRatingQueue'
import { Controls } from './components/Controls'
import { LogoutIcon } from './components/icons'
import { PlaylistHelper } from './components/PlaylistHelper'
import { Scrubber } from './components/Scrubber'
import { StarRating } from './components/StarRating'
import { TrackInfo } from './components/TrackInfo'

type Notice = { kind: 'info' | 'warning' | 'error'; text: string }

export default function App() {
    const auth = useAuth()
    const configured = SOURCE_PLAYLIST.id !== ''
    const player = usePlayer(auth.status === 'in' && configured, auth.getToken)
    const position = usePosition(player.now)
    const [started, setStarted] = useState(false)
    // False until the first start attempt has finished: the page shows a spinner, not a button.
    const [attempted, setAttempted] = useState(false)
    const [allRated, setAllRated] = useState(false)
    // The track just rated: its stars stay disabled until the player has moved on, so it can't be rated twice.
    const [ratedUri, setRatedUri] = useState<string | null>(null)
    // Adds already made for a track whose removal from the source failed, so retrying a rating never files it twice.
    const filed = useRef(new Set<string>())
    const [notice, setNotice] = useState<Notice | null>(null)

    // (Re)start the source playlist from its first track, or notice that nothing is left to rate.
    const startOver = async (token: string) => {
        if ((await playlistTotal(token, SOURCE_PLAYLIST.id)) === 0) {
            console.info(`[rater] "${SOURCE_PLAYLIST.name}" is empty, everything is rated`)
            player.pause()
            setAllRated(true)
            return
        }
        console.info(`[rater] starting "${SOURCE_PLAYLIST.name}" from the first track on device ${player.deviceId}`)
        await startContext(token, player.deviceId, SOURCE_PLAYLIST.id)
        setAllRated(false)
    }

    // `viaClick` is false for the automatic start on page load, which most browsers may refuse to play audio for.
    const start = async (viaClick: boolean) => {
        if (viaClick) player.activate()
        try {
            await startOver(await auth.getToken())
            setStarted(true)
            setNotice(null)
        } catch (e) {
            console.error('[rater] could not start playback', e)
            setNotice({ kind: 'error', text: friendlyError(e) })
        } finally {
            setAttempted(true)
        }
    }

    // Start by itself as soon as the player is ready. If the browser blocks autoplay, `autoplayBlocked`
    // brings the button back so one tap unlocks audio.
    const autoStarted = useRef(false)
    useEffect(() => {
        if (auth.status !== 'in' || !configured || !player.deviceId || autoStarted.current) return
        autoStarted.current = true
        console.info('[rater] starting automatically')
        start(false)
    }, [auth.status, configured, player.deviceId])

    const queue = useRatingQueue(
        (request) => rateTrack(auth.getToken, filed.current, request.stars, request.track),
        ({ total }, request) => {
            if (total === 0) {
                console.info(`[rater] "${SOURCE_PLAYLIST.name}" is empty, everything is rated`)
                player.pause()
                setAllRated(true)
            } else if (!request.hadNext) {
                // The rated track was the last one, so there was nothing to move on to: start again from the first.
                auth.getToken().then(startOver).catch((e) => {
                    console.error('[rater] rated, but could not restart the playlist', e)
                    setNotice({ kind: 'warning', text: `Rated, but the playlist didn't restart: ${friendlyError(e)}` })
                })
            }
        },
    )

    // Let the stars work again once the player has moved off the rated track, or if saving it failed (so it can be
    // retried). Not merely when saving is done: the last track stays on screen until the playlist restarts.
    useEffect(() => {
        if (ratedUri && (player.now?.uri !== ratedUri || queue.failures.length > 0)) setRatedUri(null)
    }, [ratedUri, player.now?.uri, queue.failures.length])

    // A rating moves on to the next song at once and is saved in the background (see useRatingQueue).
    // There is no separate "restart from the first song": the rated track is still first in the source until its
    // removal lands, so restarting would just play it again.
    const rate = (stars: Stars) => {
        const now = player.now
        if (!now || now.uri === ratedUri) return
        console.info(`[rater] rating ${stars}: "${now.name}", moving on`)
        setRatedUri(now.uri)
        queue.enqueue({ stars, track: { uri: now.uri, name: now.name, artists: now.artists }, hadNext: now.hasNext })
        if (now.hasNext) player.next()
    }

    const skip = (direction: -1 | 1) => {
        if (!player.now) return
        const to = skipTarget(position, player.now.durationMs, direction)
        if (to !== null) player.seek(to)
    }

    // Keys: 1-5 rate, space plays/pauses, left/right skip 30 seconds.
    const latest = useRef({ rate, skip, toggle: player.toggle })
    latest.current = { rate, skip, toggle: player.toggle }
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName
            if (e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT') return
            if (e.key >= '1' && e.key <= '5') latest.current.rate(Number(e.key) as Stars)
            else if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); latest.current.toggle() }
            else if (e.key === 'ArrowLeft') latest.current.skip(-1)
            else if (e.key === 'ArrowRight') latest.current.skip(1)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const playing = started && !allRated
    const body = () => {
        if (auth.status === 'loading') return <div className="spinner" role="status" aria-label="Loading" />
        if (auth.status === 'out') return <button className="button" onClick={auth.signIn}>Log in with Spotify</button>
        if (!configured) return <PlaylistHelper getToken={auth.getToken} />
        if (allRated) return (
            <div className="done">
                <div className="done-title">All rated</div>
                <p className="muted">Nothing left in {SOURCE_PLAYLIST.name}.</p>
                <button className="button" disabled={queue.pending > 0} onClick={() => start(true)}>Check again</button>
            </div>
        )
        if (!attempted) return <div className="spinner" role="status" aria-label="Starting" />
        if (!playing || player.autoplayBlocked) return (
            <button className="button" onClick={() => start(true)}>
                {player.autoplayBlocked ? 'Tap to play' : 'Start rating'}
            </button>
        )
        return null
    }

    const notices = (
        <>
            {auth.error && <div className="notice error">{auth.error}</div>}
            {player.error && <div className="notice error">{player.error}</div>}
            {queue.failures.length > 0 && (
                <div className="notice error">
                    {queue.failures.map((f, i) => <div key={i}>{f.message}</div>)}
                    <div className="actions">
                        <button className="button" onClick={queue.retry}>Retry</button>
                        <button className="button" onClick={queue.dismiss}>Dismiss</button>
                    </div>
                </div>
            )}
            {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
        </>
    )
    const logout = auth.status === 'in' && (
        <button className="logout" aria-label="Log out" title="Log out" onClick={auth.signOut}>
            <LogoutIcon />
        </button>
    )

    // The player fills the page: track info on top, rating and controls in the middle, scrubber along the bottom.
    const showPlayer = auth.status === 'in' && configured && attempted && playing && !player.autoplayBlocked
    useCoverBackground(showPlayer ? player.now?.image : undefined)
    if (showPlayer) {
        const now = player.now
        return (
            <main className="stage player">
                {logout}
                <header className="top"><TrackInfo track={now} /></header>
                <div className="middle">
                    <StarRating disabled={!now || now.uri === ratedUri} onRate={rate} />
                    <Controls paused={now?.paused ?? true} positionMs={position} durationMs={now?.durationMs ?? 0}
                        onToggle={player.toggle} onSkip={skip} />
                    {notices}
                </div>
                <footer className="bottom">
                    <Scrubber positionMs={position} durationMs={now?.durationMs ?? 0} onSeek={player.seek} />
                </footer>
            </main>
        )
    }

    return (
        <main className="stage">
            {logout}
            <section className="column">
                {body()}
                {notices}
            </section>
        </main>
    )
}
