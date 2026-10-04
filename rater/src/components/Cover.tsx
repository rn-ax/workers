import type { ReactNode } from 'react'
import type { NowPlaying } from '../usePlayer'

// Children (the scrubber) are overlaid along the bottom edge, under the track info.
export function Cover({ track, children }: { track: NowPlaying | null; children?: ReactNode }) {
    return (
        <div className="cover">
            {track?.image && <img src={track.image} alt="" />}
            <div className="cover-caption">
                <div className="track-title">{track?.name ?? 'Loading…'}</div>
                <div className="track-artist">{track?.artists ?? ' '}</div>
            </div>
            {children}
        </div>
    )
}
