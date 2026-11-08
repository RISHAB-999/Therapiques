import { useCallback, useState } from 'react'

const isSame = (a, b) => {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * useState for data that is refreshed by polling. If a refresh returns data that is
 * structurally identical to what is already shown, the previous object is kept and
 * React skips the re-render — so polling no longer re-renders whole lists every few
 * seconds (which caused periodic stutter, especially while scrolling on phones).
 */
export const useStableState = (initial) => {
  const [state, setState] = useState(initial)
  const setStable = useCallback((next) => {
    setState(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      return isSame(prev, value) ? prev : value
    })
  }, [])
  return [state, setStable]
}

export default useStableState
