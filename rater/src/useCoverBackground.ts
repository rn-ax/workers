import { useEffect } from 'react'

// Paints the album cover on the root element rather than on a fixed child. The root's background fills the
// whole canvas, including the area under iOS Safari's translucent top and bottom bars, which a fixed element
// stops short of (leaving the root's plain colour showing there). The next cover is preloaded first, so
// changing track never flashes an empty background.
export const useCoverBackground = (image: string | undefined) => {
    useEffect(() => {
        const root = document.documentElement
        if (!image) {
            root.classList.remove('has-cover')
            return
        }
        let cancelled = false
        const preload = new Image()
        preload.onload = () => {
            if (cancelled) return
            root.style.setProperty('--cover', `url("${image}")`)
            root.classList.add('has-cover')
        }
        preload.src = image
        return () => { cancelled = true }
    }, [image])

    useEffect(() => () => document.documentElement.classList.remove('has-cover'), [])
}
