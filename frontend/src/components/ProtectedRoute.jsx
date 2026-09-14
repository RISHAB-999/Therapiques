import React, { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import { toast } from 'react-toastify'

const ProtectedRoute = ({ 
  children, 
  message = 'Please log in or create an account to continue', 
  context = 'general',
  title = ''
}) => {
  const { token, userData } = useContext(AppContext)
  const location = useLocation()

  if (!token) {
    toast.info(message, { toastId: 'auth-required' })
    return <Navigate to="/login" state={{ from: location, message, context, title }} replace />
  }

  const isEmailVerified = userData?.emailVerified !== undefined ? userData.emailVerified : true
  const isProfileCompleted = userData?.profileCompleted !== undefined ? userData.profileCompleted : true

  const normalizedPath = location.pathname.toLowerCase().replace(/%20|_/g, '-')
  const isVerifyPath = normalizedPath === '/verify-email'
  const isCompleteProfilePath = normalizedPath === '/complete-profile'

  // 1. If email is unverified, only allow /verify-email
  if (userData && isEmailVerified === false) {
    if (!isVerifyPath) {
      return <Navigate to="/verify-email" replace />
    }
    return children
  }

  // 2. If email is verified but profile is incomplete, only allow /complete-profile
  if (userData && isEmailVerified === true && isProfileCompleted === false) {
    if (!isCompleteProfilePath) {
      return <Navigate to="/complete-profile" replace />
    }
    return children
  }

  // 3. If user is already verified and completed, prevent accessing /verify-email or /complete-profile
  if (userData && isEmailVerified === true && isProfileCompleted === true) {
    if (isVerifyPath || isCompleteProfilePath) {
      return <Navigate to="/" replace />
    }
  }

  return children
}

export default ProtectedRoute
