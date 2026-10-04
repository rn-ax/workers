import { useCallback, useEffect, useRef, useState } from 'react'
import { SPOTIFY_CLIENT_ID } from './config'
import { authorizeUrl, challengeFor, exchangeCode, randomVerifier, refresh, type Tokens } from './pkce'
import { friendlyError } from './spotify'

const REFRESH_KEY = 'refreshToken'
const PENDING_KEY = 'loginPending'
const REDIRECT_URI = location.origin + '/'

const store = {
    get: (k: string) => {
        try { return localStorage.getItem(k) ?? '' } catch { return '' }
    },
    set: (k: string, v: string) => {
        try { localStorage.setItem(k, v) } catch { /* stay logged in for this tab only */ }
    },
    remove: (k: string) => {
        try { localStorage.removeItem(k) } catch { /* nothing to clear */ }
    },
}

export type AuthStatus = 'loading' | 'out' | 'in'

type Pending = { verifier: string; state: string }

const readPending = (): Pending | null => {
    try {
        const p = JSON.parse(store.get(PENDING_KEY))
        return p?.verifier && p?.state ? p : null
    } catch {
        return null
    }
}

// Logging in is a plain redirect to Spotify and back in the same tab. A popup is blocked by Safari unless
// window.open runs synchronously inside the click, and it cannot hand its result back to an iOS home-screen app.
export const useAuth = () => {
    const [status, setStatus] = useState<AuthStatus>('loading')
    const [error, setError] = useState('')
    const token = useRef<{ access: string; expiresAt: number } | null>(null)

    const keep = (t: Tokens) => {
        token.current = { access: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 }
        console.info(`[rater] access token acquired, expires in ${t.expires_in}s, scope: ${t.scope ?? '(not reported)'}`)
        if (t.refresh_token) store.set(REFRESH_KEY, t.refresh_token)
        setStatus('in')
    }

    const signOut = useCallback(() => {
        console.info('[rater] signed out, stored refresh token cleared')
        token.current = null
        store.remove(REFRESH_KEY)
        setStatus('out')
    }, [])

    // A valid access token, silently refreshed when it is about to expire.
    const getToken = useCallback(async () => {
        if (token.current && token.current.expiresAt - Date.now() > 60_000) return token.current.access
        const stored = store.get(REFRESH_KEY)
        if (!stored) throw new Error('Not logged in')
        console.info('[rater] refreshing access token from stored refresh token')
        try {
            keep(await refresh(SPOTIFY_CLIENT_ID, stored))
        } catch (e) {
            console.error('[rater] token refresh failed, signing out', e)
            signOut()
            throw e
        }
        return token.current!.access
    }, [signOut])

    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const code = params.get('code')
        const denied = params.get('error')
        if (code || denied) {
            // Back from Spotify: check it is the login we started, then trade the code for tokens.
            const pending = readPending()
            store.remove(PENDING_KEY)
            history.replaceState(null, '', location.pathname)
            if (denied) {
                console.warn(`[rater] Spotify login was not completed: ${denied}`)
                setError('Spotify login was cancelled.')
                setStatus('out')
            } else if (!pending || pending.state !== params.get('state')) {
                console.error('[rater] returned from Spotify but could not match the login that was started')
                setError('The login could not be verified. Please try again.')
                setStatus('out')
            } else {
                console.info('[rater] returned from Spotify with a code')
                exchangeCode(SPOTIFY_CLIENT_ID, REDIRECT_URI, code!, pending.verifier).then(
                    (t) => {
                        keep(t)
                        console.info('[rater] token exchange OK (browser-only PKCE, no client secret)')
                    },
                    (e) => {
                        console.error('[rater] token exchange failed', e)
                        setError(friendlyError(e))
                        setStatus('out')
                    },
                )
            }
            return
        }
        if (store.get(REFRESH_KEY)) {
            console.info('[rater] found a stored refresh token, logging in silently')
            getToken().then(() => undefined, () => undefined)
        } else {
            console.info('[rater] not logged in')
            setStatus('out')
        }
    }, [])

    const signIn = async () => {
        setError('')
        const verifier = randomVerifier()
        const state = crypto.randomUUID()
        store.set(PENDING_KEY, JSON.stringify({ verifier, state }))
        const url = authorizeUrl(SPOTIFY_CLIENT_ID, REDIRECT_URI, await challengeFor(verifier), state)
        console.info('[rater] redirecting to Spotify to log in')
        location.assign(url)
    }

    return { status, error, signIn, signOut, getToken }
}
