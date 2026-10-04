// Seeking never changes which track is playing: the only way the song changes is that it ends
// by itself. So a seek is clamped short of the end, and short of nothing at the start.
export const SEEK_STEP_MS = 30_000
const END_GUARD_MS = 1_500
const MIN_MOVE_MS = 1_000

// Furthest a seek may land, so it can never run the track out and start the next one.
export const latestSeekMs = (durationMs: number) => Math.max(0, durationMs - END_GUARD_MS)

export const clampSeek = (targetMs: number, durationMs: number) =>
    Math.min(Math.max(0, targetMs), latestSeekMs(durationMs))

// Where a 30 second skip lands, or null when that button should be disabled:
// - a track shorter than 30 seconds has neither button;
// - back goes 30 seconds, or to the start of the song when less than 30 seconds in (and does nothing at the start);
// - forward needs at least 30 seconds left, and still lands short of the end.
export const skipTarget = (positionMs: number, durationMs: number, direction: -1 | 1): number | null => {
    if (durationMs < SEEK_STEP_MS) return null
    if (direction < 0) return positionMs < MIN_MOVE_MS ? null : Math.max(0, positionMs - SEEK_STEP_MS)
    return durationMs - positionMs < SEEK_STEP_MS ? null : Math.min(positionMs + SEEK_STEP_MS, latestSeekMs(durationMs))
}
