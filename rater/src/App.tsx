import { useEffect, useRef, useState } from 'react'
import { RATING_PLAYLISTS, SOURCE_PLAYLIST } from './config'
import { addItem, friendlyError, removeItem, startContext } from './spotify'
import { useAuth } from './useAuth'
import { usePlayer } from './usePlayer'
import { NowPlaying } from './components/NowPlaying'
import { PlaylistHelper } from './components/PlaylistHelper'
import { RatingBar } from './components/RatingBar'

type Stars = 1 | 2 | 3 | 4 | 5
type Notice = { kind: 'info' | 'warning' | 'negative'; text: string }

export default function App() {
    const auth = useAuth()
    const configured = SOURCE_PLAYLIST.id !== ''
    const player = usePlayer(auth.status === 'in' && configured, auth.getToken)
    const [started, setStarted] = useState(false)
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState<Notice | null>(null)

    const start = async () => {
        console.info(`[rater] starting playback of "${SOURCE_PLAYLIST.name}" on device ${player.deviceId}`)
        player.activate()
        try {
            await startContext(await auth.getToken(), player.deviceId, SOURCE_PLAYLIST.id)
            setStarted(true)
            setNotice(null)
            console.info('[rater] playback started')
        } catch (e) {
            console.error('[rater] could not start playback', e)
            setNotice({ kind: 'negative', text: friendlyError(e) })
        }
    }

    const rate = async (stars: Stars) => {
        if (busy || !player.now) return
        const { uri, name } = player.now
        const target = RATING_PLAYLISTS[stars]
        console.info(`[rater] rating ${stars}: "${name}" (${uri}) -> ${target.id ? `add to "${target.name}"` : 'drop'}, then remove from source`)
        setBusy(true)
        setNotice(null)
        let token: string
        try {
            token = await auth.getToken()
            if (target.id) {
                const added = await addItem(token, target.id, uri)
                console.info(`[rater] added to "${target.name}", snapshot ${added?.snapshot_id}`)
            }
        } catch (e) {
            console.error(`[rater] rating ${stars} aborted before changing anything`, e)
            setNotice({ kind: 'negative', text: `Nothing changed: ${friendlyError(e)}` })
            setBusy(false)
            return
        }
        try {
            const removed = await removeItem(token, SOURCE_PLAYLIST.id, uri)
            console.info(`[rater] removed from "${SOURCE_PLAYLIST.name}", snapshot ${removed?.snapshot_id}`)
            setNotice({ kind: 'info', text: `${name}: ${target.id ? `filed under ${target.name}` : 'dropped'}.` })
        } catch (e) {
            console.warn(`[rater] filed "${name}" but could not remove it from the source`, e)
            setNotice({ kind: 'warning', text: `${name} was filed but not removed from the source: ${friendlyError(e)}` })
        }
        player.next()
        setBusy(false)
    }

    // Keys 1-5 rate, space toggles play/pause.
    const latest = useRef({ rate, toggle: player.toggle })
    latest.current = { rate, toggle: player.toggle }
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).tagName === 'BUTTON' && e.key === ' ') return
            if (e.key >= '1' && e.key <= '5') latest.current.rate(Number(e.key) as Stars)
            else if (e.key === ' ') { e.preventDefault(); latest.current.toggle() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    if (auth.status === 'popup') return <p>Finishing login… you can close this window.</p>
    if (auth.status === 'loading') return <div className="ui active centered inline loader" />

    return (
        <div>
            <h2 className="ui header">Rater</h2>
            {auth.error && <div className="ui negative message">{auth.error}</div>}

            {auth.status === 'out' && (
                <button className="ui primary button" onClick={auth.signIn}>Log in with Spotify</button>
            )}

            {auth.status === 'in' && !configured && <PlaylistHelper getToken={auth.getToken} />}

            {auth.status === 'in' && configured && (
                <>
                    <p>Rating tracks from <b>{SOURCE_PLAYLIST.name}</b>.</p>
                    {player.error && <div className="ui negative message">{player.error}</div>}
                    {!started ? (
                        <button className="ui primary button" disabled={!player.deviceId} onClick={start}>
                            {player.deviceId ? 'Start' : 'Connecting player…'}
                        </button>
                    ) : (
                        <>
                            <NowPlaying track={player.now} onToggle={player.toggle} />
                            <RatingBar disabled={busy || !player.now} onRate={rate} />
                        </>
                    )}
                    {notice && <div className={`ui ${notice.kind} message`}>{notice.text}</div>}
                    <div style={{ marginTop: 24 }}>
                        <button className="ui basic tiny button" onClick={auth.signOut}>Log out</button>
                    </div>
                </>
            )}
        </div>
    )
}
