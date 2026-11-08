import { useEffect, useRef } from 'react'

/**
 * Drives an infinite CSS marquee (see `.marquee-y` in index.css) at a constant speed.
 * The track must contain its items twice; the animation moves it by exactly half its height.
 *
 * - Runs as a compositor transform animation: no per-frame JS, no scroll events, no layout.
 * - Duration is derived from the measured track height so speed stays constant on any screen.
 * - Paused while the marquee is off-screen.
 *
 * @param {number} pxPerSecond  scroll speed (30 px/s ≈ the old 0.5px-per-frame loop at 60 fps)
 */
export const useMarquee = (pxPerSecond = 30) => {
  const viewportRef = useRef(null)
  const trackRef = useRef(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    const setDuration = () => {
      const half = track.scrollHeight / 2
      if (half > 0) track.style.setProperty('--marquee-duration', `${(half / pxPerSecond).toFixed(2)}s`)
    }
    setDuration()

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setDuration) : null
    resizeObserver?.observe(track)

    const visibilityObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        track.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused'
      })
      : null
    visibilityObserver?.observe(viewport)

    return () => {
      resizeObserver?.disconnect()
      visibilityObserver?.disconnect()
    }
  }, [pxPerSecond])

  return { viewportRef, trackRef }
}

export default useMarquee
