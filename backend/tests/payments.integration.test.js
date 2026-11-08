/**
 * Integration tests for the payment / wallet / account-takeover fixes, run against a
 * throw-away in-memory MongoDB. Razorpay's HTTP layer is stubbed — no real payment API is called.
 *
 * Each test reproduces an attack from the security audit and asserts it now fails.
 */
import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

process.env.NODE_ENV = 'production'
process.env.JWT_SECRET = 'integration-secret-'.padEnd(64, 'y')
process.env.ADMIN_EMAIL = 'admin@example.test'
process.env.ADMIN_PASSWORD = 'admin-password-123'
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy'
process.env.RAZORPAY_KEY_SECRET = 'razorpay-test-secret'
process.env.CURRENCY = 'INR'
process.env.CORS_ORIGINS = 'https://app.example.test'
delete process.env.BREVO_API_KEY
delete process.env.SMTP_USER

// ── Razorpay stub (patches the SDK's HTTP layer) ──────────────────────────────
const require = createRequire(import.meta.url)
const RazorpayAPI = require('razorpay/dist/api.js')
const rzpOrders = new Map()
const rzpRefunds = []
RazorpayAPI.prototype.post = async function (params) {
    if (params.url === '/orders') {
        const order = { id: 'order_' + crypto.randomBytes(6).toString('hex'), status: 'created', ...params.data }
        rzpOrders.set(order.id, order)
        return order
    }
    if (/\/payments\/.+\/refund/.test(params.url)) { rzpRefunds.push(params); return { id: 'rfnd_1' } }
    throw new Error('Unexpected Razorpay call ' + params.url)
}
RazorpayAPI.prototype.get = async function (params) {
    const id = params.url.split('/').pop()
    const order = rzpOrders.get(id)
    if (!order) throw new Error('order not found')
    return order
}
const payOrder = (orderId) => { rzpOrders.get(orderId).status = 'paid'; return 'pay_' + crypto.randomBytes(5).toString('hex') }
const sign = (orderId, paymentId) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')

// ── App + database ────────────────────────────────────────────────────────────
const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongoose = (await import('mongoose')).default
const bcrypt = (await import('bcrypt')).default
const { createApp } = await import('../app.js')
const { signToken } = await import('../utils/tokens.js')
const { hashOtp } = await import('../utils/security.js')
const { limiters } = await import('../middlewares/rateLimit.js')
const userModel = (await import('../models/userModel.js')).default
const doctorModel = (await import('../models/doctorModel.js')).default
const bookModel = (await import('../models/bookModel.js')).default
const orderModel = (await import('../models/orderModel.js')).default
const appointmentModel = (await import('../models/appointmentModel.js')).default

let mongod, server, base

before(async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
    await appointmentModel.syncIndexes()
    server = createApp().listen(0)
    await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
    server?.close()
    await mongoose.disconnect()
    await mongod?.stop()
})

beforeEach(async () => {
    Object.values(limiters).forEach(l => l.reset())
    await Promise.all([userModel, doctorModel, bookModel, orderModel, appointmentModel].map(m => m.deleteMany({})))
})

const api = async (method, url, { body, token, dtoken } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.token = token
    if (dtoken) headers.dtoken = dtoken
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, ...(await res.json()) }
}

const makeUser = async (overrides = {}) => {
    const user = await userModel.create({
        name: 'Test User', email: `u${crypto.randomBytes(4).toString('hex')}@example.test`,
        password: await bcrypt.hash('Password123', 4), emailVerified: true, profileCompleted: true, ...overrides,
    })
    return { user, token: signToken('user', user._id, user.tokenVersion || 0) }
}
const makeDoctor = (overrides = {}) => doctorModel.create({
    name: 'Dr. Test', email: `d${crypto.randomBytes(4).toString('hex')}@example.test`, password: 'x', image: 'x',
    speciality: 'Clinical Psychologist', degree: 'PhD', experience: '5 Years', about: 'About', fees: 500,
    address: { line1: 'a' }, date: Date.now(), ...overrides,
})
const makeBook = () => bookModel.create({ title: 'Atomic Habits', author: 'A', description: 'D', price: 500, category: 'Mental Health', image: ['x'], date: Date.now() })
const ADDRESS = { firstName: 'T', street: '1 Main St', city: 'X', zipcode: '1', country: 'India' }
const balance = async (id) => (await userModel.findById(id).lean()).therapiqueCoins

describe('C1/C2 — book order price tampering & coin minting', () => {
    test('negative amount can no longer mint coins (tokens order)', async () => {
        const book = await makeBook()
        const { user, token } = await makeUser({ therapiqueCoins: 100 })
        const res = await api('POST', '/api/user/place-book-order-tokens', {
            token, body: { items: [{ _id: String(book._id), quantity: 1, price: 0 }], amount: -100000, address: ADDRESS },
        })
        assert.equal(res.success, false)
        assert.match(res.message, /Insufficient/)
        assert.equal(await balance(user._id), 100, 'balance must be unchanged')
    })

    test('tokens order is charged the server price, not the client amount', async () => {
        const book = await makeBook()
        const { user, token } = await makeUser({ therapiqueCoins: 1000 })
        const res = await api('POST', '/api/user/place-book-order-tokens', {
            token, body: { items: [{ _id: String(book._id), quantity: 1, price: 1, name: 'Atomic Habits (Standard Paperback)' }], amount: 1, address: ADDRESS },
        })
        assert.equal(res.success, true)
        assert.equal(await balance(user._id), 1000 - 610) // 500 + 100 delivery + 2% tax
        const order = await orderModel.findOne({ userId: String(user._id) }).lean()
        assert.equal(order.amount, 610)
        assert.equal(order.items[0].price, 500)
    })

    test('Razorpay book order is created for the server-computed amount', async () => {
        const book = await makeBook()
        const { token } = await makeUser()
        const res = await api('POST', '/api/user/create-book-order-razorpay', {
            token, body: { items: [{ _id: String(book._id), quantity: 2, format: 'Deluxe Hardcover' }], amount: 1, address: ADDRESS },
        })
        assert.equal(res.success, true)
        assert.equal(res.order.amount, Math.round((1800 + 100 + 36) * 100))
    })

    test('COD order ignores the client amount', async () => {
        const book = await makeBook()
        const { user, token } = await makeUser()
        await api('POST', '/api/user/place-book-order-cod', { token, body: { items: [{ _id: String(book._id), quantity: 1 }], amount: 1, address: ADDRESS } })
        assert.equal((await orderModel.findOne({ userId: String(user._id) }).lean()).amount, 610)
    })

    test('unverified accounts cannot place orders', async () => {
        const book = await makeBook()
        const { token } = await makeUser({ emailVerified: false })
        const res = await api('POST', '/api/user/place-book-order-cod', { token, body: { items: [{ _id: String(book._id), quantity: 1 }], address: ADDRESS } })
        assert.equal(res.success, false)
        assert.match(res.message, /verify your email/)
    })
})

describe('H1 — marking another order as paid', () => {
    test('a payment for order A cannot mark order B as paid', async () => {
        const book = await makeBook()
        const { token } = await makeUser()
        const cheap = await api('POST', '/api/user/create-book-order-razorpay', { token, body: { items: [{ _id: String(book._id), quantity: 1 }], address: ADDRESS } })
        const pricey = await api('POST', '/api/user/create-book-order-razorpay', { token, body: { items: [{ _id: String(book._id), quantity: 10 }], address: ADDRESS } })
        const paymentId = payOrder(cheap.order.id)
        const res = await api('POST', '/api/user/verify-book-order-razorpay', {
            token, body: { razorpay_order_id: cheap.order.id, razorpay_payment_id: paymentId, razorpay_signature: sign(cheap.order.id, paymentId), orderId: pricey.orderId },
        })
        assert.equal(res.success, false)
        assert.equal((await orderModel.findById(pricey.orderId).lean()).payment, false)
        // the genuine verification still works
        const ok = await api('POST', '/api/user/verify-book-order-razorpay', {
            token, body: { razorpay_order_id: cheap.order.id, razorpay_payment_id: paymentId, razorpay_signature: sign(cheap.order.id, paymentId), orderId: cheap.orderId },
        })
        assert.equal(ok.success, true)
    })

    test("another user's order cannot be verified", async () => {
        const book = await makeBook()
        const victim = await makeUser()
        const attacker = await makeUser()
        const created = await api('POST', '/api/user/create-book-order-razorpay', { token: victim.token, body: { items: [{ _id: String(book._id), quantity: 1 }], address: ADDRESS } })
        const paymentId = payOrder(created.order.id)
        const res = await api('POST', '/api/user/verify-book-order-razorpay', {
            token: attacker.token, body: { razorpay_order_id: created.order.id, razorpay_payment_id: paymentId, razorpay_signature: sign(created.order.id, paymentId), orderId: created.orderId },
        })
        assert.equal(res.success, false)
    })
})

describe('C5 — coin purchase replay', () => {
    test('replaying the same paid order credits coins only once', async () => {
        const { user, token } = await makeUser()
        const created = await api('POST', '/api/user/purchase-coins', { token, body: { coinPackage: 'standard' } })
        assert.equal(created.success, true)
        const paymentId = payOrder(created.order.id)
        const body = { razorpay_order_id: created.order.id, razorpay_payment_id: paymentId, razorpay_signature: sign(created.order.id, paymentId) }
        const results = await Promise.all(Array.from({ length: 5 }, () => api('POST', '/api/user/verify-coins-payment', { token, body })))
        assert.ok(results.every(r => r.success))
        assert.equal(await balance(user._id), 550)
    })

    test("another user's coin order cannot be redeemed", async () => {
        const victim = await makeUser()
        const attacker = await makeUser()
        const created = await api('POST', '/api/user/purchase-coins', { token: victim.token, body: { coinPackage: 'basic' } })
        const paymentId = payOrder(created.order.id)
        const res = await api('POST', '/api/user/verify-coins-payment', {
            token: attacker.token, body: { razorpay_order_id: created.order.id, razorpay_payment_id: paymentId, razorpay_signature: sign(created.order.id, paymentId) },
        })
        assert.equal(res.success, false)
        assert.equal(await balance(attacker.user._id), 0)
    })

    test('forged signature is rejected', async () => {
        const { token } = await makeUser()
        const created = await api('POST', '/api/user/purchase-coins', { token, body: { coinPackage: 'mega' } })
        const res = await api('POST', '/api/user/verify-coins-payment', { token, body: { razorpay_order_id: created.order.id, razorpay_payment_id: 'pay_x', razorpay_signature: 'f'.repeat(64) } })
        assert.equal(res.success, false)
    })
})

describe('Race conditions — double refunds and double spending', () => {
    const coinAppointment = async (user, doctor, extra = {}) => appointmentModel.create({
        userId: String(user._id), docId: String(doctor._id), slotDate: '20_12_2030', slotTime: '10:00 AM',
        userData: { name: user.name }, docData: { name: doctor.name }, amount: 500, date: Date.now(),
        payment: true, paidWithCoins: true, ...extra,
    })

    test('concurrent cancellations refund only once', async () => {
        const { user, token } = await makeUser({ therapiqueCoins: 0 })
        const doctor = await makeDoctor()
        const appt = await coinAppointment(user, doctor)
        await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/user/cancel-appointment', { token, body: { appointmentId: String(appt._id) } })))
        assert.equal(await balance(user._id), 500)
    })

    test('concurrent refund claims credit only once', async () => {
        const { user, token } = await makeUser({ therapiqueCoins: 0 })
        const doctor = await makeDoctor()
        const appt = await coinAppointment(user, doctor, { paidWithCoins: false, cancelled: true, refundStatus: 'pending_choice' })
        await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/user/claim-refund', { token, body: { appointmentId: String(appt._id), refundChoice: 'tokens' } })))
        assert.equal(await balance(user._id), 500)
    })

    test('concurrent coin bookings cannot overdraw the wallet', async () => {
        const { user, token } = await makeUser({ therapiqueCoins: 600 })
        const doctor = await makeDoctor({ fees: 500 })
        const times = ['09:00 AM', '12:00 PM', '03:00 PM', '06:00 PM']
        const results = await Promise.all(times.map(slotTime => api('POST', '/api/user/book-appointment-coins', {
            token, body: { docId: String(doctor._id), slotDate: '21_12_2030', slotTime },
        })))
        assert.equal(results.filter(r => r.success).length, 1)
        assert.equal(await balance(user._id), 100)
        assert.equal(await appointmentModel.countDocuments({ userId: String(user._id) }), 1)
    })

    test('admin double-cancel does not refund twice', async () => {
        const { user } = await makeUser({ therapiqueCoins: 0 })
        const doctor = await makeDoctor()
        const appt = await coinAppointment(user, doctor)
        const { signAdminToken } = await import('../utils/tokens.js')
        const headers = { 'Content-Type': 'application/json', atoken: signAdminToken() }
        await Promise.all([1, 2, 3].map(() => fetch(base + '/api/admin/cancel-appointment', { method: 'POST', headers, body: JSON.stringify({ appointmentId: String(appt._id) }) })))
        assert.equal(await balance(user._id), 500)
    })
})

describe('Authorization (IDOR / BOLA)', () => {
    test("a user cannot cancel or view another user's appointment/order", async () => {
        const victim = await makeUser({ therapiqueCoins: 0 })
        const attacker = await makeUser()
        const doctor = await makeDoctor()
        const appt = await appointmentModel.create({ userId: String(victim.user._id), docId: String(doctor._id), slotDate: '1_1_2031', slotTime: '10:00 AM', userData: {}, docData: {}, amount: 500, date: Date.now() })
        const cancel = await api('POST', '/api/user/cancel-appointment', { token: attacker.token, body: { appointmentId: String(appt._id) } })
        assert.equal(cancel.success, false)
        assert.equal((await appointmentModel.findById(appt._id).lean()).cancelled, false)

        const order = await orderModel.create({ userId: String(victim.user._id), items: [], amount: 1, address: {}, paymentMethod: 'COD', date: Date.now() })
        const view = await api('GET', `/api/user/order/${order._id}`, { token: attacker.token })
        assert.equal(view.success, false)
    })

    test("a user cannot pay-verify another user's appointment", async () => {
        const victim = await makeUser()
        const attacker = await makeUser()
        const doctor = await makeDoctor()
        const appt = await appointmentModel.create({ userId: String(victim.user._id), docId: String(doctor._id), slotDate: '2_1_2031', slotTime: '10:00 AM', userData: {}, docData: {}, amount: 500, date: Date.now() })
        const order = { id: 'order_manual' }
        rzpOrders.set(order.id, { id: order.id, status: 'paid', amount: 50000, receipt: String(appt._id) })
        const res = await api('POST', '/api/user/verifyRazorpay', { token: attacker.token, body: { razorpay_order_id: order.id, razorpay_payment_id: 'pay_1', razorpay_signature: sign(order.id, 'pay_1') } })
        assert.equal(res.success, false)
        // without a valid signature even the owner cannot mark it paid
        const unsigned = await api('POST', '/api/user/verifyRazorpay', { token: victim.token, body: { razorpay_order_id: order.id } })
        assert.equal(unsigned.success, false)
        assert.equal((await appointmentModel.findById(appt._id).lean()).payment, false)
    })

    test('doctors cannot set negative fees', async () => {
        const doctor = await makeDoctor()
        const dtoken = signToken('doctor', doctor._id, 0)
        const res = await api('POST', '/api/doctor/update-profile', { dtoken, body: { fees: -500 } })
        assert.equal(res.success, false)
        assert.equal((await doctorModel.findById(doctor._id).lean()).fees, 500)
    })
})

describe('C3 — password reset brute force & session revocation', () => {
    test('reset code is destroyed after 5 wrong guesses', async () => {
        const { user } = await makeUser()
        await userModel.updateOne({ _id: user._id }, { verifyOtp: hashOtp('123456'), verifyOtpExpireAt: Date.now() + 600000, verifyOtpAttempts: 0 })
        for (let i = 0; i < 5; i++) {
            await api('POST', '/api/user/reset-password', { body: { email: user.email, otp: String(200000 + i), newPassword: 'Hacked12345' } })
        }
        const res = await api('POST', '/api/user/reset-password', { body: { email: user.email, otp: '123456', newPassword: 'Hacked12345' } })
        assert.equal(res.success, false, 'the real code must no longer work after 5 failures')
        const fresh = await userModel.findById(user._id)
        assert.equal(await bcrypt.compare('Password123', fresh.password), true)
    })

    test('forgot-password does not reveal whether an account exists', async () => {
        const { user } = await makeUser()
        const known = await api('POST', '/api/user/forgot-password', { body: { email: user.email } })
        const unknown = await api('POST', '/api/user/forgot-password', { body: { email: 'nobody@example.test' } })
        assert.equal(known.message, unknown.message)
        assert.equal(known.success, unknown.success)
    })

    test('login does not reveal whether an account exists', async () => {
        const { user } = await makeUser()
        const wrongPw = await api('POST', '/api/user/login', { body: { email: user.email, password: 'wrong-password' } })
        const noUser = await api('POST', '/api/user/login', { body: { email: 'nobody@example.test', password: 'wrong-password' } })
        assert.equal(wrongPw.message, noUser.message)
    })

    test('changing the password revokes old tokens and returns a working new one', async () => {
        const { token } = await makeUser()
        const res = await api('POST', '/api/user/change-password', { token, body: { currentPassword: 'Password123', newPassword: 'BrandNew12345' } })
        assert.equal(res.success, true)
        assert.equal((await api('GET', '/api/user/get-profile', { token })).success, false)
        assert.equal((await api('GET', '/api/user/get-profile', { token: res.token })).success, true)
    })

    test('profile responses never include OTP hashes or token versions', async () => {
        const { token, user } = await makeUser()
        await userModel.updateOne({ _id: user._id }, { verifyOtp: hashOtp('111111') })
        const res = await api('GET', '/api/user/get-profile', { token })
        assert.equal(res.success, true)
        for (const field of ['password', 'verifyOtp', 'verifyOtpExpireAt', 'verifyOtpAttempts', 'tokenVersion']) {
            assert.equal(field in res.userData, false, `${field} leaked`)
        }
    })
})
