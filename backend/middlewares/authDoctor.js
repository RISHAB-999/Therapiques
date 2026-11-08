import doctorModel from '../models/doctorModel.js'
import { verifyToken, SESSION_EXPIRED } from '../utils/tokens.js'

// Doctor authentication middleware: requires a non-expired doctor-role token
// whose token version still matches the account (revoked after credential changes).
const authDoctor = async (req, res, next) => {
    const { dtoken } = req.headers
    if (!dtoken) {
        return res.json({ success: false, message: 'Not Authorized Login Again' })
    }
    const decoded = verifyToken(dtoken, 'doctor')
    if (!decoded) {
        return res.json({ success: false, message: SESSION_EXPIRED })
    }
    try {
        const doctor = await doctorModel.findById(decoded.id).select('tokenVersion').lean()
        if (!doctor || (doctor.tokenVersion || 0) !== (decoded.tv || 0)) {
            return res.json({ success: false, message: SESSION_EXPIRED })
        }
        req.body = req.body || {}
        req.body.docId = decoded.id
        req.docId = decoded.id
        next()
    } catch (error) {
        console.error('authDoctor error:', error.message)
        res.json({ success: false, message: 'Not Authorized Login Again' })
    }
}

export default authDoctor
