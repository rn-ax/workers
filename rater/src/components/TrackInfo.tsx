import type { NowPlaying } from '../usePlayer'

export function TrackInfo({ track }: { track: NowPlaying | null }) {
    return (
        <div className="track-info">
            <div className="track-title">{track?.name ?? 'Loading…'}</div>
            <div className="track-artist">{track?.artists ?? ' '}</div>
        </div>
    )
}
