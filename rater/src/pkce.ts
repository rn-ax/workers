const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
].join(' ')

const base64url = (bytes: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

export const randomVerifier = () =>
    base64url(crypto.getRandomValues(new Uint8Array(48)).buffer)

export const challengeFor = async (verifier: string) =>
    base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))

export const authorizeUrl = (clientId: string, redirectUri: string, challenge: string, state: string) =>
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
    })

export type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

const tokenRequest = async (body: Record<string, string>): Promise<Tokens> => {
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
    })
    if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`)
    return res.json()
}

export const exchangeCode = (clientId: string, redirectUri: string, code: string, verifier: string) =>
    tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
    })

export const refresh = (clientId: string, refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken })
