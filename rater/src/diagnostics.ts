export type Diagnostics = Record<string, string>

const attempt = (fn: () => string) => {
    try {
        return fn()
    } catch (e) {
        return `THROWS: ${e}`
    }
}

export const collect = async (): Promise<Diagnostics> => {
    const out: Diagnostics = {
        'location.href': location.href,
        'location.origin': location.origin,
        'document.referrer': document.referrer || '(empty)',
        'framed': String(window.top !== window),
        'secure context': String(window.isSecureContext),
        'localStorage': attempt(() => {
            localStorage.setItem('__probe', '1')
            const ok = localStorage.getItem('__probe') === '1'
            localStorage.removeItem('__probe')
            return ok ? 'works' : 'silently dropped'
        }),
        'crypto.subtle': String(!!crypto.subtle),
        'window.open': attempt(() => String(typeof window.open)),
    }
    out['Widevine (EME)'] = await (async () => {
        try {
            await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
                {
                    initDataTypes: ['cenc'],
                    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
                },
            ])
            return 'available'
        } catch (e) {
            return `unavailable: ${e}`
        }
    })()
    return out
}
