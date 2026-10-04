import { skipTarget } from '../seek'
import { Back30Icon, Forward30Icon, PauseIcon, PlayIcon } from './icons'

// Deliberately no previous/next: the song only changes when it ends or a rating restarts the list.
export function Controls({ paused, positionMs, durationMs, onToggle, onSkip }: {
    paused: boolean
    positionMs: number
    durationMs: number
    onToggle: () => void
    onSkip: (direction: -1 | 1) => void
}) {
    return (
        <div className="controls">
            <button className="skip" aria-label="Back 30 seconds"
                disabled={skipTarget(positionMs, durationMs, -1) === null} onClick={() => onSkip(-1)}>
                <Back30Icon />
            </button>
            <button className="play" aria-label={paused ? 'Play' : 'Pause'} onClick={onToggle}>
                {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button className="skip" aria-label="Forward 30 seconds"
                disabled={skipTarget(positionMs, durationMs, 1) === null} onClick={() => onSkip(1)}>
                <Forward30Icon />
            </button>
        </div>
    )
}
