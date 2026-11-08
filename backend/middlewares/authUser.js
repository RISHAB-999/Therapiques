import userModel from '../models/userModel.js'
import { verifyToken, SESSION_EXPIRED } from '../utils/tokens.js'

// Patient authentication middleware: requires a non-expired user-role token
// whose token version still matches the account (revoked after password change/reset).
const authUser = async (req, res, next) => {
    const { token } = req.headers
    if (!token) {
        return res.json({ success: false, message: 'Not Authorized Login Again' })
    }
    const decoded = verifyToken(token, 'user')
    if (!decoded) {
        return res.json({ success: false, message: SESSION_EXPIRED })
    }
    try {
        const user = await userModel.findById(decoded.id).select('tokenVersion emailVerified').lean()
        if (!user || (user.tokenVersion || 0) !== (decoded.tv || 0)) {
            return res.json({ success: false, message: SESSION_EXPIRED })
        }
        req.body = req.body || {}
        req.body.userId = decoded.id
        req.userId = decoded.id
        // Accounts created before e-mail verification existed have no flag and are treated as verified
        req.userEmailVerified = user.emailVerified !== false
        next()
    } catch (error) {
        console.error('authUser error:', error.message)
        res.json({ success: false, message: 'Not Authorized Login Again' })
    }
}

// Blocks payment/booking/order actions until the account's e-mail address is verified.
export const requireVerifiedEmail = (req, res, next) => {
    if (req.userEmailVerified === false) {
        return res.json({ success: false, message: 'Please verify your email address to continue.' })
    }
    next()
}

export default authUser
