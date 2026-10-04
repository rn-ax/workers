import { RATING_PLAYLISTS } from '../config'

const STARS = [1, 2, 3, 4, 5] as const

export function RatingBar({ disabled, onRate }: { disabled: boolean; onRate: (stars: 1 | 2 | 3 | 4 | 5) => void }) {
    return (
        <div className="ui five column grid" style={{ margin: 0 }}>
            {STARS.map((n) => (
                <div className="column" key={n} style={{ padding: 4 }}>
                    <button className="ui fluid large primary button" disabled={disabled} onClick={() => onRate(n)}>
                        {n} ★
                        <div className="ui tiny label" style={{ marginTop: 6 }}>
                            {RATING_PLAYLISTS[n].id ? 'file' : 'drop'}
                        </div>
                    </button>
                </div>
            ))}
        </div>
    )
}
