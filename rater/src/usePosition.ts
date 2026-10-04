import { useEffect, useReducer } from 'react'
import type { NowPlaying } from './usePlayer'

// The SDK only reports position on state changes, so interpolate from the last report while playing.
export const usePosition = (now: NowPlaying | null) => {
    const [, redraw] = useReducer((n: number) => n + 1, 0)
    useEffect(() => {
        if (!now || now.paused) return
        const id = setInterval(redraw, 250)
        return () => clearInterval(id)
    }, [now])
    if (!now) return 0
    const elapsed = now.paused ? 0 : Date.now() - now.receivedAt
    return Math.min(now.durationMs, now.positionMs + elapsed)
}
