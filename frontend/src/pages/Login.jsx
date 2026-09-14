import React, { useContext, useEffect, useState } from 'react'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, X, Lock, ArrowRight, ShieldCheck } from 'lucide-react'
import doctorIcon from '../assets/doctor-svgrepo-com.svg'
import bookIcon from '../assets/book-svgrepo-com.svg'
import cartIcon from '../assets/cart-svgrepo-com.svg'
import orderIcon from '../assets/order-svgrepo-com.svg'
import coinIcon from '../assets/coin-svgrepo-com.svg'
import profileIcon from '../assets/profile-svgrepo-com.svg'

const Login = () => {
  const [state, setState] = useState('Sign Up')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotStep, setForgotStep] = useState(1) // 1 = enter email, 2 = enter OTP + new password
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotShowPass, setForgotShowPass] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const redirectTitle = location.state?.title
  const redirectMessage = location.state?.message
  const redirectContext = location.state?.context
  const { backendUrl, token, setToken, userData } = useContext(AppContext)

  const getContextConfig = () => {
    const ctx = (redirectContext || '').toLowerCase()
    const msg = (redirectMessage || '').toLowerCase()
    const ttl = (redirectTitle || '').toLowerCase()

    if (ctx === 'doctor' || msg.includes('doctor') || msg.includes('appointment')) {
      return {
        icon: doctorIcon,
        title: redirectTitle || 'Doctor Consultation',
        alt: 'Doctor'
      }
    }
    if (ctx === 'consultations' || msg.includes('consultation')) {
      return {
        icon: doctorIcon,
        title: redirectTitle || 'My Consultations',
        alt: 'Consultations'
      }
    }
    if (ctx === 'cart' || msg.includes('cart') || ttl.includes('cart')) {
      return {
        icon: cartIcon,
        title: redirectTitle || 'Shopping Cart',
        alt: 'Cart'
      }
    }
    if (ctx === 'orders' || msg.includes('order') || msg.includes('track') || ttl.includes('order')) {
      return {
        icon: orderIcon,
        title: redirectTitle || 'Order Tracking',
        alt: 'Orders'
      }
    }
    if (ctx === 'coins' || msg.includes('coin') || msg.includes('token') || msg.includes('wallet') || ttl.includes('token')) {
      return {
        icon: coinIcon,
        title: redirectTitle || 'Token Wallet & Shop',
        alt: 'Token Wallet'
      }
    }
    if (ctx === 'profile' || msg.includes('profile') || ttl.includes('profile')) {
      return {
        icon: profileIcon,
        title: redirectTitle || 'User Profile',
        alt: 'Profile'
      }
    }
    if (ctx === 'videocall' || msg.includes('video') || ttl.includes('video')) {
      return {
        icon: doctorIcon,
        title: redirectTitle || 'Video Consultation',
        alt: 'Video Consultation'
      }
    }
    if (ctx === 'checkout' || msg.includes('delivery') || msg.includes('address')) {
      return {
        icon: cartIcon,
        title: redirectTitle || 'Delivery & Checkout',
        alt: 'Checkout'
      }
    }
    return {
      icon: bookIcon,
      title: redirectTitle || 'Therapique Bookstore',
      alt: 'Bookstore'
    }
  }

  const contextConfig = getContextConfig()

  const handleSendForgotOtp = async (e) => {
    e.preventDefault()
    if (!forgotEmail.trim()) {
      return toast.error('Please enter your email address')
    }
    try {
      setForgotLoading(true)
      const { data } = await axios.post(`${backendUrl}/api/user/forgot-password`, {
        email: forgotEmail.trim().toLowerCase()
      })
      if (data.success) {
        toast.success(data.message || '6-digit reset code sent to your email!')
        setForgotStep(2)
      } else {
        toast.error(data.message)
      }
    } catch (err) {
      console.error('Forgot password error:', err)
      toast.error(err.response?.data?.message || err.message || 'Failed to send reset code')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    if (!forgotOtp || forgotOtp.trim().length !== 6) {
      return toast.error('Please enter the 6-digit reset code')
    }
    if (!forgotNewPassword || forgotNewPassword.length < 8) {
      return toast.error('New password must be at least 8 characters long')
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      return toast.error('Passwords do not match')
    }

    try {
      setForgotLoading(true)
      const { data } = await axios.post(`${backendUrl}/api/user/reset-password`, {
        email: forgotEmail.trim().toLowerCase(),
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword
      })

      if (data.success) {
        toast.success(data.message || 'Password reset successfully! Please log in.')
        setShowForgotModal(false)
        setForgotStep(1)
        setForgotOtp('')
        setForgotNewPassword('')
        setForgotConfirmPassword('')
        setState('Login')
        setEmail(forgotEmail.trim().toLowerCase())
        setPassword('')
      } else {
        toast.error(data.message)
      }
    } catch (err) {
      console.error('Reset password error:', err)
      toast.error(err.response?.data?.message || err.message || 'Failed to reset password')
    } finally {
      setForgotLoading(false)
    }
  }

  const onSubmitHandler = async (event) => {
    event.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()

    if (state === 'Sign Up') {
      const { data } = await axios.post(backendUrl + '/api/user/register', { name: cleanName, email: cleanEmail, password })

      if (data.success) {
        localStorage.setItem('token', data.token)
        setToken(data.token)
        toast.success('Account created! Please verify your email with the 6-digit code.')
        navigate('/verify-email', { replace: true })
      } else {
        toast.error(data.message)
      }
    } else {
      const { data } = await axios.post(backendUrl + '/api/user/login', { email: cleanEmail, password })

      if (data.success) {
        localStorage.setItem('token', data.token)
        setToken(data.token)
        if (data.userData?.emailVerified === false) {
          navigate('/verify-email', { replace: true })
        } else if (data.userData?.profileCompleted === false) {
          navigate('/complete-profile', { replace: true })
        } else {
          const fromPath = location.state?.from?.pathname || '/'
          navigate(fromPath, { replace: true })
        }
      } else {
        toast.error(data.message)
      }
    }
  }

  useEffect(() => {
    if (token && userData) {
      if (userData.emailVerified === false) {
        navigate('/verify-email', { replace: true })
      } else if (userData.profileCompleted === false) {
        navigate('/complete-profile', { replace: true })
      } else {
        const fromPath = location.state?.from?.pathname || '/'
        navigate(fromPath, { replace: true })
      }
    }
  }, [token, userData])

  return (
    <>
      <div className="min-h-[90vh] flex flex-col items-center justify-center px-4 py-8">
        <form
          onSubmit={onSubmitHandler}
          autoComplete="off"
          className="bg-white shadow-[0_10px_35px_rgba(0,0,0,0.06)] rounded-3xl p-8 w-full max-w-md flex flex-col gap-5 border border-[#EADBCE]/60"
        >
          {/* Contextual Notice Banner */}
          {redirectMessage && (
            <div className="bg-[#FAF5EE] border border-[#EADBCE] rounded-2xl p-3.5 flex items-center gap-3.5 text-left shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-[#EADBCE] shadow-2xs p-2">
                <img 
                  src={contextConfig.icon} 
                  alt={contextConfig.alt} 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 leading-tight">
                  {contextConfig.title}
                </p>
                <p className="text-[11px] text-gray-600 font-medium mt-0.5 leading-snug">
                  {redirectMessage}
                </p>
              </div>
            </div>
          )}

          {/* Heading */}
          <div className="text-center">
            <h2 className="font-therapique text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {state === 'Sign Up' ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 font-medium">
              {state === 'Sign Up'
                ? 'Please sign up to access your personal dashboard and resources'
                : 'Please login to continue'}
            </p>
          </div>

          {/* Inputs */}
          {state === 'Sign Up' && (
            <div className="w-full">
              <label className="text-xs sm:text-sm font-semibold text-gray-700">Full Name</label>
              <input
                onChange={(e) => setName(e.target.value)}
                value={name}
                type="text"
                required
                placeholder="Enter your full name"
                className="mt-1.5 w-full px-4 py-2.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
              />
            </div>
          )}

          <div className="w-full">
            <label className="text-xs sm:text-sm font-semibold text-gray-700">Email</label>
            <input
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              type="email"
              required
              placeholder="Enter your email"
              className="mt-1.5 w-full px-4 py-2.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
            />
          </div>

          <div className="w-full">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-gray-700">Password</label>
              {state === 'Login' && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email || '')
                    setForgotStep(1)
                    setShowForgotModal(true)
                  }}
                  className="text-xs font-semibold text-gray-600 hover:text-black hover:underline cursor-pointer transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative flex items-center mt-1.5">
              <input
                onChange={(e) => setPassword(e.target.value)}
                value={password}
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                className="w-full pl-4 pr-11 py-2.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-gray-400 hover:text-gray-800 transition-colors cursor-pointer rounded-lg hover:bg-gray-100/60 flex items-center justify-center"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <Eye className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-gray-800" />
                ) : (
                  <EyeOff className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Button */}
          <button
            type="submit"
            className="bg-black text-white font-bold text-sm px-6 py-3 rounded-full shadow-sm hover:bg-gray-800 active:scale-98 transition-all cursor-pointer mt-1"
          >
            {state === 'Sign Up' ? 'Create Account' : 'Login'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-0.5">
            <div className="flex-grow h-px bg-[#EADBCE]"></div>
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">or</span>
            <div className="flex-grow h-px bg-[#EADBCE]"></div>
          </div>

          {/* Toggle */}
          <p className="text-center text-xs sm:text-sm text-gray-600 font-medium">
            {state === 'Sign Up' ? (
              <>
                Already have an account?{' '}
                <span
                  onClick={() => {
                    setState('Login')
                    setEmail('')
                    setPassword('')
                    setName('')
                    setShowPassword(false)
                  }}
                  className="text-gray-900 font-bold hover:underline cursor-pointer ml-1"
                >
                  Login
                </span>
              </>
            ) : (
              <>
                Don’t have an account?{' '}
                <span
                  onClick={() => {
                    setState('Sign Up')
                    setEmail('')
                    setPassword('')
                    setName('')
                    setShowPassword(false)
                  }}
                  className="text-gray-900 font-bold hover:underline cursor-pointer ml-1"
                >
                  Sign Up
                </span>
              </>
            )}
          </p>
        </form>

        <span className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mt-8">
          <p>Copyright @Therapique 2026 | </p>
          <Link to="/privacy-terms" className="underline ml-1 text-gray-700 hover:text-black transition-colors">
            Privacy Policy
          </Link>
        </span>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white border border-[#EADBCE] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#EADBCE]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#FAF5EE] border border-[#EADBCE] flex items-center justify-center text-black">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">Reset Password</h3>
                  <p className="text-[11px] text-gray-500">
                    {forgotStep === 1 ? 'Step 1: Get verification code' : 'Step 2: Enter code & new password'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false)
                  setForgotStep(1)
                  setForgotOtp('')
                  setForgotNewPassword('')
                  setForgotConfirmPassword('')
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-[#FAF5EE] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotStep === 1 ? (
              <form onSubmit={handleSendForgotOtp} className="space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Enter the email address associated with your account and we’ll send you a 6-digit code to reset your password.
                </p>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="w-full h-10 px-3.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-[#FAF5EE] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-2"
                  >
                    {forgotLoading ? 'Sending Code...' : (
                      <>
                        <span>Send Reset Code</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div className="bg-[#FAF5EE] border border-[#EADBCE] rounded-2xl p-3 flex items-center gap-2.5 text-xs text-gray-700">
                  <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                  <span>Code sent to <b>{forgotEmail}</b></span>
                </div>

                {/* 6-Digit OTP */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    6-Digit Reset Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 123456"
                    className="w-full h-10 px-3.5 text-center tracking-widest font-mono text-base font-bold bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                  />
                </div>

                {/* New Password */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    New Password <span className="text-red-500">*</span> (min 8 characters)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={forgotShowPass ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full h-10 px-3.5 pr-10 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setForgotShowPass(!forgotShowPass)}
                      className="absolute right-3 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      {forgotShowPass ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={forgotShowPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full h-10 px-3.5 bg-[#FAF5EE]/40 border border-[#EADBCE] rounded-xl text-xs sm:text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-900 hover:underline cursor-pointer"
                  >
                    ← Change Email
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-2"
                  >
                    {forgotLoading ? 'Resetting...' : 'Reset & Save Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Login
