import { useEffect, useRef, useState } from 'react'
import { RATING_PLAYLISTS, SOURCE_PLAYLIST } from './config'
import { skipTarget } from './seek'
import { addItem, friendlyError, playlistTotal, removeFromPlaylist, startContext } from './spotify'
import { useAuth } from './useAuth'
import { usePlayer } from './usePlayer'
import { usePosition } from './usePosition'
import { Controls } from './components/Controls'
import { Cover } from './components/Cover'
import { LogoutIcon } from './components/icons'
import { PlaylistHelper } from './components/PlaylistHelper'
import { Scrubber } from './components/Scrubber'
import { StarRating } from './components/StarRating'

type Stars = 1 | 2 | 3 | 4 | 5
type Notice = { kind: 'info' | 'warning' | 'error'; text: string }

export default function App() {
    const auth = useAuth()
    const configured = SOURCE_PLAYLIST.id !== ''
    const player = usePlayer(auth.status === 'in' && configured, auth.getToken)
    const position = usePosition(player.now)
    const [started, setStarted] = useState(false)
    const [allRated, setAllRated] = useState(false)
    const [busy, setBusy] = useState(false)
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

    const start = async () => {
        player.activate()
        try {
            await startOver(await auth.getToken())
            setStarted(true)
            setNotice(null)
        } catch (e) {
            console.error('[rater] could not start playback', e)
            setNotice({ kind: 'error', text: friendlyError(e) })
        }
    }

    const rate = async (stars: Stars) => {
        if (busy || !player.now) return
        const { uri, name } = player.now
        const target = RATING_PLAYLISTS[stars]
        console.info(`[rater] rating ${stars}: "${name}" (${uri}) -> ${target.id ? `add to "${target.name}"` : 'drop'}, then remove from source`)
        setBusy(true)
        setNotice(null)
        const key = `${target.id}|${uri}`
        let token: string
        try {
            token = await auth.getToken()
            if (target.id && filed.current.has(key)) {
                console.info(`[rater] already filed under "${target.name}", only retrying the removal`)
            } else if (target.id) {
                const added = await addItem(token, target.id, uri)
                filed.current.add(key)
                console.info(`[rater] added to "${target.name}", snapshot ${added?.snapshot_id}`)
            }
        } catch (e) {
            console.error(`[rater] rating ${stars} aborted before changing anything`, e)
            setNotice({ kind: 'error', text: `Nothing changed: ${friendlyError(e)}` })
            setBusy(false)
            return
        }
        try {
            if (!(await removeFromPlaylist(token, SOURCE_PLAYLIST.id, uri))) {
                console.error(`[rater] "${name}" (${uri}) is still in "${SOURCE_PLAYLIST.name}" after trying to remove it`)
                setNotice({
                    kind: 'error',
                    text: `${name} is still in ${SOURCE_PLAYLIST.name}: Spotify didn't remove it. ${target.id ? `It is filed under ${target.name}. ` : ''}Rate it again to retry.`,
                })
                setBusy(false)
                return
            }
            filed.current.delete(key)
            console.info(`[rater] removed from "${SOURCE_PLAYLIST.name}"`)
        } catch (e) {
            console.warn(`[rater] could not remove "${name}" from the source`, e)
            setNotice({ kind: 'warning', text: `${name} was filed but not removed from the source: ${friendlyError(e)}` })
            setBusy(false)
            return
        }
        try {
            await startOver(token)
        } catch (e) {
            console.error('[rater] rated, but could not restart the playlist', e)
            setNotice({ kind: 'warning', text: `Rated, but the playlist didn't restart: ${friendlyError(e)}` })
        }
        setBusy(false)
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
        if (auth.status === 'popup') return <p className="muted">Finishing login… you can close this window.</p>
        if (auth.status === 'loading') return <div className="spinner" role="status" aria-label="Loading" />
        if (auth.status === 'out') return <button className="primary" onClick={auth.signIn}>Log in with Spotify</button>
        if (!configured) return <PlaylistHelper getToken={auth.getToken} />
        if (allRated) return (
            <div className="done">
                <div className="done-title">All rated</div>
                <p className="muted">Nothing left in {SOURCE_PLAYLIST.name}.</p>
                <button className="primary" disabled={busy} onClick={start}>Check again</button>
            </div>
        )
        if (!playing) return (
            <button className="primary" disabled={!player.deviceId} onClick={start}>
                {player.deviceId ? 'Start rating' : 'Connecting player…'}
            </button>
        )
        const now = player.now
        return (
            <>
                <Cover track={now}>
                    <Scrubber positionMs={position} durationMs={now?.durationMs ?? 0} onSeek={player.seek} />
                </Cover>
                <StarRating disabled={busy || !now} onRate={rate} />
                <Controls paused={now?.paused ?? true} positionMs={position} durationMs={now?.durationMs ?? 0}
                    onToggle={player.toggle} onSkip={skip} />
            </>
        )
    }

    return (
        <main className="stage">
            {auth.status === 'in' && (
                <button className="logout" aria-label="Log out" title="Log out" onClick={auth.signOut}>
                    <LogoutIcon />
                </button>
            )}
            <section className="column">
                {body()}
                {auth.error && <div className="notice error">{auth.error}</div>}
                {player.error && <div className="notice error">{player.error}</div>}
                {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
            </section>
        </main>
    )
}
