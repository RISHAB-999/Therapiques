import { verifyToken, adminFingerprint, SESSION_EXPIRED } from '../utils/tokens.js'
import { safeEqual } from '../utils/security.js'

// Admin authentication middleware: requires a non-expired admin-role token
// issued for the current admin credentials.
const authAdmin = (req, res, next) => {
    const decoded = verifyToken(req.headers.atoken, 'admin')
    if (!decoded || !safeEqual(String(decoded.fp || ''), adminFingerprint())) {
        return res.json({ success: false, message: decoded ? SESSION_EXPIRED : 'Not Authorized. Login Again' })
    }
    req.isAdmin = true
    next()
}

export default authAdmin
