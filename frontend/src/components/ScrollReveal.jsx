import React, { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

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
 *    Performance: Uses only opacity + translateY (GPU composited), no filter:blur
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

  const words = content.split(' ')

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: wordDelay,
        delayChildren: delay,
      },
    },
  }

  const wordVariants = {
    hidden: {
      opacity: 0,
      y: 10,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.32,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  }

  return (
    <Component className={className} {...props}>
      <motion.span
        initial="hidden"
        animate={animate !== undefined ? animate : undefined}
        whileInView={animate === undefined ? "visible" : undefined}
        viewport={animate === undefined ? { once: true, amount: 0, margin: "200px 0px" } : undefined}
        variants={containerVariants}
        className="inline"
      >
        {words.map((word, idx) => (
          <React.Fragment key={idx}>
            <motion.span
              variants={wordVariants}
              className="inline-block leading-normal transform-gpu"
            >
              {word}
            </motion.span>
            {idx < words.length - 1 && ' '}
          </React.Fragment>
        ))}
      </motion.span>
    </Component>
  )
}

export const TypewriterParagraph = ({
  text,
  children,
  className = '',
  delay = 0,
  wordDelay = 0.025,
  as: Component = 'p',
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

  const words = content.split(' ')

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: wordDelay,
        delayChildren: delay,
      },
    },
  }

  const wordVariants = {
    hidden: {
      opacity: 0,
      y: 8,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  }

  return (
    <Component className={className} {...props}>
      <motion.span
        initial="hidden"
        animate={animate !== undefined ? animate : undefined}
        whileInView={animate === undefined ? "visible" : undefined}
        viewport={animate === undefined ? { once: true, amount: 0, margin: "200px 0px" } : undefined}
        variants={containerVariants}
        className="inline"
      >
        {words.map((word, idx) => (
          <React.Fragment key={idx}>
            <motion.span
              variants={wordVariants}
              className="inline-block leading-normal transform-gpu"
            >
              {word}
            </motion.span>
            {idx < words.length - 1 && ' '}
          </React.Fragment>
        ))}
      </motion.span>
    </Component>
  )
}

/**
 * ScrollDissolveContainer: Clean container
 */
export const ScrollDissolveContainer = ({ children, className = '', ...props }) => {
  return (
    <div className={`relative ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * 3. Image Reveal Mask with Entrance Animation & Gentle Floating
 *    Performance: Uses only opacity, scale, translateY (GPU composited)
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
  ...props
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={animate !== undefined ? (animate === "hidden" ? { opacity: 0, scale: 0.95, y: 20 } : { opacity: 1, scale: 1, y: 0 }) : undefined}
      whileInView={animate === undefined ? { opacity: 1, scale: 1, y: 0 } : undefined}
      viewport={animate === undefined ? { once: true, amount: 0, margin: "200px 0px" } : undefined}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden transform-gpu ${className}`}
      style={{ backfaceVisibility: 'hidden' }}
      {...props}
    >
      <div className="w-full h-full">
        {float ? (
          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="w-full h-full transform-gpu"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {src ? (
              <img src={src} alt={alt} className={imgClassName} loading="eager" />
            ) : (
              children
            )}
          </motion.div>
        ) : src ? (
          <img src={src} alt={alt} className={imgClassName} loading="lazy" />
        ) : (
          children
        )}
      </div>
    </motion.div>
  )
}

/**
 * 4. Fade-Up for Subtitles, Paragraphs & Standard Elements
 */
export const FadeUp = ({
  children,
  delay = 0,
  duration = 0.75,
  y = 20,
  className = '',
  animate,
  ...props
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={animate !== undefined ? (animate === "hidden" ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }) : undefined}
      whileInView={animate === undefined ? { opacity: 1, y: 0 } : undefined}
      viewport={animate === undefined ? { once: true, amount: 0, margin: "200px 0px" } : undefined}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`transform-gpu ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * 5. Stagger Container for Cards & Grids
 */
export const StaggerContainer = ({
  children,
  staggerDelay = 0.1,
  delayChildren = 0,
  className = '',
  animate,
  ...props
}) => {
  return (
    <motion.div
      initial="hidden"
      animate={animate !== undefined ? animate : undefined}
      whileInView={animate === undefined ? "visible" : undefined}
      viewport={animate === undefined ? { once: true, amount: 0, margin: "200px 0px" } : undefined}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * 6. Stagger Card Item with translateY(16px -> 0) & Smooth Natural Float
 */
export const StaggerItem = ({
  children,
  className = '',
  y = 16,
  duration = 0.75,
  ...props
}) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration, ease: [0.16, 1, 0.3, 1] },
        },
      }}
      className={`transform-gpu ${className}`}
      {...props}
    >
      {children}
    </motion.div>
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
      {/* Dual Curtain Wipe with Hardware-Accelerated 3D Transform */}
      <AnimatePresence mode="wait">
        {showCurtain && !prefersReducedMotion && (
          <div key={`curtains-container-${pathname}`} className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
            {/* Layer 1: Luxury Cream Accent Curtain */}
            <motion.div
              key={`curtain-accent-${pathname}`}
              initial={{ y: "100%" }}
              animate={{ y: "-100%" }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
              className="absolute inset-0 bg-[#F3E8DE] pointer-events-none transform-gpu will-change-transform"
              style={{ backfaceVisibility: 'hidden', transform: 'translate3d(0,0,0)' }}
            />

            {/* Layer 2: Rich Dark Espresso Main Curtain with Therapique Brand Logo */}
            <motion.div
              key={`curtain-main-${pathname}`}
              initial={{ y: "100%" }}
              animate={{ y: "-100%" }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.75, delay: 0.04, ease: [0.76, 0, 0.24, 1] }}
              className="absolute inset-0 bg-[#241E1A] pointer-events-none flex items-center justify-center shadow-2xl transform-gpu will-change-transform"
              style={{ backfaceVisibility: 'hidden', transform: 'translate3d(0,0,0)' }}
            >
              <div className="flex flex-col items-center gap-2 select-none">
                <span className="font-therapique text-3xl sm:text-4xl md:text-5xl font-bold text-[#FAF5EE] tracking-tight">
                  therapique
                </span>
                <div className="w-12 h-0.5 bg-[#8b65e2] rounded-full" />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
