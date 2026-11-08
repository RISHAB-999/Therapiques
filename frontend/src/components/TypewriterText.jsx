import React from 'react'
import WordReveal from './WordReveal'

/**
 * Shared word/character reveal used by Hero, Achivements and NewsLetter.
 * Thin wrapper over <WordReveal> (CSS transitions — no per-word JS or GPU layers).
 *
 * @param inView  reveal when scrolled into view (default: reveal on mount)
 * @param mode    'word' | 'char'
 * @param nowrap  keep each word on one line (char mode)
 * @param wordStaggerFactor multiplier applied to `speed` in word mode
 */
const TypewriterText = ({
  text,
  className = '',
  delay = 0,
  speed = 0.035,
  mode = 'word',
  as = 'span',
  inView = false,
  viewport = { margin: '100px 0px', amount: 0 },
  duration = 0.18,
  nowrap = false,
  wordStaggerFactor = 1,
}) => (
  <WordReveal
    text={text}
    as={as}
    className={className}
    delay={delay}
    stagger={mode === 'char' ? speed : speed * wordStaggerFactor}
    duration={duration}
    distance={3}
    ease="easeOut"
    mode={mode}
    nowrap={nowrap}
    animate={inView ? undefined : 'visible'}
    viewport={viewport}
    innerClassName="inline-block"
  />
)

export default React.memo(TypewriterText)
