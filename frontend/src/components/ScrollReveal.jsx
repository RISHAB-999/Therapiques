import React, { useRef, useEffect, useState, useMemo, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import WordReveal from './WordReveal'
import { useRevealOnView } from '../hooks/useRevealOnView'

/**
 * 1. ScrollFadeInOut: Clean wrapper without scroll dissolve/exit
 */
export const ScrollFadeInOut = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`relative ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * 2. Word-by-Word Split Text Line Reveal (Animates once on entrance)
 *    Performance: CSS transitions via <WordReveal> — no per-word JS, no lingering GPU layers.
 */
export const SplitTextReveal = ({
  text,
  children,
  className = '',
  delay = 0,
  wordDelay = 0.03,
  as: Component = 'span',
  animate,
  ...props
}) => {
  const content = text || (typeof children === 'string' ? children : '')

  if (!content) {
    return (
      <Component className={className} {...props}>
        {children}
      </Component>
    )
  }

  return (
    <WordReveal text={content} as={Component} className={className} delay={delay} stagger={wordDelay}
      duration={0.32} distance={10} animate={animate} {...props} />
  )
}

export const TypewriterParagraph = ({
  text,
  children,
  className = '',
  delay = 0,
  wordDelay = 0.025,
  as: Component = 'p',
  // eslint-disable-next-line no-unused-vars
  once = true,
  animate,
  ...props
}) => {
  const content = text || (typeof children === 'string' ? children : '')

  if (!content) {
    return (
      <Component className={className} {...props}>
        {children}
      </Component>
    )
  }

  return (
    <WordReveal text={content} as={Component} className={className} delay={delay} stagger={wordDelay}
      duration={0.3} distance={8} animate={animate} {...props} />
  )
}

/**
 * Shared CSS reveal block (opacity + translate/scale) — see `.reveal-block` in index.css.
 * Runs as a compositor transition instead of a per-frame JS animation, so scrolling
 * into new sections no longer forces style recalculation on every frame.
 */
const EASE_SOFT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const EASE_SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)'

const revealVars = ({ delay = 0, duration, ease, y = 0, scale = 1 }) => ({
  '--rd': `${delay}s`, '--rdur': `${duration}s`, '--rease': ease, '--ry': `${y}px`, '--rs': scale,
})

const toControlled = (animate) => (animate === undefined ? undefined : animate !== 'hidden' && animate !== false)

/**
 * 3. Image Reveal Mask with Entrance Animation & Gentle Floating
 */
export const ImageRevealMask = ({
  children,
  src,
  alt = '',
  imgClassName = '',
  className = '',
  float = false,
  delay = 0.25,
  animate,
  style,
  ...props
}) => {
  const [ref, visible] = useRevealOnView(toControlled(animate))
  return (
    <div
      ref={ref}
      className={`reveal-block overflow-hidden ${visible ? 'reveal-on' : ''} ${className}`}
      style={{ ...revealVars({ delay, duration: 0.6, ease: EASE_SMOOTH, y: 20, scale: 0.95 }), ...style }}
      {...props}
    >
      {/* Gentle infinite float is a CSS keyframe animation (runs on the compositor, zero JS per frame) */}
      <div className="w-full h-full">
        {float ? (
          <div className="w-full h-full animate-gentle-float">
            {src ? (
              <img src={src} alt={alt} className={imgClassName} loading="eager" />
            ) : (
              children
            )}
          </div>
        ) : src ? (
          <img src={src} alt={alt} className={imgClassName} loading="lazy" />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/**
 * 4. Fade-Up for Subtitles, Paragraphs & Standard Elements
 */
export const FadeUp = ({
  children,
  delay = 0,
  duration = 0.75,
  // eslint-disable-next-line no-unused-vars
  y = 20, // kept for API compatibility; the entrance offset has always been 16px
  className = '',
  animate,
  style,
  ...props
}) => {
  const [ref, visible] = useRevealOnView(toControlled(animate))
  return (
    <div
      ref={ref}
      className={`reveal-block ${visible ? 'reveal-on' : ''} ${className}`}
      style={{ ...revealVars({ delay, duration, ease: EASE_SOFT, y: 16 }), ...style }}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * 5. Stagger Container for Cards & Grids
 *    Each direct child receives its position so StaggerItem can compute its own delay.
 */
const StaggerContext = createContext(null)
const StaggerIndex = createContext(0)

export const StaggerContainer = ({
  children,
  staggerDelay = 0.1,
  delayChildren = 0,
  className = '',
  animate,
  // eslint-disable-next-line no-unused-vars
  as, // previously ignored by motion.div; the element stays a <div>
  style,
  ...props
}) => {
  const [ref, visible] = useRevealOnView(toControlled(animate))
  const ctx = useMemo(() => ({ visible, staggerDelay, delayChildren }), [visible, staggerDelay, delayChildren])
  let i = 0
  return (
    <StaggerContext.Provider value={ctx}>
      <div
        ref={ref}
        className={`reveal-block ${visible ? 'reveal-on' : ''} ${className}`}
        style={{ ...revealVars({ duration: 0.3, ease: 'ease-out' }), ...style }}
        {...props}
      >
        {React.Children.map(children, (child) => (
          <StaggerIndex.Provider value={i++}>{child}</StaggerIndex.Provider>
        ))}
      </div>
    </StaggerContext.Provider>
  )
}

/**
 * 6. Stagger Card Item with translateY(16px -> 0)
 */
export const StaggerItem = ({
  children,
  className = '',
  // eslint-disable-next-line no-unused-vars
  y = 16, // kept for API compatibility; the entrance offset has always been 16px
  duration = 0.75,
  // eslint-disable-next-line no-unused-vars
  as,
  style,
  ...props
}) => {
  const ctx = useContext(StaggerContext)
  const index = useContext(StaggerIndex)
  // Outside a container there is nothing to orchestrate it, so it simply renders visible.
  const visible = ctx ? ctx.visible : true
  const delay = ctx ? ctx.delayChildren + index * ctx.staggerDelay : 0
  return (
    <div
      className={`reveal-block ${visible ? 'reveal-on' : ''} ${className}`}
      style={{ ...revealVars({ delay, duration, ease: EASE_SOFT, y: 16 }), ...style }}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * 7. Button with Micro Scale & Tactile Press
 */
export const ButtonPop = ({
  children,
  onClick,
  className = '',
  delay = 0,
  ...props
}) => {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0, margin: "200px 0px" }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      className={`transform-gpu ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/**
 * 8. Luxury Barba.js Style Curtain Wipe Page Transition
 *    Performance: GPU-accelerated translate3d, strict timer cleanup, and reduced-motion support.
 */
export const PageTransition = ({ children, pathname = '', className = '' }) => {
  const prevPathRef = useRef(pathname)
  const isHomePage = pathname === '/' || pathname === ''
  const [showCurtain, setShowCurtain] = useState(() => !isHomePage)
  const timerRef = useRef(null)

  // Respect OS reduced motion settings
  const prefersReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowCurtain(false)
      return
    }

    // Auto-dismiss initial curtain on direct URL refresh
    if (showCurtain) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setShowCurtain(false)
        timerRef.current = null
      }, 850)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prefersReducedMotion) {
      prevPathRef.current = pathname
      setShowCurtain(false)
      return
    }

    // Trigger curtain when navigating between different routes
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      setShowCurtain(true)

      timerRef.current = setTimeout(() => {
        setShowCurtain(false)
        timerRef.current = null
      }, 850)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [pathname, prefersReducedMotion])

  return (
    <div className={`relative ${className}`}>
      {/* Dual Curtain Wipe with Pure Hardware-Accelerated CSS (Compositor Thread) */}
      {showCurtain && !prefersReducedMotion && (
        <div key={`curtains-container-${pathname}`} className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          {/* Layer 1: Luxury Cream Accent Curtain */}
          <div
            className="absolute inset-0 bg-[#F3E8DE] pointer-events-none curtain-accent-anim"
          />

          {/* Layer 2: Rich Dark Espresso Main Curtain with Therapique Brand Logo */}
          <div
            className="absolute inset-0 bg-[#241E1A] pointer-events-none flex items-center justify-center shadow-2xl curtain-main-anim"
          >
            <div className="flex flex-col items-center gap-2 select-none">
              <span className="font-therapique text-3xl sm:text-4xl md:text-5xl font-bold text-[#FAF5EE] tracking-tight">
                therapique
              </span>
              <div className="w-12 h-0.5 bg-[#8b65e2] rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Page Content */}
      {children}
    </div>
  )
}

export default {
  ScrollFadeInOut,
  SplitTextReveal,
  ImageRevealMask,
  FadeUp,
  StaggerContainer,
  StaggerItem,
  ButtonPop,
  PageTransition,
}
