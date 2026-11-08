import React, { useMemo } from 'react'
import { useRevealOnView } from '../hooks/useRevealOnView'

const EASE = {
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.58, 1)',
}

/**
 * Staggered word / character reveal driven by CSS transitions (see `.reveal-word` in index.css).
 *
 * Replaces the previous per-word Framer Motion components: the look and timing are the same
 * (opacity + small translateY, per-word delay), but the browser runs it on the compositor, there
 * is no per-word React/JS work, and no element keeps a GPU layer once the reveal has finished.
 *
 * @param animate  'visible' | 'hidden' to control it externally; omit to reveal on scroll-into-view
 */
const WordReveal = ({
  text,
  as: Component = 'span',
  className = '',
  delay = 0,
  stagger = 0.03,
  duration = 0.32,
  distance = 10,
  ease = 'smooth',
  mode = 'word',
  nowrap = false,
  animate,
  viewport,
  innerClassName = 'inline-block leading-normal',
  ...props
}) => {
  const controlled = animate === undefined ? undefined : (animate === 'visible' || animate === true)
  const [ref, visible] = useRevealOnView(controlled, viewport)
  const words = useMemo(() => String(text).split(' '), [text])

  let index = 0
  const piece = (content, key) => {
    const d = delay + stagger * index++
    return (
      <span
        key={key}
        className={`reveal-word ${innerClassName}`}
        style={{ '--rd': `${d}s`, '--rdur': `${duration}s`, '--ry': `${distance}px`, '--rease': EASE[ease] || ease }}
      >
        {content}
      </span>
    )
  }

  return (
    <Component ref={ref} className={`${className} ${visible ? 'reveal-on' : ''}`} {...props}>
      {words.map((word, w) => {
        const content = mode === 'char'
          ? Array.from(word).map((ch, c) => piece(ch, c))
          : piece(word, 'w')
        return (
          <React.Fragment key={w}>
            {nowrap ? <span className="inline-block whitespace-nowrap">{content}</span> : content}
            {w < words.length - 1 && ' '}
          </React.Fragment>
        )
      })}
    </Component>
  )
}

export default React.memo(WordReveal)
