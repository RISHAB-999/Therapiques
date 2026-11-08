import { useCallback, useEffect, useRef } from 'react'

/**
 * Pauses a Swiper's autoplay while the carousel is off-screen and resumes it when it
 * scrolls back into view. Off-screen carousels otherwise keep running slide transitions
 * (layout + paint every few seconds), which competes with scrolling on mobile.
 *
 * Usage: const onSwiper = useInViewAutoplay();  <Swiper onSwiper={onSwiper} autoplay={...} />
 */
export const useInViewAutoplay = () => {
  const observerRef = useRef(null)

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return useCallback((swiper) => {
    observerRef.current?.disconnect()
    if (!swiper?.el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      const autoplay = swiper.autoplay
      if (!autoplay || swiper.destroyed) return
      if (entry.isIntersecting) {
        if (!autoplay.running) autoplay.start()
      } else if (autoplay.running) {
        autoplay.stop()
      }
    }, { threshold: 0 })

    observer.observe(swiper.el)
    observerRef.current = observer
  }, [])
}

export default useInViewAutoplay
