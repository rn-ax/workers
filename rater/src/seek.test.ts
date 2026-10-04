import { describe, expect, it } from 'vitest'
import { clampSeek, latestSeekMs, skipTarget } from './seek'

const THREE_MIN = 180_000

describe('skipTarget', () => {
    it('skips 30 seconds either way mid-track', () => {
        expect(skipTarget(90_000, THREE_MIN, 1)).toBe(120_000)
        expect(skipTarget(90_000, THREE_MIN, -1)).toBe(60_000)
    })

    it('goes back to the start of the song when less than 30 seconds in', () => {
        expect(skipTarget(10_000, THREE_MIN, -1)).toBe(0)
        expect(skipTarget(29_999, THREE_MIN, -1)).toBe(0)
        expect(skipTarget(30_000, THREE_MIN, -1)).toBe(0)
        expect(skipTarget(31_000, THREE_MIN, -1)).toBe(1_000)
    })

    it('has nothing to go back to at the very start', () => {
        expect(skipTarget(0, THREE_MIN, -1)).toBeNull()
        expect(skipTarget(400, THREE_MIN, -1)).toBeNull()
    })

    it('disables forward with less than 30 seconds left', () => {
        expect(skipTarget(150_001, THREE_MIN, 1)).toBeNull()
        expect(skipTarget(170_000, THREE_MIN, 1)).toBeNull()
        expect(skipTarget(THREE_MIN, THREE_MIN, 1)).toBeNull()
    })

    it('never lets a forward skip run the track out and start the next one', () => {
        expect(skipTarget(150_000, THREE_MIN, 1)).toBe(latestSeekMs(THREE_MIN))
        expect(latestSeekMs(THREE_MIN)).toBeLessThan(THREE_MIN)
    })

    it('disables both buttons on a track shorter than 30 seconds', () => {
        expect(skipTarget(5_000, 20_000, -1)).toBeNull()
        expect(skipTarget(5_000, 20_000, 1)).toBeNull()
        expect(skipTarget(5_000, 29_999, -1)).toBeNull()
        expect(skipTarget(5_000, 29_999, 1)).toBeNull()
    })

    it('on a track of exactly 30 seconds, back works and forward still stops short of the end', () => {
        expect(skipTarget(10_000, 30_000, -1)).toBe(0)
        expect(skipTarget(0, 30_000, 1)).toBe(latestSeekMs(30_000))
    })
})

describe('clampSeek', () => {
    it('clamps scrubbing into the playable range', () => {
        expect(clampSeek(-5, THREE_MIN)).toBe(0)
        expect(clampSeek(THREE_MIN, THREE_MIN)).toBe(latestSeekMs(THREE_MIN))
        expect(clampSeek(61_000, THREE_MIN)).toBe(61_000)
    })
})
