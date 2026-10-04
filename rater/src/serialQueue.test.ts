import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serialQueue'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('createSerialQueue', () => {
    it('runs jobs one at a time, in the order they were pushed', async () => {
        const log: string[] = []
        let running = 0
        let mostAtOnce = 0
        const queue = createSerialQueue(async (name: string) => {
            running++
            mostAtOnce = Math.max(mostAtOnce, running)
            log.push(`start ${name}`)
            await sleep(name === 'slow' ? 30 : 1)
            log.push(`end ${name}`)
            running--
        })
        await Promise.all([queue.push('slow'), queue.push('b'), queue.push('c')])
        expect(mostAtOnce).toBe(1)
        expect(log).toEqual(['start slow', 'end slow', 'start b', 'end b', 'start c', 'end c'])
    })

    it('hands each job its own result', async () => {
        const queue = createSerialQueue(async (n: number) => n * 2)
        expect(await Promise.all([queue.push(1), queue.push(2), queue.push(3)])).toEqual([2, 4, 6])
    })

    it('reports a failure to the job that caused it and still runs the jobs behind it', async () => {
        const queue = createSerialQueue(async (n: number) => {
            if (n === 2) throw new Error('boom')
            return n
        })
        const results = await Promise.allSettled([queue.push(1), queue.push(2), queue.push(3)])
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
        expect((results[1] as PromiseRejectedResult).reason.message).toBe('boom')
    })

    it('keeps accepting jobs after the queue has gone idle', async () => {
        const queue = createSerialQueue(async (n: number) => n)
        expect(await queue.push(1)).toBe(1)
        await sleep(5)
        expect(await queue.push(2)).toBe(2)
    })
})
