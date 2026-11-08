import { Server } from 'socket.io'
import { socketAuthMiddleware } from './socketAuth.js'
import { registerVideoCallHandlers } from './videoCallHandler.js'
import { isOriginAllowed } from '../middlewares/securityHeaders.js'

export const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 256 * 1024
  })

  // Authenticate every socket connection
  io.use(socketAuthMiddleware)

  // Register WebRTC Video Call Signaling Handlers
  io.on('connection', (socket) => {
    registerVideoCallHandlers(io, socket)
  })

  console.log('[Socket] WebRTC Socket.io signaling server initialized')
  return io
}
