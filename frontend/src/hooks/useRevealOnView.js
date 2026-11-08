import { useEffect, useRef, useState } from 'react'

/**
 * Reports when an element first scrolls into view (or uses a controlled value).
 * One IntersectionObserver per element, disconnected after the first reveal, so it
 * costs nothing while scrolling afterwards.
 *
 * @param {boolean|undefined} controlled  when defined, this value wins (e.g. hero waits for the splash)
 * @param {{ margin?: string, amount?: number }} options
 */
export const useRevealOnView = (controlled, { margin = '200px 0px', amount = 0 } = {}) => {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  // A transition only runs if the hidden state was painted first, so a controlled
  // "visible" on mount is applied after the first frame.
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    let id2
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setArmed(true)) })
    return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2) }
  }, [])

  useEffect(() => {
    if (controlled !== undefined || inView) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setInView(true)
        observer.disconnect()
      }
    }, { rootMargin: margin, threshold: amount })
    observer.observe(el)
    return () => observer.disconnect()
  }, [controlled, inView, margin, amount])

  return [ref, controlled !== undefined ? (controlled && armed) : inView]
}

export default useRevealOnView
