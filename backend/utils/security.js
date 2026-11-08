import crypto from 'crypto'
import mongoose from 'mongoose'

export const isProduction = () => process.env.NODE_ENV === 'production'

// ─── Output encoding ────────────────────────────────────────────────────────
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

/**
 * Recursively HTML-escapes every string inside plain objects/arrays.
 * Keys matching `skipKey` (e.g. recipient e-mail addresses) are left untouched.
 * Non-plain objects (Date, ObjectId, Buffer) are passed through as-is.
 */
export const escapeDeep = (value, skipKey = () => false) => {
    if (typeof value === 'string') return escapeHtml(value)
    if (Array.isArray(value)) return value.map(v => escapeDeep(v, skipKey))
    if (isPlainObject(value)) {
        const out = {}
        for (const [k, v] of Object.entries(value)) {
            out[k] = skipKey(k) ? v : escapeDeep(v, skipKey)
        }
        return out
    }
    return value
}

// ─── Error handling ─────────────────────────────────────────────────────────
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** Message safe to return to clients: internals are hidden in production. */
export const clientError = (error) => (isProduction() ? GENERIC_ERROR : (error?.message || GENERIC_ERROR))

// ─── Comparisons & validation ───────────────────────────────────────────────
export const safeEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const ha = crypto.createHash('sha256').update(a).digest()
    const hb = crypto.createHash('sha256').update(b).digest()
    return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

export const isObjectId = (value) => typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value)

export const isNonEmptyString = (value, max = 1000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max

/** Verifies a Razorpay checkout signature in constant time. */
export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    if (![orderId, paymentId, signature].every(v => typeof v === 'string' && v.length > 0 && v.length < 200)) return false
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return false
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
    return safeEqual(expected, signature)
}

/** Cryptographically secure 6-digit OTP and its SHA-256 hash. */
export const generateOtp = () => {
    const otp = crypto.randomInt(100000, 1000000).toString()
    return { otp, hash: hashOtp(otp) }
}

export const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp).trim()).digest('hex')
