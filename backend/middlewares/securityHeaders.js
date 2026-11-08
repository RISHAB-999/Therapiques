import { isProduction } from '../utils/security.js'

/**
 * Security headers for a JSON API (no third-party dependency).
 * The API never serves HTML, so its CSP is maximally restrictive.
 */
export const securityHeaders = (req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    // Book cover images are loaded by the SPA from another origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (isProduction()) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
}

/** Redirects plain-HTTP requests to HTTPS in production (behind a TLS-terminating proxy). */
export const enforceHttps = (req, res, next) => {
    if (isProduction() && req.headers['x-forwarded-proto'] === 'http') {
        if (req.method === 'GET' || req.method === 'HEAD') {
            return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
        }
        return res.status(403).json({ success: false, message: 'HTTPS is required' })
    }
    next()
}

// ─── CORS allow-list ────────────────────────────────────────────────────────
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']

export const getAllowedOrigins = () => {
    const configured = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)
    return configured.length > 0 ? configured : DEV_ORIGINS
}

/**
 * When CORS_ORIGINS is not configured, production falls back to the project's Vercel
 * deployments so an existing deployment keeps working; set CORS_ORIGINS to lock it down fully.
 */
export const isOriginAllowed = (origin) => {
    if (!origin) return true // same-origin, curl, server-to-server, Razorpay callbacks
    const allowed = getAllowedOrigins()
    if (allowed.includes(origin)) return true
    if (!process.env.CORS_ORIGINS && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true
    return false
}

export const corsOptions = {
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'token', 'dtoken', 'atoken', 'bypass-tunnel-reminder'],
    credentials: false,
    maxAge: 600,
}
