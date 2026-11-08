import express from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import adminRouter from './routes/adminRoutes.js'
import doctorRouter from './routes/doctorRoutes.js'
import userRouter from './routes/userRoutes.js'
import bookRouter from './routes/bookRoutes.js'
import assistantRouter from './routes/assistantRoutes.js'
import { securityHeaders, enforceHttps, corsOptions } from './middlewares/securityHeaders.js'
import { limiters } from './middlewares/rateLimit.js'
import { clientError } from './utils/security.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Builds the Express application (no network or database side effects — used by server.js and tests). */
export const createApp = () => {
    const app = express()

    app.disable('x-powered-by')
    // Number of trusted reverse proxies in front of the API (Render = 1). Makes req.ip the real client IP.
    app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))

    app.use(enforceHttps)
    app.use(securityHeaders)
    app.use(cors(corsOptions))
    app.use(compression())
    app.use(express.json({ limit: '2mb' }))

    // Serve custom book cover images statically with caching headers
    app.use('/book-covers', express.static(path.join(__dirname, '../frontend/src/assets/book pic'), {
        maxAge: '7d',
        immutable: true,
        dotfiles: 'deny',
        index: false,
    }))

    // API ENDPOINTS
    app.use('/api', limiters.api)
    app.use('/api/admin', adminRouter)
    app.use('/api/doctor', doctorRouter)
    app.use('/api/user', userRouter)
    app.use('/api/book', bookRouter)
    app.use('/api/assistant', assistantRouter)

    app.get('/', (req, res) => {
        res.send('Therapique Backend API Running')
    })

    app.use((req, res) => {
        res.status(404).json({ success: false, message: 'Not found' })
    })

    // Central error handler: never leak stack traces or internal paths to clients
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : 'Invalid file upload'
            return res.status(400).json({ success: false, message })
        }
        if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
            return res.status(400).json({ success: false, message: 'Invalid request body' })
        }
        if (err?.expose && err.status < 500) {
            return res.status(err.status).json({ success: false, message: err.message })
        }
        console.error('Unhandled error:', err?.message)
        res.status(500).json({ success: false, message: clientError(err) })
    })

    return app
}

export default createApp
