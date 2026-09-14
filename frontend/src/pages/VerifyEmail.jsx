import React, { useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Mail, ShieldCheck, ArrowRight, RotateCw, LogOut } from 'lucide-react'

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || ''
  const [user, domain] = email.split('@')
  if (user.length <= 2) return `${user[0] || '*'}***@${domain}`
  return `${user.slice(0, 2)}***@${domain}`
}

const VerifyEmail = () => {
  const navigate = useNavigate()
  const { backendUrl, token, setToken, userData, setUserData, loadUserProfileData } = useContext(AppContext)

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(60)
  const inputRefs = useRef([])

  // Auto-focus first input box on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  // 60-second live cooldown timer for resend code
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Routing checks: if not logged in or already verified
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    if (userData && userData.emailVerified === true) {
      if (userData.profileCompleted === false) {
        navigate('/complete-profile', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }
  }, [token, userData, navigate])

  const handleInputChange = (index, value) => {
    // Only accept numeric digits
    const cleanDigit = value.replace(/\D/g, '')

    if (!cleanDigit) {
      const newOtp = [...otp]
      newOtp[index] = ''
      setOtp(newOtp)
      return
    }

    const digit = cleanDigit.slice(-1)
    const newOtp = [...otp]
    newOtp[index] = digit
    setOtp(newOtp)

    // Auto-advance to the next input box
    if (digit && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0 && inputRefs.current[index - 1]) {
        inputRefs.current[index - 1].focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus()
    } else if (e.key === 'ArrowRight' && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pastedData) return

    const newOtp = ['', '', '', '', '', '']
    pastedData.split('').forEach((char, idx) => {
      if (idx < 6) newOtp[idx] = char
    })
    setOtp(newOtp)

    // Focus last filled box or next empty box
    const nextIndex = Math.min(pastedData.length, 5)
    if (inputRefs.current[nextIndex]) {
      inputRefs.current[nextIndex].focus()
    }
  }

  const handleVerify = async (e) => {
    if (e) e.preventDefault()
    const fullOtp = otp.join('')

    if (fullOtp.length !== 6) {
      toast.error('Please enter the full 6-digit verification code')
      return
    }

    try {
      setLoading(true)
      const { data } = await axios.post(
        `${backendUrl}/api/user/verify-otp`,
        { otp: fullOtp },
        { headers: { token } }
      )

      if (data.success) {
        toast.success(data.message || 'Email verified successfully!')
        if (data.userData) {
          setUserData(data.userData)
        }
        await loadUserProfileData()
        navigate('/complete-profile', { replace: true })
      } else {
        toast.error(data.message || 'Verification failed')
      }
    } catch (error) {
      console.error('OTP verification error:', error)
      toast.error(error.response?.data?.message || error.message || 'Failed to verify code')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || resending) return

    try {
      setResending(true)
      const { data } = await axios.post(
        `${backendUrl}/api/user/resend-otp`,
        {},
        { headers: { token } }
      )

      if (data.success) {
        toast.success(data.message || 'A new verification code has been sent!')
        setCooldown(60)
        setOtp(['', '', '', '', '', ''])
        if (inputRefs.current[0]) inputRefs.current[0].focus()
      } else {
        toast.error(data.message || 'Failed to resend code')
      }
    } catch (error) {
      console.error('Resend OTP error:', error)
      toast.error(error.response?.data?.message || error.message || 'Failed to resend code')
    } finally {
      setResending(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setUserData(false)
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#EADBCE]/70 shadow-[0_10px_35px_rgba(0,0,0,0.06)] p-6 sm:p-9 transition-all">
        
        {/* Header Icon */}
        <div className="flex items-center justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF5EE] border border-[#EADBCE] flex items-center justify-center shadow-xs text-gray-900">
            <Mail className="w-7 h-7 text-gray-900" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="text-center mb-6">
          <h2 className="font-therapique text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Verify your email
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-2 font-medium leading-relaxed">
            We've sent a 6-digit verification code to your email
          </p>

          {/* Masked Email Badge */}
          {userData?.email && (
            <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 bg-[#FAF5EE] border border-[#EADBCE] rounded-full text-xs font-bold text-purple-800 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
              <span>{maskEmail(userData.email)}</span>
            </div>
          )}
        </div>

        {/* OTP Input Form */}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex items-center justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`w-12 h-14 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-semibold rounded-xl border transition-all duration-200 outline-none ${
                  digit
                    ? 'bg-white border-gray-900 text-gray-900 shadow-sm'
                    : 'bg-[#FAF5EE]/40 border-[#DDD0C4] text-gray-900 focus:bg-white focus:border-gray-900 focus:shadow-sm'
                }`}
                aria-label={`OTP Digit ${index + 1}`}
              />
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || otp.join('').length !== 6}
            className="w-full bg-black text-white font-bold text-sm py-3.5 px-6 rounded-full shadow-sm hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <span>Verify Email</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Resend Code Section */}
        <div className="text-center mt-6 pt-5 border-t border-[#EADBCE]/60">
          <p className="text-xs text-gray-500 font-medium mb-1.5">
            Didn't receive the code?
          </p>
          {cooldown > 0 ? (
            <span className="text-xs font-bold text-gray-400 select-none">
              Resend code in {cooldown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-xs font-bold text-purple-700 hover:text-purple-900 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              <span>Resend Code</span>
            </button>
          )}
        </div>

        {/* Switch Account / Logout */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Wrong email? Log out</span>
          </button>
        </div>

      </div>
    </div>
  )
}

export default VerifyEmail
