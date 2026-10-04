import { RATING_PLAYLISTS, SOURCE_PLAYLIST } from './config'
import { addItem, friendlyError, removeFromPlaylist, type TrackRef } from './spotify'

export type Stars = 1 | 2 | 3 | 4 | 5

// A rating that could not be fully saved. `message` is written for the person, not the console.
export class RatingError extends Error {}

// Files the track under the rating's playlist (a rating with no playlist just drops it), then removes it from the
// source, verified. `filed` remembers adds whose removal failed, so retrying never files a track twice.
export const rateTrack = async (
    getToken: () => Promise<string>,
    filed: Set<string>,
    stars: Stars,
    track: TrackRef,
): Promise<{ total: number }> => {
    const target = RATING_PLAYLISTS[stars]
    const key = `${target.id}|${track.uri}`
    console.info(`[rater] saving rating ${stars}: "${track.name}" (${track.uri}) -> ${target.id ? `add to "${target.name}"` : 'drop'}, then remove from source`)

    let token: string
    try {
        token = await getToken()
        if (target.id && filed.has(key)) {
            console.info(`[rater] already filed under "${target.name}", only retrying the removal`)
        } else if (target.id) {
            const added = await addItem(token, target.id, track.uri)
            filed.add(key)
            console.info(`[rater] added to "${target.name}", snapshot ${added?.snapshot_id}`)
        }
    } catch (e) {
        console.error(`[rater] rating ${stars} for "${track.name}" failed before changing anything`, e)
        throw new RatingError(`${track.name}: not saved. ${friendlyError(e)}`)
    }

    let result: { removed: boolean; total: number }
    try {
        result = await removeFromPlaylist(token, SOURCE_PLAYLIST.id, track)
    } catch (e) {
        console.warn(`[rater] could not remove "${track.name}" from the source`, e)
        throw new RatingError(`${track.name}: filed, but not removed from ${SOURCE_PLAYLIST.name}. ${friendlyError(e)}`)
    }
    if (!result.removed) {
        console.error(`[rater] "${track.name}" (${track.uri}) is still in "${SOURCE_PLAYLIST.name}" after trying to remove it`)
        throw new RatingError(`${track.name}: still in ${SOURCE_PLAYLIST.name}, Spotify didn't remove it${target.id ? ` (it is filed under ${target.name})` : ''}.`)
    }
    filed.delete(key)
    console.info(`[rater] removed from "${SOURCE_PLAYLIST.name}", ${result.total} left`)
    return { total: result.total }
}
