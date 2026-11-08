import crypto from 'crypto'
import jwt from 'jsonwebtoken'

/**
 * Role-scoped JWT helpers.
 * - Every token carries a `role` claim, so a patient token can never be used as a doctor/admin token.
 * - Tokens expire (JWT_EXPIRES_IN, default 7 days).
 * - `tv` (token version) lets the server revoke all sessions of an account (password change/reset).
 * - Only HS256 is accepted, preventing algorithm-confusion attacks.
 */
const ALGORITHM = 'HS256'
const expiresIn = () => process.env.JWT_EXPIRES_IN || '7d'

const secret = () => {
    const s = process.env.JWT_SECRET
    if (!s) throw new Error('JWT_SECRET is not configured')
    return s
}

export const signToken = (role, id, tokenVersion = 0) =>
    jwt.sign({ id: String(id), role, tv: tokenVersion }, secret(), { algorithm: ALGORITHM, expiresIn: expiresIn() })

/** Returns the decoded payload, or null if the token is invalid, expired or for another role. */
export const verifyToken = (token, role) => {
    if (typeof token !== 'string' || token.length > 2048) return null
    try {
        const decoded = jwt.verify(token, secret(), { algorithms: [ALGORITHM] })
        if (!decoded || typeof decoded !== 'object' || decoded.role !== role || !decoded.id) return null
        return decoded
    } catch {
        return null
    }
}

/**
 * Admin credentials live in env vars. The admin token never contains them; instead it carries a
 * fingerprint of the current admin password so rotating ADMIN_PASSWORD revokes every admin session.
 */
export const adminFingerprint = () =>
    crypto.createHmac('sha256', secret()).update(`${process.env.ADMIN_EMAIL}:${process.env.ADMIN_PASSWORD}`).digest('hex').slice(0, 32)

export const signAdminToken = () =>
    jwt.sign({ id: 'admin', role: 'admin', fp: adminFingerprint() }, secret(), { algorithm: ALGORITHM, expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h' })

export const SESSION_EXPIRED = 'Session expired. Please log in again.'
