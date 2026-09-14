import React, { useState, useEffect, useRef } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, X, ArrowLeft } from 'lucide-react'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * Custom Therapique Calendar DatePicker Component
 * Features:
 * - 3 clean non-overlapping view modes: 'days' | 'months' | 'years'
 * - Fast, smooth birth-year and month selection without popup collisions
 * - Full theme matching with solid opaque container
 */
const DateInput = ({
  value,
  onChange,
  onClear,
  placeholder = 'dd-mm-yyyy',
  className = '',
  disabled = false,
  min,
  max,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [viewMode, setViewMode] = useState('days') // 'days' | 'months' | 'years'
  const containerRef = useRef(null)
  const yearsListRef = useRef(null)

  // Parse current value or fallback to today
  const parseDate = (val) => {
    if (!val) return null
    const parts = String(val).split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m, d)
      }
    }
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }

  const selectedDate = parseDate(value)
  const today = new Date()

  const [viewYear, setViewYear] = useState(() => selectedDate ? selectedDate.getFullYear() : today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => selectedDate ? selectedDate.getMonth() : today.getMonth())

  // When value changes externally, update view
  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
    }
  }, [value])

  // Close on outside click and reset view mode
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setViewMode('days')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen])

  // Auto-scroll to selected year when entering 'years' view
  useEffect(() => {
    if (viewMode === 'years' && yearsListRef.current) {
      const activeBtn = yearsListRef.current.querySelector('[data-selected="true"]')
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [viewMode])

  // Format date as DD-MM-YYYY
  const formatDisplay = (val) => {
    if (!val) return ''
    const d = parseDate(val)
    if (!d) return val
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  }

  // Handle day selection
  const handleSelectDay = (day) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    const formattedIso = `${viewYear}-${monthStr}-${dayStr}`
    
    if (onChange) {
      onChange({ target: { value: formattedIso } })
    }
    setIsOpen(false)
    setViewMode('days')
  }

  // Navigation handlers
  const handlePrevMonth = (e) => {
    e.stopPropagation()
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = (e) => {
    e.stopPropagation()
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const handleSetToday = (e) => {
    e.stopPropagation()
    const now = new Date()
    const monthStr = String(now.getMonth() + 1).padStart(2, '0')
    const dayStr = String(now.getDate()).padStart(2, '0')
    const formattedIso = `${now.getFullYear()}-${monthStr}-${dayStr}`
    if (onChange) {
      onChange({ target: { value: formattedIso } })
    }
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setIsOpen(false)
    setViewMode('days')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    if (onClear) {
      onClear()
    } else if (onChange) {
      onChange({ target: { value: '' } })
    }
    setIsOpen(false)
    setViewMode('days')
  }

  // Calendar math
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay()
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

  // Generate Year Range (1920 to Current Year + 2)
  const currentYear = new Date().getFullYear()
  const yearsList = []
  for (let y = currentYear + 2; y >= 1920; y--) {
    yearsList.push(y)
  }

  const isSelected = (day) => {
    if (!selectedDate) return false
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    )
  }

  const isTodayDate = (day) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const isDateDisabled = (day) => {
    const d = new Date(viewYear, viewMonth, day)
    if (min) {
      const minDate = parseDate(min)
      if (minDate && d < minDate) return true
    }
    if (max) {
      const maxDate = parseDate(max)
      if (maxDate && d > maxDate) return true
    }
    return false
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Field */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen)
            setViewMode('days')
          }
        }}
        className={`h-10 px-3.5 bg-[#FAF5EE]/50 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-between gap-2 cursor-pointer shadow-2xs select-none hover:bg-white hover:border-gray-400 ${
          isOpen ? 'bg-white border-black' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 truncate">
          <CalendarIcon className="w-4 h-4 text-gray-700 shrink-0" />
          {value ? (
            <span className="font-semibold text-gray-900 tracking-wide truncate">
              {formatDisplay(value)}
            </span>
          ) : (
            <span className="text-gray-400 font-normal truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-[#F3E8DE] rounded-lg transition-colors cursor-pointer"
              title="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <CalendarIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'text-black' : ''}`} />
        </div>
      </div>

      {/* Custom Solid Floating Calendar Modal */}
      {isOpen && (
        <div className="absolute right-0 sm:right-auto left-0 sm:left-auto top-full mt-2 w-72 sm:w-80 bg-[#FAF5EE] border-2 border-[#EADBCE] rounded-3xl shadow-[0_15px_45px_rgba(0,0,0,0.18)] z-50 p-4 select-none animate-in fade-in-50 zoom-in-95 duration-150">
          
          {/* VIEW 1: DAYS VIEW */}
          {viewMode === 'days' && (
            <>
              {/* Header: Month / Year Buttons + Arrows */}
              <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-[#EADBCE]">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('months')}
                    className="px-2.5 py-1 bg-white hover:bg-black hover:text-white text-gray-900 font-bold text-xs rounded-xl border border-[#EADBCE] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    title="Change Month"
                  >
                    <span>{MONTHS[viewMonth]}</span>
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode('years')}
                    className="px-2.5 py-1 bg-white hover:bg-black hover:text-white text-gray-900 font-bold text-xs rounded-xl border border-[#EADBCE] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    title="Change Year"
                  >
                    <span>{viewYear}</span>
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="w-7 h-7 rounded-xl bg-white hover:bg-black hover:text-white text-gray-700 border border-[#EADBCE] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="w-7 h-7 rounded-xl bg-white hover:bg-black hover:text-white text-gray-700 border border-[#EADBCE] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                    title="Next Month"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Weekdays */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                {DAYS_SHORT.map((d, i) => (
                  <span
                    key={d}
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      i === 0 || i === 6 ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {Array.from({ length: firstDayIndex }).map((_, i) => {
                  const prevMonthDay = daysInPrevMonth - firstDayIndex + i + 1
                  return (
                    <div
                      key={`prev-${i}`}
                      className="h-8 flex items-center justify-center text-xs text-gray-300 font-medium select-none"
                    >
                      {prevMonthDay}
                    </div>
                  )
                })}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const selected = isSelected(day)
                  const isToday = isTodayDate(day)
                  const disabledDay = isDateDisabled(day)

                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      disabled={disabledDay}
                      onClick={() => handleSelectDay(day)}
                      className={`h-8 w-full rounded-xl text-xs font-semibold flex items-center justify-center transition-all cursor-pointer relative ${
                        selected
                          ? 'bg-black text-white font-bold shadow-xs scale-105'
                          : isToday
                          ? 'bg-white text-black font-extrabold border border-black/40 hover:bg-black hover:text-white'
                          : 'bg-white/60 text-gray-800 hover:bg-black hover:text-white hover:font-bold'
                      } ${disabledDay ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
                    >
                      <span>{day}</span>
                      {isToday && !selected && (
                        <span className="absolute bottom-1 w-1 h-1 bg-black rounded-full" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Quick Footer */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#EADBCE] text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-gray-500 hover:text-red-600 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-red-50"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={handleSetToday}
                  className="text-gray-900 font-bold hover:text-black transition-colors cursor-pointer py-1 px-2.5 rounded-lg bg-white border border-[#EADBCE] hover:bg-[#F3E8DE] shadow-2xs"
                >
                  Today
                </button>
              </div>
            </>
          )}

          {/* VIEW 2: MONTHS GRID VIEW */}
          {viewMode === 'months' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#EADBCE]">
                <button
                  type="button"
                  onClick={() => setViewMode('days')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-black transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Calendar</span>
                </button>
                <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Select Month</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                {MONTHS.map((m, idx) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx)
                      setViewMode('days')
                    }}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      viewMonth === idx
                        ? 'bg-black text-white border-black shadow-xs scale-105'
                        : 'bg-white text-gray-800 border-[#EADBCE] hover:bg-black hover:text-white'
                    }`}
                  >
                    {MONTHS_SHORT[idx]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 3: YEARS GRID VIEW (Scrollable without any overlap) */}
          {viewMode === 'years' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#EADBCE]">
                <button
                  type="button"
                  onClick={() => setViewMode('days')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-black transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Calendar</span>
                </button>
                <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Select Year</span>
              </div>

              {/* Scrollable grid container for 100+ years */}
              <div
                ref={yearsListRef}
                className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-1 py-1"
              >
                {yearsList.map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-selected={viewYear === y ? "true" : "false"}
                    onClick={() => {
                      setViewYear(y)
                      setViewMode('days')
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      viewYear === y
                        ? 'bg-black text-white border-black shadow-xs font-extrabold'
                        : 'bg-white text-gray-800 border-[#EADBCE] hover:bg-black hover:text-white'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default DateInput
