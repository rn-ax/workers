import { useCallback, useEffect, useRef, useState } from 'react'
import { SPOTIFY_CLIENT_ID } from './config'
import { authorizeUrl, challengeFor, exchangeCode, randomVerifier, refresh, type Tokens } from './pkce'
import { friendlyError } from './spotify'

const REFRESH_KEY = 'refreshToken'
const REDIRECT_URI = location.origin + '/'
const CHANNEL = 'rater-auth'

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

export type AuthStatus = 'loading' | 'out' | 'in' | 'popup'

// The login popup lands back on this page with ?code=. It hands the code to the opener over a
// BroadcastChannel (accounts.spotify.com's COOP severs window.opener) and closes itself.
const codeFromUrl = () => new URLSearchParams(location.search).get('code')

export const useAuth = () => {
    const [status, setStatus] = useState<AuthStatus>(codeFromUrl() ? 'popup' : 'loading')
    const [error, setError] = useState('')
    const token = useRef<{ access: string; expiresAt: number } | null>(null)
    const verifier = useRef('')

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

    const finish = useCallback(async (code: string, v: string) => {
        try {
            keep(await exchangeCode(SPOTIFY_CLIENT_ID, REDIRECT_URI, code, v))
            history.replaceState(null, '', location.pathname)
            console.info('[rater] token exchange OK (browser-only PKCE, no client secret)')
        } catch (e) {
            console.error('[rater] token exchange failed', e)
            setError(friendlyError(e))
            setStatus('out')
        }
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
        const channel = new BroadcastChannel(CHANNEL)
        const code = codeFromUrl()
        if (code) {
            console.info('[rater] login popup landed with a code, handing it to the opener')
            let acked = false
            channel.onmessage = (e) => { if (e.data?.type === 'ack') acked = true }
            channel.postMessage({ type: 'code', code })
            setTimeout(() => {
                if (acked) {
                    console.info('[rater] opener acknowledged, closing popup')
                    return window.close()
                }
                console.warn('[rater] no opener answered, finishing the login in this tab')
                // Nobody was waiting (login opened as a plain tab): finish here if we can.
                const v = store.get('verifier')
                if (v) finish(code, v)
                else { console.error('[rater] no verifier in storage and no opener'); setError('Login finished but the original tab is gone. Close this tab and try again.'); setStatus('out') }
            }, 1500)
        } else {
            channel.onmessage = (e) => {
                if (e.data?.type !== 'code') return
                console.info('[rater] received login code from the popup')
                channel.postMessage({ type: 'ack' })
                finish(e.data.code, verifier.current)
            }
            if (store.get(REFRESH_KEY)) console.info('[rater] found a stored refresh token, logging in silently')
            else console.info('[rater] not logged in')
            if (store.get(REFRESH_KEY)) getToken().then(() => undefined, () => undefined)
            else setStatus('out')
        }
        return () => channel.close()
    }, [])

    const signIn = async () => {
        setError('')
        verifier.current = randomVerifier()
        store.set('verifier', verifier.current)
        const url = authorizeUrl(SPOTIFY_CLIENT_ID, REDIRECT_URI, await challengeFor(verifier.current), crypto.randomUUID())
        const popup = window.open(url, 'spotify-login', 'width=480,height=720')
        console.info(popup ? '[rater] login popup opened' : '[rater] login popup was blocked')
        if (!popup) setError('The login popup was blocked.')
    }

    return { status, error, signIn, signOut, getToken }
}
