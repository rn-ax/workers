import { useState } from 'react'
import { clock } from '../format'
import { clampSeek } from '../seek'

export function Scrubber({ positionMs, durationMs, onSeek }: {
    positionMs: number
    durationMs: number
    onSeek: (ms: number) => void
}) {
    // While dragging, show the thumb where the finger is and only seek on release.
    const [drag, setDrag] = useState<number | null>(null)
    const shown = drag ?? positionMs
    const commit = () => {
        if (drag === null) return
        onSeek(clampSeek(drag, durationMs))
        setDrag(null)
    }
    const fill = durationMs ? Math.min(100, (shown / durationMs) * 100) : 0
    const time = `${clock(shown)} of ${clock(durationMs)}`
    return (
        <input
            className="scrubber"
            type="range"
            min={0}
            max={durationMs || 1}
            step={1000}
            value={shown}
            aria-label="Position"
            aria-valuetext={time}
            title={time}
            style={{ ['--fill' as string]: `${fill}%` }}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
        />
    )
}
