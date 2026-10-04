// The album cover as the page background, dimmed so the controls stay readable.
export function Backdrop({ image }: { image: string | undefined }) {
    if (!image) return null
    return (
        <div className="backdrop" aria-hidden="true">
            <img key={image} src={image} alt="" />
            <div className="backdrop-dim" />
        </div>
    )
}
