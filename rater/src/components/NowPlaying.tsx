import type { NowPlaying as Track } from '../usePlayer'

export function NowPlaying({ track, onToggle }: { track: Track | null; onToggle: () => void }) {
    if (!track) return <div className="ui placeholder segment"><p>Waiting for the player…</p></div>
    return (
        <div className="ui segment" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {track.image && <img src={track.image} alt="" width={96} height={96} />}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ui small header" style={{ margin: 0 }}>{track.name}</div>
                <div>{track.artists}</div>
            </div>
            <button className="ui icon button" onClick={onToggle} aria-label={track.paused ? 'Play' : 'Pause'}>
                {track.paused ? '▶' : '⏸'}
            </button>
        </div>
    )
}
