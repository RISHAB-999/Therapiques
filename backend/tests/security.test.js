/**
 * Automated security regression tests.
 * Run with: npm test   (no database or network services required)
 *
 * Each test maps to a finding from the security audit (see SECURITY.md).
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.NODE_ENV = 'production'
process.env.JWT_SECRET = 'test-secret-'.padEnd(64, 'x')
process.env.ADMIN_EMAIL = 'admin@example.test'
process.env.ADMIN_PASSWORD = 'correct-horse-battery'
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy'
process.env.RAZORPAY_KEY_SECRET = 'razorpay-test-secret'
process.env.CORS_ORIGINS = 'https://app.example.test'
process.env.TRUST_PROXY = '1'

const mongoose = (await import('mongoose')).default
mongoose.set('bufferCommands', false) // DB calls fail fast instead of hanging (no DB in tests)

const jwt = (await import('jsonwebtoken')).default
const { createApp } = await import('../app.js')
const { signToken, verifyToken, signAdminToken } = await import('../utils/tokens.js')
const { escapeHtml, escapeDeep, verifyRazorpaySignature, safeEqual, clientError, isObjectId } = await import('../utils/security.js')
const { hasImageSignature } = await import('../middlewares/multer.js')
const { getFormatPrice, computeOrderTotal, priceCartItems, sanitizeAddress } = await import('../utils/orderPricing.js')
const { limiters } = await import('../middlewares/rateLimit.js')
const { registerVideoCallHandlers } = await import('../socket/videoCallHandler.js')
const authAdmin = (await import('../middlewares/authAdmin.js')).default
const authUser = (await import('../middlewares/authUser.js')).default
const authDoctor = (await import('../middlewares/authDoctor.js')).default

let server
let base

before(async () => {
    server = createApp().listen(0)
    await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}`
})
after(() => server?.close())

const post = (url, body, headers = {}) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
})

/** Runs an Express middleware against a fake req/res and reports whether next() was called. */
const runMiddleware = (mw, headers) => new Promise((resolve) => {
    const req = { headers, body: {} }
    const res = { json: (payload) => resolve({ passed: false, payload }), status() { return this } }
    Promise.resolve(mw(req, res, () => resolve({ passed: true, req }))).catch(e => resolve({ passed: false, error: e }))
})

describe('Security headers, CORS and error handling', () => {
    test('API responses carry hardened security headers', async () => {
        const res = await fetch(base + '/')
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
        assert.equal(res.headers.get('x-frame-options'), 'DENY')
        assert.match(res.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'none'/)
        assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/)
        assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
        assert.equal(res.headers.get('x-powered-by'), null)
    })

    test('plain HTTP behind the proxy is redirected to HTTPS in production', async () => {
        const res = await fetch(base + '/', { headers: { 'X-Forwarded-Proto': 'http' }, redirect: 'manual' })
        assert.equal(res.status, 308)
        assert.match(res.headers.get('location'), /^https:\/\//)
    })

    test('CORS allows only configured origins', async () => {
        const allowed = await fetch(base + '/', { headers: { Origin: 'https://app.example.test' } })
        assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example.test')
        const evil = await fetch(base + '/', { headers: { Origin: 'https://evil.example' } })
        assert.equal(evil.headers.get('access-control-allow-origin'), null)
    })

    test('malformed JSON returns a generic 400 without stack traces', async () => {
        const res = await post('/api/user/login', '{"email":')
        const body = await res.json()
        assert.equal(res.status, 400)
        assert.equal(body.message, 'Invalid request body')
        assert.doesNotMatch(JSON.stringify(body), /at .*\.js|node_modules|SyntaxError/)
    })

    test('oversized JSON bodies are rejected', async () => {
        const res = await post('/api/user/newsletter-subscribe', { email: 'a'.repeat(3 * 1024 * 1024) })
        assert.equal(res.status, 400)
    })

    test('production error messages hide internals', () => {
        assert.equal(clientError(new Error('E11000 duplicate key collection: test.users')), 'Something went wrong. Please try again.')
    })
})

describe('Removed / protected endpoints', () => {
    test('the unauthenticated order-status endpoint no longer exists', async () => {
        const res = await post('/api/user/update-order-status', { orderId: '64b000000000000000000000', status: '<a href=x>Delivered</a>' })
        assert.equal(res.status, 404)
    })

    test('admin endpoints reject requests without a token', async () => {
        const res = await post('/api/book/update-status', { orderId: '64b000000000000000000000', status: 'Delivered' })
        const body = await res.json()
        assert.equal(body.success, false)
    })

    test('doctor profile upload is rejected BEFORE the file is accepted', async () => {
        const uploadDir = path.join(os.tmpdir(), 'therapique-uploads')
        const before = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0
        const form = new FormData()
        form.append('image', new Blob([Buffer.alloc(1024, 1)], { type: 'image/png' }), 'shell.php.png')
        const res = await fetch(base + '/api/doctor/update-profile', { method: 'POST', body: form })
        const body = await res.json()
        assert.equal(body.success, false)
        const afterCount = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0
        assert.equal(afterCount, before, 'no file may be written for unauthenticated requests')
    })
})

describe('Authentication tokens', () => {
    test('old-style admin token (credentials as payload) is rejected', async () => {
        const legacy = jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET)
        const { passed } = await runMiddleware(authAdmin, { atoken: legacy })
        assert.equal(passed, false)
    })

    test('new admin token does not contain the admin password and expires', () => {
        const token = signAdminToken()
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        assert.ok(!JSON.stringify(payload).includes(process.env.ADMIN_PASSWORD))
        assert.ok(payload.exp > payload.iat)
    })

    test('valid admin token passes, user/doctor tokens do not', async () => {
        assert.equal((await runMiddleware(authAdmin, { atoken: signAdminToken() })).passed, true)
        assert.equal((await runMiddleware(authAdmin, { atoken: signToken('user', '64b000000000000000000000') })).passed, false)
        assert.equal((await runMiddleware(authAdmin, { atoken: signToken('doctor', '64b000000000000000000000') })).passed, false)
    })

    test('admin tokens are revoked when the admin password is rotated', async () => {
        const token = signAdminToken()
        const original = process.env.ADMIN_PASSWORD
        process.env.ADMIN_PASSWORD = 'rotated-password-123'
        try {
            assert.equal((await runMiddleware(authAdmin, { atoken: token })).passed, false)
        } finally {
            process.env.ADMIN_PASSWORD = original
        }
    })

    test('a doctor token cannot be used as a patient token and vice versa', async () => {
        const doctorToken = signToken('doctor', '64b000000000000000000000')
        const userToken = signToken('user', '64b000000000000000000000')
        assert.equal((await runMiddleware(authUser, { token: doctorToken })).passed, false)
        assert.equal((await runMiddleware(authDoctor, { dtoken: userToken })).passed, false)
    })

    test('legacy tokens without role/expiry are rejected', async () => {
        const legacy = jwt.sign({ id: '64b000000000000000000000' }, process.env.JWT_SECRET)
        assert.equal(verifyToken(legacy, 'user'), null)
        assert.equal((await runMiddleware(authUser, { token: legacy })).passed, false)
    })

    test('expired tokens are rejected', () => {
        const expired = jwt.sign({ id: 'x', role: 'user', tv: 0 }, process.env.JWT_SECRET, { expiresIn: -10 })
        assert.equal(verifyToken(expired, 'user'), null)
    })

    test('alg=none and wrong-secret tokens are rejected', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ id: 'x', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
        assert.equal(verifyToken(`${header}.${payload}.`, 'admin'), null)
        const forged = jwt.sign({ id: 'x', role: 'user' }, 'attacker-secret', { expiresIn: '1h' })
        assert.equal(verifyToken(forged, 'user'), null)
    })

    test('patient/doctor tokens expire', () => {
        const payload = jwt.decode(signToken('user', 'abc'))
        assert.ok(payload.exp - payload.iat <= 7 * 24 * 3600)
    })
})

describe('Rate limiting', () => {
    test('login is limited per IP+email even when X-Forwarded-For is spoofed', async () => {
        limiters.login.reset(); limiters.loginIp.reset()
        let last
        for (let i = 0; i < 11; i++) {
            // A real proxy appends the true client IP last; the spoofed left-most value must not matter
            last = await post('/api/user/login', { email: 'victim@example.test', password: 'guess' + i }, { 'X-Forwarded-For': `10.0.0.${i}, 203.0.113.7` })
        }
        assert.equal(last.status, 429)
        limiters.login.reset(); limiters.loginIp.reset()
    })

    test('password reset verification is rate limited', async () => {
        limiters.passwordReset.reset()
        let last
        for (let i = 0; i < 11; i++) {
            last = await post('/api/user/reset-password', { email: 'victim@example.test', otp: String(100000 + i), newPassword: 'NewPassword1' }, { 'X-Forwarded-For': '203.0.113.8' })
        }
        assert.equal(last.status, 429)
        limiters.passwordReset.reset()
    })

    test('newsletter / e-mail sending endpoints are rate limited', async () => {
        limiters.newsletter.reset()
        let last
        for (let i = 0; i < 6; i++) {
            last = await post('/api/user/newsletter-subscribe', { email: 'not-an-email' }, { 'X-Forwarded-For': '203.0.113.9' })
        }
        assert.equal(last.status, 429)
        limiters.newsletter.reset()
    })
})

describe('Input validation, injection and payments', () => {
    test('NoSQL operator objects are rejected as identifiers', () => {
        assert.equal(isObjectId({ $ne: null }), false)
        assert.equal(isObjectId('64b000000000000000000000'), true)
        assert.equal(isObjectId('64b00000000000000000000z'), false)
    })

    test('login with operator objects instead of strings is refused', async () => {
        limiters.login.reset(); limiters.loginIp.reset()
        const res = await post('/api/user/login', { email: { $gt: '' }, password: { $gt: '' } }, { 'X-Forwarded-For': '203.0.113.10' })
        const body = await res.json()
        assert.equal(body.success, false)
        assert.equal(body.token, undefined)
    })

    test('order pricing ignores client prices and rejects negative / fractional quantities', async () => {
        await assert.rejects(priceCartItems([{ _id: '64b000000000000000000000', quantity: -5 }]), /Invalid order details/)
        await assert.rejects(priceCartItems([{ _id: '64b000000000000000000000', quantity: 1.5 }]), /Invalid order details/)
        await assert.rejects(priceCartItems([{ _id: { $ne: null }, quantity: 1 }]), /Invalid order details/)
        await assert.rejects(priceCartItems([]), /Invalid order details/)
        await assert.rejects(priceCartItems('x'), /Invalid order details/)
    })

    test('server pricing matches the storefront formula', () => {
        assert.equal(getFormatPrice(500, 'Standard Paperback'), 500)
        assert.equal(getFormatPrice(500, 'Deluxe Hardcover'), 900)
        assert.equal(getFormatPrice(150, 'E-Book'), 100)
        assert.equal(computeOrderTotal(1000), 1000 + 100 + 20)
    })

    test('addresses are reduced to known string fields', () => {
        assert.equal(sanitizeAddress({ $set: { x: 1 } }), null)
        const clean = sanitizeAddress({ street: 'A', city: { $gt: '' }, evil: 'x' })
        assert.deepEqual(Object.keys(clean).sort(), ['city', 'street'])
        assert.equal(typeof clean.city, 'string')
    })

    test('Razorpay signatures are verified in constant time and forged ones fail', () => {
        const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_1|pay_1').digest('hex')
        assert.equal(verifyRazorpaySignature('order_1', 'pay_1', sig), true)
        assert.equal(verifyRazorpaySignature('order_2', 'pay_1', sig), false)
        assert.equal(verifyRazorpaySignature('order_1', 'pay_1', 'deadbeef'), false)
        assert.equal(verifyRazorpaySignature('order_1', 'pay_1', undefined), false)
    })

    test('safeEqual compares strings correctly', () => {
        assert.equal(safeEqual('abc', 'abc'), true)
        assert.equal(safeEqual('abc', 'abd'), false)
        assert.equal(safeEqual('abc', undefined), false)
    })
})

describe('XSS / HTML injection in e-mails', () => {
    test('escapeHtml neutralises markup', () => {
        assert.equal(escapeHtml('<img src=x onerror=alert(1)>"\''), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;')
    })

    test('e-mail template inputs are escaped deeply, recipient addresses are not', () => {
        const out = escapeDeep({
            name: '<b>x</b>',
            userEmail: 'a@b.co',
            items: [{ name: '<script>' }],
            address: { city: '"><a href=//evil>' },
            amount: 10,
        }, (k) => /(^email$|Email$|^to$|^otp$)/.test(k))
        assert.equal(out.name, '&lt;b&gt;x&lt;/b&gt;')
        assert.equal(out.userEmail, 'a@b.co')
        assert.equal(out.items[0].name, '&lt;script&gt;')
        assert.equal(out.address.city, '&quot;&gt;&lt;a href=//evil&gt;')
        assert.equal(out.amount, 10)
    })
})

describe('File uploads', () => {
    test('only real image signatures are accepted', () => {
        assert.equal(hasImageSignature(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), true) // PNG
        assert.equal(hasImageSignature(Buffer.from('ffd8ffe000104a4649460001', 'hex')), true) // JPEG
        assert.equal(hasImageSignature(Buffer.from('<?php system($_GET[c]); ?>')), false)
        assert.equal(hasImageSignature(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00')), false) // EXE
    })
})

describe('Video call signaling isolation', () => {
    const makeSocket = (data) => {
        const handlers = {}
        const emitted = []
        return {
            id: 'sock-' + Math.random(),
            data,
            currentRoom: null,
            handlers,
            emitted,
            on: (ev, fn) => { handlers[ev] = fn },
            to: (room) => ({ emit: (ev, payload) => emitted.push({ room, ev, payload }) }),
            join() {}, leave() {},
        }
    }

    test('a socket cannot inject chat, offers or ICE into a room it has not joined', () => {
        const ioEmits = []
        const io = { to: (room) => ({ emit: (ev, payload) => ioEmits.push({ room, ev, payload }) }) }
        const attacker = makeSocket({ userId: 'attacker', role: 'user', name: 'Mallory' })
        registerVideoCallHandlers(io, attacker)
        const victimRoom = '64b000000000000000000000'
        attacker.handlers['chat:message']({ room: victimRoom, text: 'Hi, please pay here: evil.link', senderName: 'Dr. Smith', senderRole: 'doctor' })
        attacker.handlers['webrtc:offer']({ room: victimRoom, offer: { type: 'offer', sdp: 'x' } })
        attacker.handlers['webrtc:ice-candidate']({ room: victimRoom, candidate: { candidate: 'x' } })
        assert.equal(ioEmits.length, 0)
        assert.equal(attacker.emitted.length, 0)
    })

    test('chat sender identity comes from the authenticated socket, not the payload', () => {
        const ioEmits = []
        const io = { to: (room) => ({ emit: (ev, payload) => ioEmits.push({ room, ev, payload }) }) }
        const patient = makeSocket({ userId: 'p1', role: 'user', name: 'Pat' })
        registerVideoCallHandlers(io, patient)
        patient.currentRoom = '64b000000000000000000001' // as set by a successful, authorised room:join
        patient.handlers['chat:message']({ room: patient.currentRoom, text: 'hello', senderName: 'Dr. Fake', senderRole: 'doctor' })
        assert.equal(ioEmits.length, 1)
        assert.equal(ioEmits[0].payload.senderName, 'Pat')
        assert.equal(ioEmits[0].payload.senderRole, 'patient')
    })
})
