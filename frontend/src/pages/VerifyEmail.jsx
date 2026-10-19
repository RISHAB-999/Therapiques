import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Mail, ShieldCheck, RotateCw, LogOut, ArrowRight } from 'lucide-react';
import './VerifyEmail.css';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0] || '*'}***@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
};

const VerifyEmail = () => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { backendUrl, token, setToken, userData, setUserData, loadUserProfileData } = useContext(AppContext);

  // 6-digit OTP code state
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [showVerifiedText, setShowVerifiedText] = useState(false);
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  // Prevents route guard from prematurely redirecting during the animation
  const isAnimatingRef = useRef(false);

  // Auto-focus first input on mount or when returning to idle
  useEffect(() => {
    if (status === 'idle' && inputRefs[0].current) {
      inputRefs[0].current.focus();
      setActiveBoxIndex(0);
    }
  }, [status]);

  // 60-second live cooldown timer for resend code
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Routing checks: ONLY redirect if user arrives already verified BEFORE entering OTP
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    if (userData && userData.emailVerified === true && status === 'idle' && !isAnimatingRef.current) {
      if (userData.profileCompleted === false) {
        navigate('/complete-profile', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [token, userData, status, navigate]);

  // Execute real backend verification with complete animation lifecycle
  const handleVerifyOtp = useCallback(async (codeToVerify) => {
    const fullOtp = typeof codeToVerify === 'string' ? codeToVerify : otp.join('');
    if (fullOtp.length !== 6 || status !== 'idle' || isAnimatingRef.current) return;

    // Lock animation flag so route guards don't interrupt
    isAnimatingRef.current = true;

    // Blur all input fields
    inputRefs.forEach((ref) => {
      if (ref.current) ref.current.blur();
    });

    try {
      // 1. Send API verification request in background
      const { data } = await axios.post(
        `${backendUrl}/api/user/verify-otp`,
        { otp: fullOtp },
        { headers: { token } }
      );

      if (data.success) {
        // 2. Trigger full success animation:
        //    Boxes slide (left to middle, right to middle), collide, pop, checkmark draws!
        setStatus('success');

        // Crossfade text to "Verified successfully" after collision settles
        setTimeout(() => {
          setShowVerifiedText(true);
          toast.success(data.message || 'Email verified successfully!');
        }, 1600);

        // 3. ONLY redirect after the entire animation has fully completed and settled
        setTimeout(async () => {
          if (data.userData) {
            setUserData(data.userData);
          }
          await loadUserProfileData();
          isAnimatingRef.current = false;
          navigate(data.userData?.profileCompleted === false ? '/complete-profile' : '/', { replace: true });
        }, 3600);
      } else {
        // Verification failed -> trigger Error Shake
        setStatus('error');
        toast.error(data.message || 'Invalid verification code');

        // Restore boxes to idle after error shake
        setTimeout(() => {
          setOtp(['', '', '', '', '', '']);
          setStatus('idle');
          setActiveBoxIndex(0);
          setShowVerifiedText(false);
          isAnimatingRef.current = false;
          if (inputRefs[0].current) inputRefs[0].current.focus();
        }, 850);
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      setStatus('error');
      toast.error(error.response?.data?.message || error.message || 'Failed to verify code');

      setTimeout(() => {
        setOtp(['', '', '', '', '', '']);
        setStatus('idle');
        setActiveBoxIndex(0);
        setShowVerifiedText(false);
        isAnimatingRef.current = false;
        if (inputRefs[0].current) inputRefs[0].current.focus();
      }, 850);
    }
  }, [backendUrl, token, otp, status, setUserData, loadUserProfileData, navigate]);

  // Input change handler
  const handleChange = (index, e) => {
    if (status !== 'idle' || isAnimatingRef.current) return;
    const value = e.target.value;
    if (isNaN(value)) return;

    const newOtp = [...otp];
    const digit = value.substring(value.length - 1);
    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < 5 && inputRefs[index + 1].current) {
      inputRefs[index + 1].current.focus();
      setActiveBoxIndex(index + 1);
    }

    // Auto-trigger verification when all 6 digits are entered
    const completeCode = newOtp.join('');
    if (completeCode.length === 6 && !newOtp.includes('')) {
      handleVerifyOtp(completeCode);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (index, e) => {
    if (status !== 'idle' || isAnimatingRef.current) return;
    if (e.key === 'Backspace' && !otp[index] && index > 0 && inputRefs[index - 1].current) {
      inputRefs[index - 1].current.focus();
      setActiveBoxIndex(index - 1);
    } else if (e.key === 'ArrowLeft' && index > 0 && inputRefs[index - 1].current) {
      inputRefs[index - 1].current.focus();
      setActiveBoxIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5 && inputRefs[index + 1].current) {
      inputRefs[index + 1].current.focus();
      setActiveBoxIndex(index + 1);
    }
  };

  // Clipboard paste handler
  const handlePaste = (e) => {
    if (status !== 'idle' || isAnimatingRef.current) return;
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!pastedData || pastedData.length === 0) return;

    const newOtp = ['', '', '', '', '', ''];
    pastedData.forEach((char, index) => {
      if (index < 6) newOtp[index] = char;
    });
    setOtp(newOtp);

    const nextEmptyIndex = Math.min(pastedData.length, 5);
    if (inputRefs[nextEmptyIndex].current) {
      inputRefs[nextEmptyIndex].current.focus();
      setActiveBoxIndex(nextEmptyIndex);
    }

    // Auto-verify if 6 digits pasted
    if (pastedData.length === 6) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  // Resend code handler
  const handleResend = async () => {
    if (cooldown > 0 || resending || status !== 'idle' || isAnimatingRef.current) return;

    try {
      setResending(true);
      const { data } = await axios.post(
        `${backendUrl}/api/user/resend-otp`,
        {},
        { headers: { token } }
      );

      if (data.success) {
        toast.success(data.message || 'A new verification code has been sent!');
        setCooldown(60);
        setOtp(['', '', '', '', '', '']);
        setActiveBoxIndex(0);
        if (inputRefs[0].current) inputRefs[0].current.focus();
      } else {
        toast.error(data.message || 'Failed to resend code');
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  // Switch account / logout
  const handleLogout = () => {
    setToken('');
    setUserData(false);
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  // ---------------------------------------------------------------------------
  // ANIMATION VARIANTS (Adapted directly from Animated-otp-Verification)
  // Left boxes move RIGHT to middle (+X)
  // Right boxes move LEFT to middle (-X)
  // All meet at Box 0 at the middle!
  // ---------------------------------------------------------------------------
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const pitch = isMobile ? 52 : 64; // box width + gap
  const targetOffset = 2.5 * pitch; // Box 0 moves to dead center of 6 boxes

  // Offsets for each box to meet at the exact center:
  // Box 0: +2.5P (moves RIGHT to middle)
  // Box 1: +1.5P (moves RIGHT to middle)
  // Box 2: +0.5P (moves RIGHT to middle)
  // Box 3: -0.5P (moves LEFT to middle)
  // Box 4: -1.5P (moves LEFT to middle)
  // Box 5: -2.5P (moves LEFT to middle)
  const offsets = [
    targetOffset,
    1.5 * pitch,
    0.5 * pitch,
    -0.5 * pitch,
    -1.5 * pitch,
    -2.5 * pitch
  ];
  const rotations = [0, -8, -12, 12, 8, -12];

  // Delay before the boxes start merging (matches Animated-otp-Verification timing)
  const mergeDelay = 0.6;

  const boxVariants = {
    idle: {
      x: 0,
      rotate: 0,
      scale: 1,
      opacity: 1,
      transition: { duration: 0.35, ease: 'easeInOut' }
    },
    success: (i) => {
      if (shouldReduceMotion) {
        return { opacity: i === 0 ? 1 : 0 };
      }
      if (i === 0) {
        return {
          x: [0, targetOffset, targetOffset],
          rotate: [0, 12, 0],
          scale: [1, 0.95, 1.22, 1], // Impact & Pop forward, straightens, settles
          zIndex: 10,
          transition: {
            duration: 1.0,
            times: [0, 0.5, 0.75, 1],
            delay: mergeDelay,
            ease: [0.25, 1, 0.5, 1]
          }
        };
      }
      return {
        x: offsets[i],
        rotate: rotations[i],
        scale: [1, 0.85, 0],
        opacity: [1, 1, 0],
        zIndex: 5 - i,
        transition: {
          duration: 0.75,
          times: [0, 0.75, 1],
          delay: mergeDelay,
          ease: 'easeInOut'
        }
      };
    },
    error: (i) => {
      if (i === 0) {
        return {
          x: [0, -12, 12, -8, 8, -4, 4, 0],
          rotate: [0, -4, 4, -2, 2, 0],
          scale: 1,
          zIndex: 10,
          transition: { duration: 0.5 }
        };
      }
      return {
        x: 0,
        scale: 1,
        opacity: 1,
        transition: { duration: 0.2 }
      };
    }
  };

  const textVariants = {
    idle: {
      color: '#1F2937',
      opacity: 1,
      transition: { duration: 0.2 }
    },
    success: {
      opacity: [1, 1, 0],
      transition: {
        duration: 0.75,
        times: [0, 0.75, 1], // Stays 100% visible during slide (0.6s to 1.16s), vanishes at collision by 1.35s
        delay: mergeDelay,
        ease: 'easeInOut'
      }
    },
    error: {
      color: '#1F2937',
      opacity: 1,
      transition: { duration: 0.2 }
    }
  };

  const tickContainerVariants = {
    idle: { opacity: 0, scale: 0.5, x: '-50%', y: '-50%' },
    error: { opacity: 0, scale: 0.5, x: '-50%', y: '-50%' },
    success: {
      opacity: 1,
      scale: 1,
      x: '-50%',
      y: '-50%',
      transition: {
        delay: mergeDelay + 0.85, // Pops in at ~1.45s after digits have vanished
        duration: 0.45,
        type: 'spring',
        stiffness: 260,
        damping: 18
      }
    }
  };

  const tickPathVariants = {
    idle: { pathLength: 0 },
    error: { pathLength: 0 },
    success: {
      pathLength: 1,
      transition: {
        delay: mergeDelay + 0.95, // Draws checkmark from ~1.55s to 2.05s
        duration: 0.5,
        ease: 'easeOut'
      }
    }
  };

  const isComplete = otp.every((d) => d !== '');
  const isTransitioning = status !== 'idle';

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      {/* Main Card Container */}
      <motion.div
        layout={!shouldReduceMotion}
        className={`w-full max-w-md p-6 sm:p-9 therapique-otp-card ${
          status === 'success' ? 'is-complete' : ''
        } ${status === 'error' ? 'is-error' : ''}`}
      >
        {/* Top Header Icon */}
        <div className="flex items-center justify-center mb-5 relative z-10">
          <motion.div
            animate={
              status === 'success'
                ? { scale: [1, 1.15, 1], rotate: [0, 4, -4, 0] }
                : { scale: 1 }
            }
            transition={{ duration: 0.4 }}
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-xs transition-colors duration-500 ${
              status === 'success'
                ? 'bg-emerald-50 border-[#81C784] text-[#81C784]'
                : status === 'error'
                ? 'bg-red-50 border-red-200 text-red-500'
                : 'bg-[#FAF5EE] border-[#EADBCE] text-gray-900'
            }`}
          >
            {status === 'success' ? (
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            ) : (
              <Mail className="w-7 h-7 text-gray-900" />
            )}
          </motion.div>
        </div>

        {/* Title & Description with Smooth Crossfade */}
        <div className="text-center mb-7 relative min-h-[76px] flex flex-col items-center justify-center z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={showVerifiedText ? 'verified' : 'unverified'}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="flex flex-col items-center"
            >
              <h1 className="font-therapique text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                {showVerifiedText
                  ? 'Verified successfully'
                  : "Let's verify your email"}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-2 font-medium leading-relaxed max-w-xs">
                {showVerifiedText
                  ? 'Your email has been verified.'
                  : "We've sent a 6-digit code to your email.\nIt'll auto-verify once entered."}
              </p>

              {/* Masked Email Badge */}
              {!showVerifiedText && userData?.email && (
                <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 bg-[#FAF5EE] border border-[#EADBCE] rounded-full text-xs font-semibold text-gray-800 shadow-2xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#81C784]" />
                  <span>{maskEmail(userData.email)}</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ============================================================ */}
        {/* OTP INPUTS CONTAINER (Right to Middle, Left to Middle!)       */}
        {/* ============================================================ */}
        <div className={`otp-inputs ${isTransitioning ? 'pointer-events-none' : ''}`} onPaste={handlePaste}>
          {otp.map((digit, index) => {
            const isActive = activeBoxIndex === index && status === 'idle';

            return (
              <motion.div
                key={index}
                className={`input-wrapper ${isActive ? 'is-active' : ''}`}
                custom={index}
                variants={boxVariants}
                initial="idle"
                animate={status}
              >
                <motion.input
                  ref={inputRefs[index]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  readOnly={isTransitioning}
                  tabIndex={isTransitioning ? -1 : 0}
                  onFocus={() => setActiveBoxIndex(index)}
                  onChange={(e) => handleChange(index, e)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="otp-input"
                  custom={index}
                  variants={textVariants}
                  initial="idle"
                  animate={status}
                  aria-label={`OTP Digit ${index + 1}`}
                />

                {/* Final Animated Tick inside Box 0 (pops at middle) */}
                {index === 0 && (
                  <motion.svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="final-tick"
                    variants={tickContainerVariants}
                    initial="idle"
                    animate={status}
                  >
                    <motion.path
                      d="M5 13l4 4L19 7"
                      stroke="#22c55e"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      variants={tickPathVariants}
                    />
                  </motion.svg>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Manual Submit Button Fallback */}
        <div className="mt-4 relative z-10">
          <button
            type="button"
            onClick={() => handleVerifyOtp(otp.join(''))}
            disabled={isTransitioning || !isComplete}
            className="w-full bg-gray-900 text-white font-bold text-sm py-3.5 px-6 rounded-full shadow-sm hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 group"
          >
            {status === 'success' ? (
              <span>Verified!</span>
            ) : (
              <>
                <span>Verify Email</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </div>

        {/* Resend Code Section */}
        <div className="text-center mt-6 pt-5 border-t border-[#EADBCE]/60 relative z-10">
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
              disabled={resending || isTransitioning}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              <span>Resend Code</span>
            </button>
          )}
        </div>

        {/* Switch Account / Logout */}
        <div className="text-center mt-4 relative z-10">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isTransitioning}
            className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <LogOut className="w-3 h-3" />
            <span>Wrong email? Log out</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
