// Runs jobs strictly one after another, in the order they were pushed. A job that fails does not stop the
// ones behind it. `push` returns that job's own result, so the caller sees its failure.
export const createSerialQueue = <T, R>(handler: (job: T) => Promise<R>) => {
    let chain: Promise<unknown> = Promise.resolve()
    return {
        push: (job: T): Promise<R> => {
            const result = chain.then(() => handler(job))
            chain = result.catch(() => undefined)
            return result
        },
    }
}
