import { useCallback, useEffect, useRef, useState } from 'react'
import { createSerialQueue } from './serialQueue'
import type { Stars } from './ratingJob'
import type { TrackRef } from './spotify'

export type RatingRequest = { stars: Stars; track: TrackRef; hadNext: boolean }
export type RatingFailure = { request: RatingRequest; message: string }

// Saves ratings in the background, one at a time (removal is verified by counting the playlist, which only makes
// sense when nothing else is changing it), so the page can move on to the next song straight away.
export const useRatingQueue = (
    save: (request: RatingRequest) => Promise<{ total: number }>,
    onSaved: (result: { total: number }, request: RatingRequest) => void,
) => {
    const [pending, setPending] = useState(0)
    const [failures, setFailures] = useState<RatingFailure[]>([])
    const latest = useRef({ save, onSaved })
    latest.current = { save, onSaved }
    const queue = useRef(createSerialQueue((request: RatingRequest) => latest.current.save(request)))

    const enqueue = useCallback((request: RatingRequest) => {
        setPending((n) => n + 1)
        queue.current
            .push(request)
            .then(
                (result) => latest.current.onSaved(result, request),
                (e) => setFailures((f) => [...f, { request, message: e instanceof Error ? e.message : String(e) }]),
            )
            .finally(() => setPending((n) => n - 1))
    }, [])

    const retry = useCallback(() => {
        setFailures((current) => {
            current.forEach((f) => enqueue(f.request))
            return []
        })
    }, [enqueue])

    const dismiss = useCallback(() => setFailures([]), [])

    // Closing the page with ratings still being saved would lose them: ask first.
    useEffect(() => {
        if (pending === 0) return
        const warn = (e: BeforeUnloadEvent) => e.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [pending])

    return { pending, failures, enqueue, retry, dismiss }
}
