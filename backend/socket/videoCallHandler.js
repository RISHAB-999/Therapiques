import appointmentModel from '../models/appointmentModel.js'
import { getAppointmentJoinStatus } from '../utils/appointmentTiming.js'
import { isObjectId } from '../utils/security.js'

const MAX_CHAT_LENGTH = 2000
const MAX_SIGNAL_SIZE = 64 * 1024

/** A socket may only relay into the appointment room it was authorised to join. */
const inRoom = (socket, room) => typeof room === 'string' && socket.currentRoom === room
const isSmallObject = (value) => value !== null && typeof value === 'object' && JSON.stringify(value).length <= MAX_SIGNAL_SIZE

export const registerVideoCallHandlers = (io, socket) => {
  const { userId, role, name, image } = socket.data || {}

  console.log(`[Socket] Connected: ${name || 'User'} (${role || 'guest'}) | Socket ID: ${socket.id}`)

  // 1. DIRECT ROOM JOIN
  socket.on('room:join', async (payload, callback) => {
    if (typeof callback !== 'function') callback = null
    try {
      const appointmentId = payload?.appointmentId
      if (!isObjectId(appointmentId)) {
        if (callback) callback({ success: false, message: 'Appointment ID required' })
        return
      }

      // Authorization boundary verification
      const appointment = await appointmentModel.findById(appointmentId)
      if (!appointment) {
        if (callback) callback({ success: false, message: 'Appointment not found' })
        return
      }

      if (appointment.cancelled) {
        if (callback) callback({ success: false, message: 'This appointment has been cancelled' })
        return
      }

      if (appointment.isCompleted) {
        if (callback) callback({ success: false, message: 'This appointment has already been completed' })
        return
      }

      // Verify user is authorized participant (either patient or doctor)
      if (role === 'user' && String(appointment.userId) !== String(userId)) {
        console.warn(`[Room Authorization Failed] User ${userId} not authorized for appointment ${appointmentId}`)
        if (callback) callback({ success: false, message: 'Unauthorized appointment access' })
        return
      }
      if (role !== 'user' && role !== 'doctor') {
        if (callback) callback({ success: false, message: 'Unauthorized appointment access' })
        return
      }
      // A doctor connected through a call ticket may only join the appointment the ticket was issued for
      if (role === 'doctor' && socket.data.appointmentId && String(socket.data.appointmentId) !== String(appointmentId)) {
        if (callback) callback({ success: false, message: 'Unauthorized doctor appointment access' })
        return
      }
      if (role === 'doctor' && String(appointment.docId) !== String(userId)) {
        console.warn(`[Room Authorization Failed] Doctor ${userId} not authorized for appointment ${appointmentId}`)
        if (callback) callback({ success: false, message: 'Unauthorized doctor appointment access' })
        return
      }

      // Authoritative Join-Time Window Validation (10 min before to end of appointment)
      const timingStatus = getAppointmentJoinStatus(appointment)
      if (!timingStatus.canJoin) {
        console.warn(`[Room Time Window Blocked] Room ${appointmentId} rejected for ${name} (${role}): ${timingStatus.reason}`)
        if (callback) {
          callback({
            success: false,
            code: timingStatus.status,
            message: timingStatus.reason,
            availableAt: timingStatus.formattedJoinTime,
            timingStatus
          })
        }
        return
      }

      // Leave any previous room before joining a new one
      if (socket.currentRoom && socket.currentRoom !== appointmentId) {
        socket.leave(socket.currentRoom)
      }
      socket.join(appointmentId)
      socket.currentRoom = appointmentId

      const room = io.sockets.adapter.rooms.get(appointmentId)
      const participantCount = room ? room.size : 1

      console.log(`[Room] ${name} (${role}) joined room ${appointmentId}. Total participants: ${participantCount}`)

      // Find other participant socket ID in the room
      let otherSocketId = null
      if (room) {
        for (const id of room) {
          if (id !== socket.id) {
            otherSocketId = id
            break
          }
        }
      }

      if (otherSocketId) {
        const otherSocket = io.sockets.sockets.get(otherSocketId)
        const peerInfo = otherSocket ? { name: otherSocket.data.name, image: otherSocket.data.image, role: otherSocket.data.role } : null

        // Notify existing participant that a peer joined
        socket.to(appointmentId).emit('user:joined', {
          socketId: socket.id,
          name,
          image,
          role
        })

        // Notify joining socket about existing peer
        socket.emit('room:joined', {
          success: true,
          participantCount,
          peerInfo
        })
      } else {
        socket.emit('room:joined', {
          success: true,
          participantCount,
          peerInfo: null
        })
      }

      if (callback) callback({ success: true, participantCount })
    } catch (error) {
      console.error('Error joining room:', error)
      if (callback) callback({ success: false, message: 'Unable to join the session. Please try again.' })
    }
  })

  // 2. WEBRTC OFFER RELAY
  socket.on('webrtc:offer', ({ room, offer } = {}) => {
    if (inRoom(socket, room) && isSmallObject(offer)) {
      socket.to(room).emit('webrtc:offer', { offer, senderSocketId: socket.id })
    }
  })

  // 3. WEBRTC ANSWER RELAY
  socket.on('webrtc:answer', ({ room, answer } = {}) => {
    if (inRoom(socket, room) && isSmallObject(answer)) {
      socket.to(room).emit('webrtc:answer', { answer, senderSocketId: socket.id })
    }
  })

  // 4. WEBRTC ICE CANDIDATE RELAY
  socket.on('webrtc:ice-candidate', ({ room, candidate } = {}) => {
    if (inRoom(socket, room) && isSmallObject(candidate)) {
      socket.to(room).emit('webrtc:ice-candidate', { candidate, senderSocketId: socket.id })
    }
  })

  // 4b. MUTE STATUS RELAY
  socket.on('webrtc:mute-status', ({ room, isAudioMuted, isVideoMuted } = {}) => {
    if (inRoom(socket, room)) {
      socket.to(room).emit('webrtc:mute-status', { isAudioMuted: typeof isAudioMuted === 'boolean' ? isAudioMuted : undefined, isVideoMuted: typeof isVideoMuted === 'boolean' ? isVideoMuted : undefined, senderSocketId: socket.id })
    }
  })

  // 5. REAL-TIME CHAT MESSAGE RELAY
  socket.on('chat:message', ({ room, text } = {}) => {
    if (inRoom(socket, room) && typeof text === 'string' && text.trim()) {
      // Sender identity always comes from the authenticated socket, never from the client payload
      const messageData = {
        id: Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        text: text.slice(0, MAX_CHAT_LENGTH),
        senderName: name || 'Participant',
        senderRole: role === 'doctor' ? 'doctor' : 'patient',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        senderSocketId: socket.id
      }
      // Chat content is confidential patient data and is intentionally not logged
      io.to(room).emit('chat:message', messageData)
    }
  })

  // 6. LEAVE ROOM / DISCONNECT
  const handleLeave = () => {
    const room = socket.currentRoom
    if (room) {
      console.log(`[Room] ${name} left room ${room}`)
      socket.to(room).emit('peer:left', { socketId: socket.id, name })
      socket.leave(room)
      socket.currentRoom = null
    }
  }

  socket.on('room:leave', handleLeave)

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${name || 'User'} (${role || 'guest'}) | Socket ID: ${socket.id}`)
    handleLeave()
  })
}

