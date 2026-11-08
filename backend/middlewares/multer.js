import multer from 'multer'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Hardened image upload middleware.
 * - Only JPEG / PNG / WebP / GIF, max 5 MB per file, max 4 files.
 * - Random server-side file names (client file names and paths are never used).
 * - Real file signature (magic bytes) verified after upload; MIME/extension spoofing is rejected.
 * - Temporary files are always deleted once the response has been sent.
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
}

const UPLOAD_DIR = path.join(os.tmpdir(), 'therapique-uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
        const ext = (ALLOWED[file.mimetype] || ['.img'])[0]
        cb(null, `${crypto.randomUUID()}${ext}`)
    },
})

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const allowedExts = ALLOWED[file.mimetype]
    if (!allowedExts || (ext && !allowedExts.includes(ext))) {
        const err = new Error('Only JPG, PNG, WebP or GIF images are allowed')
        err.status = 400
        err.expose = true
        return cb(err)
    }
    cb(null, true)
}

const base = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 4, fields: 30, fieldSize: 100 * 1024 } })

/** Checks the first bytes of a file against known image signatures. */
export const hasImageSignature = (buf) => {
    if (!buf || buf.length < 12) return false
    const hex = buf.subarray(0, 12).toString('hex')
    return hex.startsWith('ffd8ff') ||                                   // JPEG
        hex.startsWith('89504e470d0a1a0a') ||                            // PNG
        hex.startsWith('474946383761') || hex.startsWith('474946383961') || // GIF87a / GIF89a
        (hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP') // WebP
}

const collectFiles = (req) => [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
]

const removeFile = (file) => fs.promises.unlink(file.path).catch(() => {})

const verifyAndCleanup = async (req, res, next) => {
    const files = collectFiles(req)
    res.on('finish', () => files.forEach(removeFile))
    res.on('close', () => files.forEach(removeFile))
    try {
        for (const file of files) {
            const handle = await fs.promises.open(file.path, 'r')
            const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0)
            await handle.close()
            if (!hasImageSignature(buffer)) {
                return res.status(400).json({ success: false, message: 'Uploaded file is not a valid image' })
            }
        }
        next()
    } catch (error) {
        next(error)
    }
}

const wrap = (mw) => [mw, verifyAndCleanup]

const upload = {
    single: (field) => wrap(base.single(field)),
    fields: (spec) => wrap(base.fields(spec)),
}

export default upload
