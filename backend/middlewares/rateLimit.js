/**
 * Small in-memory fixed-window rate limiter (no external dependency).
 * Keyed by client IP (req.ip honours the `trust proxy` setting, so a spoofed
 * X-Forwarded-For header cannot be used to rotate identities) plus an optional
 * extra key such as the target e-mail address.
 *
 * Note: state is per-process. If the API is ever scaled horizontally, move the
 * store to Redis so limits are shared between instances.
 */
const stores = new Set()

setInterval(() => {
    const now = Date.now()
    for (const store of stores) {
        for (const [key, entry] of store) {
            if (entry.resetAt <= now) store.delete(key)
        }
    }
}, 60 * 1000).unref()

export const createRateLimiter = ({ windowMs, max, keyFn, message = 'Too many requests. Please try again later.' }) => {
    const store = new Map()
    stores.add(store)

    const limiter = (req, res, next) => {
        const extra = keyFn ? String(keyFn(req) ?? '').toLowerCase().slice(0, 200) : ''
        const key = `${req.ip}|${extra}`
        const now = Date.now()
        let entry = store.get(key)
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs }
            store.set(key, entry)
        }
        entry.count += 1
        if (entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
            return res.status(429).json({ success: false, message })
        }
        next()
    }
    limiter.reset = () => store.clear()
    return limiter
}

const bodyEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim() : '')
const MIN = 60 * 1000

// Shared limiters for sensitive endpoints
export const limiters = {
    api: createRateLimiter({ windowMs: MIN, max: 300 }),
    login: createRateLimiter({ windowMs: 15 * MIN, max: 10, keyFn: bodyEmail, message: 'Too many login attempts. Please wait 15 minutes and try again.' }),
    loginIp: createRateLimiter({ windowMs: 15 * MIN, max: 50, message: 'Too many login attempts. Please wait 15 minutes and try again.' }),
    register: createRateLimiter({ windowMs: 60 * MIN, max: 10, message: 'Too many sign-up attempts. Please try again later.' }),
    otp: createRateLimiter({ windowMs: 15 * MIN, max: 10, message: 'Too many verification attempts. Please try again later.' }),
    passwordResetRequest: createRateLimiter({ windowMs: 15 * MIN, max: 5, keyFn: bodyEmail, message: 'Too many reset requests. Please try again later.' }),
    passwordReset: createRateLimiter({ windowMs: 15 * MIN, max: 10, message: 'Too many reset attempts. Please try again later.' }),
    contact: createRateLimiter({ windowMs: 60 * MIN, max: 5, message: 'You have sent several messages recently. Please try again later.' }),
    newsletter: createRateLimiter({ windowMs: 60 * MIN, max: 5, message: 'Too many subscription requests. Please try again later.' }),
    payment: createRateLimiter({ windowMs: 15 * MIN, max: 40, message: 'Too many payment requests. Please try again later.' }),
    assistant: createRateLimiter({ windowMs: MIN, max: 12, message: 'You are sending messages too quickly. Please wait a moment and try again.' }),
}
