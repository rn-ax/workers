// 83_000 -> "1:23"
export const clock = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
