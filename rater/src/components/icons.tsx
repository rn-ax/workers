// 24x24 glyphs, drawn in currentColor.
const Svg = ({ children }: { children: React.ReactNode }) => (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">{children}</svg>
)

export const PlayIcon = () => <Svg><path fill="currentColor" d="M8 5v14l11-7z" /></Svg>

export const PauseIcon = () => <Svg><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></Svg>

export const Back30Icon = () => (
    <Svg>
        <path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" />
        <text x="12" y="16.2" textAnchor="middle" fontSize="7.2" fontWeight="700" fill="currentColor">30</text>
    </Svg>
)

export const Forward30Icon = () => (
    <Svg>
        <path fill="currentColor" d="M12 5V1l5 5-5 5V7c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h2c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8z" />
        <text x="12" y="16.2" textAnchor="middle" fontSize="7.2" fontWeight="700" fill="currentColor">30</text>
    </Svg>
)

export const StarIcon = () => (
    <Svg><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></Svg>
)

export const LogoutIcon = () => (
    <Svg><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" /></Svg>
)
