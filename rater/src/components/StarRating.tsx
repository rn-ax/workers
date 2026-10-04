import { useState } from 'react'
import { RATING_PLAYLISTS } from '../config'
import { StarIcon } from './icons'

const STARS = [1, 2, 3, 4, 5] as const
type Stars = (typeof STARS)[number]

const describe = (n: Stars) => {
    const target = RATING_PLAYLISTS[n]
    return `Rate ${n} ${n === 1 ? 'star' : 'stars'}: ${target.id ? `file under ${target.name}` : 'remove from the list'}`
}

// The star you click is the rating: the third star is 3 stars. Stars up to it light up on hover.
export function StarRating({ disabled, onRate }: { disabled: boolean; onRate: (stars: Stars) => void }) {
    const [hover, setHover] = useState(0)
    return (
        <div className="stars" onMouseLeave={() => setHover(0)}>
            {STARS.map((n) => (
                <button
                    key={n}
                    className={n <= hover ? 'star lit' : 'star'}
                    disabled={disabled}
                    aria-label={describe(n)}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    onClick={() => onRate(n)}
                >
                    <StarIcon />
                </button>
            ))}
        </div>
    )
}
