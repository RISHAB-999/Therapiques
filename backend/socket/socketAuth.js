import { verifyToken } from '../utils/tokens.js'
import userModel from '../models/userModel.js'
import doctorModel from '../models/doctorModel.js'
import { validateAndConsumeTicket } from './callTicketManager.js'

/**
 * Socket.io authentication middleware.
 * Authenticates users using either:
 * 1. User JWT token (`auth.token`)
 * 2. Doctor JWT token (`auth.dtoken`)
 * 3. One-time call ticket (`auth.callTicket`)
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const { token, dtoken, callTicket } = socket.handshake.auth || {}

    // Option A: Doctor authenticated via short-lived call ticket
    if (typeof callTicket === 'string' && callTicket) {
      const ticketData = validateAndConsumeTicket(callTicket)
      if (ticketData) {
        socket.data = {
          userId: ticketData.docId,
          role: 'doctor',
          name: ticketData.docName,
          appointmentId: ticketData.appointmentId
        }
        return next()
      } else {
        return next(new Error('Invalid or expired call ticket'))
      }
    }

    // Option B: Patient authenticated via User JWT Token
    if (token) {
      try {
        const decoded = verifyToken(token, 'user')
        const user = decoded && await userModel.findById(decoded.id).select('name image tokenVersion')
        if (user && (user.tokenVersion || 0) === (decoded.tv || 0)) {
          socket.data = {
            userId: user._id.toString(),
            role: 'user',
            name: user.name,
            image: user.image
          }
          return next()
        }
      } catch (err) {
        console.log('[Socket Auth] User token invalid:', err.message)
      }
    }

    // Option C: Doctor authenticated via Doctor JWT Token
    if (dtoken) {
      try {
        const decoded = verifyToken(dtoken, 'doctor')
        const doctor = decoded && await doctorModel.findById(decoded.id).select('name image tokenVersion')
        if (doctor && (doctor.tokenVersion || 0) === (decoded.tv || 0)) {
          socket.data = {
            userId: doctor._id.toString(),
            role: 'doctor',
            name: doctor.name,
            image: doctor.image
          }
          return next()
        }
      } catch (err) {
        console.log('[Socket Auth] Doctor token invalid:', err.message)
      }
    }

    return next(new Error('Authentication token or ticket required'))
  } catch (error) {
    console.error('Socket Authentication Error:', error.message)
    return next(new Error('Authentication failed'))
  }
}
