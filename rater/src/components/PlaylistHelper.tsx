import { useState } from 'react'
import { friendlyError, myPlaylists } from '../spotify'

// Shown only while config.ts has no source playlist: lists your playlists with the IDs to paste in.
export function PlaylistHelper({ getToken }: { getToken: () => Promise<string> }) {
    const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null)
    const [error, setError] = useState('')
    const load = async () => {
        try {
            const found = await myPlaylists(await getToken())
            console.info(`[rater] listed ${found.length} playlists`)
            setLists(found)
        } catch (e) {
            console.error('[rater] could not list playlists', e)
            setError(friendlyError(e))
        }
    }
    return (
        <div className="ui segment">
            <div className="ui header">No source playlist configured</div>
            <p>Set <code>SOURCE_PLAYLIST</code> and <code>RATING_PLAYLISTS</code> in <code>rater/src/config.ts</code>.</p>
            <button className="ui button" onClick={load}>List my playlists</button>
            {error && <div className="ui negative message">{error}</div>}
            {lists && (
                <table className="ui very basic compact table">
                    <tbody>
                        {lists.map((p) => <tr key={p.id}><td>{p.name}</td><td><code>{p.id}</code></td></tr>)}
                    </tbody>
                </table>
            )}
        </div>
    )
}
