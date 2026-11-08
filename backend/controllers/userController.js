import bcrypt from "bcrypt";
import validator from "validator";
import userModel from "../models/userModel.js";
import contactModel from "../models/contactModel.js";
import { v2 as cloudinary } from 'cloudinary'
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import razorpay from 'razorpay';
import crypto from 'crypto';
import orderModel from "../models/orderModel.js";
import {
    sendAppointmentBookingEmail,
    sendDoctorNewAppointmentAlert,
    sendAppointmentCancellationEmail,
    sendRefundConfirmedEmail,
    sendBookOrderPlacedEmail,
    sendOrderStatusUpdateEmail,
    sendContactFormEmails,
    sendNewsletterEmails,
    sendUserRegistrationEmails,
    sendSignupOtpEmail,
    sendPasswordResetOtpEmail
} from '../services/emailService.js';
import { COIN_PACKAGES } from '../constants/coinPackages.js';
import newsletterModel from "../models/newsletterModel.js";
import { getAppointmentJoinStatus, normalizeSlotTime, normalizeSlotDate, checkSlotConflict } from "../utils/appointmentTiming.js";
import { signToken } from "../utils/tokens.js";
import { clientError, isObjectId, isNonEmptyString, verifyRazorpaySignature, generateOtp, hashOtp } from "../utils/security.js";
import { creditCoins, debitCoins, creditPurchasedCoinsOnce } from "../utils/coins.js";
import { priceCartItems, sanitizeAddress } from "../utils/orderPricing.js";

// Fields that must never leave the server or be copied into appointment snapshots
const PRIVATE_USER_FIELDS = '-password -verifyOtp -verifyOtpExpireAt -verifyOtpAttempts -verifyOtpLastSentAt -tokenVersion';
const USER_SNAPSHOT_FIELDS = `${PRIVATE_USER_FIELDS} -coinsTransactions -therapiqueCoins`;
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const BCRYPT_ROUNDS = 12;

const hashPassword = async (password) => bcrypt.hash(password, await bcrypt.genSalt(BCRYPT_ROUNDS));
const isValidPassword = (password) => typeof password === 'string' && password.length >= 8 && password.length <= 128;
const normalizeEmail = (email) => (typeof email === 'string' ? email.toLowerCase().trim() : '');

/** Builds immutable appointment snapshots without private fields. */
const buildDoctorSnapshot = (docData) => {
    const snapshot = docData.toObject ? docData.toObject() : { ...docData };
    delete snapshot.slots_booked;
    delete snapshot.password;
    delete snapshot.tokenVersion;
    return snapshot;
};

// API to register user
const registerUser = async (req, res) => {

    try {
        const { name, email, password } = req.body;

        // checking for all data to register user
        if (!isNonEmptyString(name, 100) || typeof email !== 'string' || typeof password !== 'string') {
            return res.json({ success: false, message: 'Missing Details' })
        }

        // validating email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }

        // validating strong password
        if (!isValidPassword(password)) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        const normalizedEmail = email.toLowerCase().trim();
        const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Check if user already exists (case-insensitive)
        const exists = await userModel.findOne({ 
            email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } 
        });
        if (exists) {
            // If the account was already created but is not yet email-verified, refresh OTP and allow verification
            if (exists.emailVerified === false) {
                const { otp, hash: hashedOtp } = generateOtp();

                exists.name = name.trim() || exists.name;
                exists.password = await hashPassword(password);
                exists.verifyOtp = hashedOtp;
                exists.verifyOtpExpireAt = Date.now() + OTP_TTL_MS;
                exists.verifyOtpAttempts = 0;
                exists.verifyOtpLastSentAt = Date.now();
                // Revoke any token issued for the previous (unverified) registration
                exists.tokenVersion = (exists.tokenVersion || 0) + 1;
                await exists.save();

                const token = signToken('user', exists._id, exists.tokenVersion);

                sendSignupOtpEmail({
                    email: exists.email,
                    name: exists.name,
                    otp
                }).catch(err => console.log('OTP email error:', err.message));

                return res.json({
                    success: true,
                    token,
                    message: "A new verification code has been sent to your email.",
                    userData: {
                        _id: exists._id,
                        name: exists.name,
                        email: exists.email,
                        emailVerified: false,
                        profileCompleted: false
                    }
                });
            }
            return res.json({ success: false, message: "An account with this email already exists. Please log in instead." });
        }

        // hashing user password
        const hashedPassword = await hashPassword(password)

        // Generate 6-digit numeric OTP and SHA-256 hash
        const { otp, hash: hashedOtp } = generateOtp();

        const userData = {
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            profileCompleted: false,
            emailVerified: false,
            verifyOtp: hashedOtp,
            verifyOtpExpireAt: Date.now() + OTP_TTL_MS,
            verifyOtpAttempts: 0,
            verifyOtpLastSentAt: Date.now()
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()
        const token = signToken('user', user._id, user.tokenVersion || 0)

        // Send OTP verification email to user
        const emailRes = await sendSignupOtpEmail({
            email: user.email,
            name: user.name,
            otp
        });

        if (emailRes && emailRes.success === false) {
            return res.json({
                success: false,
                message: "Account created, but verification email failed to send. Please check your email or click Resend Code."
            });
        }

        // Send Welcome email to user and alert to admin
        sendUserRegistrationEmails({
            name: user.name,
            email: user.email,
            userId: user._id
        }).catch(err => console.log('Registration email error:', err.message));

        res.json({
            success: true,
            token,
            userData: {
                _id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: false,
                profileCompleted: false
            }
        })

    } catch (error) {
        console.log(error)
        if (error.code === 11000) {
            return res.json({ success: false, message: "An account with this email already exists. Please log in instead." });
        }
        res.json({ success: false, message: clientError(error) })
    }
}

// API to verify email OTP
const verifyEmailOtp = async (req, res) => {
    try {
        const { userId, otp } = req.body;

        if (!userId) {
            return res.json({ success: false, message: "Authentication required" });
        }

        if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
            return res.json({ success: false, message: "Please provide a valid 6-digit verification code" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        const alreadyVerified = user.emailVerified !== undefined ? user.emailVerified : true;
        if (alreadyVerified && user.verifyOtp === "") {
            return res.json({
                success: true,
                message: "Email is already verified",
                userData: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    emailVerified: true,
                    profileCompleted: user.profileCompleted !== undefined ? user.profileCompleted : true
                }
            });
        }

        // Check maximum failed attempts
        if (user.verifyOtpAttempts >= 5) {
            user.verifyOtp = "";
            user.verifyOtpExpireAt = 0;
            await user.save();
            return res.json({ success: false, message: "Too many failed attempts. Please request a new verification code." });
        }

        // Check expiration
        if (!user.verifyOtpExpireAt || Date.now() > user.verifyOtpExpireAt) {
            return res.json({ success: false, message: "This verification code has expired. Please request a new one." });
        }

        // Compare SHA-256 hash
        const inputHash = hashOtp(otp);

        if (inputHash !== user.verifyOtp) {
            user.verifyOtpAttempts = (user.verifyOtpAttempts || 0) + 1;
            await user.save();
            return res.json({ success: false, message: "Invalid verification code. Please try again." });
        }

        // Correct OTP: Mark verified and invalidate OTP
        user.emailVerified = true;
        user.verifyOtp = "";
        user.verifyOtpExpireAt = 0;
        user.verifyOtpAttempts = 0;
        await user.save();

        const profileCompleted = user.profileCompleted !== undefined ? user.profileCompleted : false;

        return res.json({
            success: true,
            message: "Email verified successfully",
            userData: {
                _id: user._id,
                name: user.name,
                email: user.email,
                emailVerified: true,
                profileCompleted
            }
        });
    } catch (error) {
        console.log('verifyEmailOtp error:', error);
        return res.json({ success: false, message: clientError(error) });
    }
};

// API to resend email OTP
const resendEmailOtp = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.json({ success: false, message: "Authentication required" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        const isVerified = user.emailVerified !== undefined ? user.emailVerified : false;
        if (isVerified && user.verifyOtp === "") {
            return res.json({ success: false, message: "Email is already verified" });
        }

        // 60-second cooldown enforcement
        const cooldownMs = 60 * 1000;
        const timePassed = Date.now() - (user.verifyOtpLastSentAt || 0);
        if (timePassed < cooldownMs) {
            const remainingSec = Math.ceil((cooldownMs - timePassed) / 1000);
            return res.json({ success: false, message: `Please wait ${remainingSec}s before requesting a new code.` });
        }

        // Generate new 6-digit OTP and update hash
        const { otp, hash: hashedOtp } = generateOtp();

        user.verifyOtp = hashedOtp;
        user.verifyOtpExpireAt = Date.now() + OTP_TTL_MS;
        user.verifyOtpAttempts = 0;
        user.verifyOtpLastSentAt = Date.now();
        await user.save();

        const emailRes = await sendSignupOtpEmail({
            email: user.email,
            name: user.name,
            otp
        });

        if (emailRes && emailRes.success === false) {
            return res.json({ success: false, message: "Failed to send verification email. Please try again." });
        }

        return res.json({ success: true, message: "A new verification code has been sent to your email." });
    } catch (error) {
        console.log('resendEmailOtp error:', error);
        return res.json({ success: false, message: clientError(error) });
    }
};

// API to login user
const loginUser = async (req, res) => {

    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.json({ success: false, message: "Please provide email and password" })
        }

        const normalizedEmail = normalizeEmail(email);
        const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const user = await userModel.findOne({
            email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
        });

        // Same response for unknown e-mail and wrong password (prevents account enumeration)
        const isMatch = user ? await bcrypt.compare(password, user.password) : false

        if (isMatch) {
            const token = signToken('user', user._id, user.tokenVersion || 0)
            const emailVerified = user.emailVerified !== undefined ? user.emailVerified : true
            const profileCompleted = user.profileCompleted !== undefined ? user.profileCompleted : true
            res.json({
                success: true,
                token,
                userData: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    emailVerified,
                    profileCompleted
                }
            })
        }
        else {
            res.json({ success: false, message: "Invalid email or password" })
        }
    } catch (error) {
        console.error('loginUser error:', error.message)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to get user profile data
const getProfile = async (req, res) => {

    try {
        const { userId } = req.body
        const user = await userModel.findById(userId).select(PRIVATE_USER_FIELDS).lean()
        if (!user) {
            return res.json({ success: false, message: "User not found" })
        }

        const emailVerified = user.emailVerified !== undefined ? user.emailVerified : true
        const profileCompleted = user.profileCompleted !== undefined ? user.profileCompleted : true
        const userData = {
            ...user,
            emailVerified,
            profileCompleted
        }

        res.json({ success: true, userData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

const updateProfile = async (req, res) => {
    try {
        const userId = req.userId || req.body.userId
        const { name, phone, address, dob, gender, profileCompleted, wellnessGoal, supportAreas, therapyPreference } = req.body
        const imageFile = req.file

        if (!userId) {
            return res.json({ success: false, message: "User ID missing or unauthorized" })
        }

        let parsedAddress = address
        if (typeof address === 'string') {
            try {
                parsedAddress = JSON.parse(address)
            } catch (e) {
                parsedAddress = address
            }
        }

        let parsedSupportAreas = supportAreas
        if (typeof supportAreas === 'string') {
            try {
                parsedSupportAreas = JSON.parse(supportAreas)
            } catch (e) {
                parsedSupportAreas = supportAreas.split(',').map(s => s.trim()).filter(Boolean)
            }
        }

        const str = (v, max) => String(v ?? '').slice(0, max)
        const updateData = {}
        if (name !== undefined) {
            if (!isNonEmptyString(String(name), 100)) return res.json({ success: false, message: "Please enter a valid name" })
            updateData.name = str(name, 100).trim()
        }
        if (phone !== undefined) updateData.phone = str(phone, 20)
        if (parsedAddress !== undefined) {
            if (parsedAddress === null || typeof parsedAddress !== 'object' || Array.isArray(parsedAddress)) {
                return res.json({ success: false, message: "Invalid address" })
            }
            updateData.address = Object.fromEntries(Object.entries(parsedAddress).slice(0, 15).map(([k, v]) => [str(k, 40), str(v, 200)]))
        }
        if (dob !== undefined) updateData.dob = str(dob, 30)
        if (gender !== undefined) updateData.gender = str(gender, 30)
        if (profileCompleted !== undefined) {
            updateData.profileCompleted = profileCompleted === true || profileCompleted === 'true'
        }
        if (wellnessGoal !== undefined) updateData.wellnessGoal = str(wellnessGoal, 500)
        if (parsedSupportAreas !== undefined) {
            updateData.supportAreas = (Array.isArray(parsedSupportAreas) ? parsedSupportAreas : [parsedSupportAreas]).slice(0, 20).map(a => str(a, 100))
        }
        if (therapyPreference !== undefined) updateData.therapyPreference = str(therapyPreference, 200)

        if (imageFile) {
            // upload image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
            updateData.image = imageUpload.secure_url
        }

        const updatedUser = await userModel.findByIdAndUpdate(userId, updateData, { new: true }).select(PRIVATE_USER_FIELDS).lean()
        const resolvedProfileCompleted = updatedUser.profileCompleted !== undefined ? updatedUser.profileCompleted : true

        // Synchronize updated user profile image & info across all their past & active appointments
        const appointmentUserUpdates = {}
        if (updateData.image) appointmentUserUpdates["userData.image"] = updateData.image
        if (updateData.name) appointmentUserUpdates["userData.name"] = updateData.name
        if (updateData.phone) appointmentUserUpdates["userData.phone"] = updateData.phone
        if (updateData.dob) appointmentUserUpdates["userData.dob"] = updateData.dob
        if (updateData.gender) appointmentUserUpdates["userData.gender"] = updateData.gender
        if (Object.keys(appointmentUserUpdates).length > 0) {
            await appointmentModel.updateMany({ userId }, { $set: appointmentUserUpdates }).catch(err => console.log("Appointment user sync error:", err.message))
        }

        res.json({ success: true, message: 'Profile Updated', userData: { ...updatedUser, profileCompleted: resolvedProfileCompleted } })

    } catch (error) {
        console.log("Error in updateProfile:", error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to get user appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
    try {

        const { userId } = req.body
        const appointments = await appointmentModel.find({ userId }).sort({ date: -1 }).lean()

        // Fetch latest doctor profiles to ensure doctor profile pictures and details are always up-to-date across all appointments
        const docIds = [...new Set(appointments.map(a => a.docId).filter(Boolean))]
        const doctors = await doctorModel.find({ _id: { $in: docIds } }).select('image name speciality address fees').lean()
        const docMap = new Map(doctors.map(d => [d._id.toString(), d]))

        const updatedAppointments = appointments.map(app => {
            const doc = docMap.get(app.docId?.toString())
            if (doc) {
                return {
                    ...app,
                    docData: {
                        ...app.docData,
                        image: doc.image || app.docData?.image,
                        name: doc.name || app.docData?.name,
                        speciality: doc.speciality || app.docData?.speciality,
                        address: doc.address || app.docData?.address,
                        fees: doc.fees !== undefined ? doc.fees : app.docData?.fees
                    }
                }
            }
            return app
        })

        res.json({ success: true, appointments: updatedAppointments })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to cancel appointment
const cancelAppointment = async (req, res) => {
    try {

        const { userId, appointmentId, refundChoice } = req.body
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: 'Appointment already cancelled or not found' })
        }

        // Atomically flip cancelled=false -> true for the owner's appointment.
        // Only ONE concurrent request can win, so refunds can never be issued twice.
        const appointmentData = await appointmentModel.findOneAndUpdate(
            { _id: appointmentId, userId, cancelled: false },
            { $set: { cancelled: true } },
            { new: false }
        )

        if (!appointmentData) {
            const existing = await appointmentModel.findById(appointmentId).select('userId').lean()
            if (existing && existing.userId !== userId) {
                return res.json({ success: false, message: 'Unauthorized action' })
            }
            return res.json({ success: false, message: 'Appointment already cancelled or not found' })
        }

        // Fetch patient info for cancellation email
        const patientUser = await userModel.findById(userId).select('email name');

        // releasing doctor slot
        const { docId, slotDate, slotTime, payment, amount, paidWithCoins } = appointmentData
        const normalizedSlotDate = normalizeSlotDate(slotDate)
        const normalizedSlotTime = normalizeSlotTime(slotTime)

        const doctorData = await doctorModel.findById(docId)

        if (doctorData) {
            let slots_booked = doctorData.slots_booked || {}
            if (slots_booked[normalizedSlotDate]) {
                slots_booked[normalizedSlotDate] = slots_booked[normalizedSlotDate].filter(
                    e => normalizeSlotTime(e) !== normalizedSlotTime
                )
                await doctorModel.findByIdAndUpdate(docId, { slots_booked })
            }
        }

        const sendCancellationEmail = (extra) => sendAppointmentCancellationEmail({
            appointmentId,
            patientEmail: patientUser?.email, patientName: patientUser?.name,
            doctorEmail: doctorData?.email, doctorName: doctorData?.name,
            slotDate, slotTime,
            cancelledBy: 'user',
            ...extra
        }).catch(e => console.log('Email error:', e.message));

        const refundAsTokens = async () => {
            const user = await creditCoins(userId, amount, {
                description: `Refund for Cancelled Appointment (Dr. ${doctorData?.name || 'Doctor'})`,
                appointmentId: String(appointmentId)
            })
            await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'refunded_tokens' })
            return user
        }

        // Handle Refunds if payment was completed
        if (payment && amount > 0) {
            if (paidWithCoins || refundChoice === 'tokens') {
                // Refund as Tokens directly to user wallet
                const user = await refundAsTokens()
                sendCancellationEmail({ refundMessage: `${amount} Therapique Tokens refunded to your wallet.` })
                return res.json({
                    success: true,
                    message: `Appointment Cancelled. ${amount} Therapique Tokens refunded to your wallet!`,
                    therapiqueCoins: user?.therapiqueCoins || 0,
                    refundedCoins: amount
                })
            } else if (refundChoice === 'bank') {
                // User chose direct Bank / UPI Refund via Razorpay
                try {
                    if (appointmentData.paymentId && razorpayInstance) {
                        await razorpayInstance.payments.refund(appointmentData.paymentId, {
                            amount: amount * 100,
                            speed: "optimum",
                            notes: { reason: "Appointment cancelled by user" }
                        })
                        await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'refunded_bank' })
                        sendCancellationEmail({ refundMessage: `₹${amount} refund initiated to your bank/UPI via Razorpay.` })
                        const user = await userModel.findById(userId).select('therapiqueCoins')
                        return res.json({
                            success: true,
                            message: `Appointment Cancelled. ₹${amount} refund initiated directly to your bank / UPI account via Razorpay!`,
                            therapiqueCoins: user?.therapiqueCoins || 0
                        })
                    }
                } catch (razorpayErr) {
                    console.log("Razorpay Bank Refund API fallback to wallet:", razorpayErr.message)
                }

                // Fallback: If Razorpay API key is in test mode or no paymentId exists, refund as 1:1 Tokens
                const user = await refundAsTokens()
                sendCancellationEmail({ refundMessage: `₹${amount} credited as ${amount} Tokens to your wallet.` })
                return res.json({
                    success: true,
                    message: `Appointment Cancelled. ₹${amount} credited as ${amount} Tokens to your wallet!`,
                    therapiqueCoins: user?.therapiqueCoins || 0,
                    refundedCoins: amount
                })
            } else {
                // User cancelled without specifying choice -> mark pending_choice
                await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'pending_choice' });
                sendCancellationEmail({ needsRefundChoice: true, amount });
                const currentUser = await userModel.findById(userId).select('therapiqueCoins')
                return res.json({
                    success: true,
                    message: 'Appointment Cancelled. Please choose your refund method on the website.',
                    therapiqueCoins: currentUser?.therapiqueCoins || 0
                });
            }
        }

        // No-payment cancellation email
        await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'none' })
        sendCancellationEmail({})
        const currentUser = await userModel.findById(userId).select('therapiqueCoins')
        res.json({ success: true, message: 'Appointment Cancelled', therapiqueCoins: currentUser?.therapiqueCoins || 0 })

    } catch (error) {
        console.error('cancelAppointment error:', error.message)
        res.json({ success: false, message: clientError(error) })
    }
}




const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
})

//Api to make payment of appointment using Razorpay
const paymentRazorpay = async (req, res) => {
    try {

        const { userId, appointmentId } = req.body
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: 'Appointment Cancelled or not found' })
        }
        const appointmentData = await appointmentModel.findById(appointmentId)

        if (!appointmentData || appointmentData.cancelled || appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Appointment Cancelled or not found' })
        }
        if (appointmentData.payment) {
            return res.json({ success: false, message: 'This appointment is already paid' })
        }

        // creating options for razorpay payment
        const options = {
            amount: Math.round(appointmentData.amount * 100),
            currency: process.env.CURRENCY || 'INR',
            receipt: String(appointmentId),
        }

        // creation of an order
        const order = await razorpayInstance.orders.create(options)

        res.json({ success: true, order })

    } catch (error) {
        console.error('paymentRazorpay error:', error.message)
        res.json({ success: false, message: clientError(error) })
    }
}



//Api to make verify payment of appointment using Razorpay
const verifyRazorpay = async (req, res) => {
    try {
        const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

        // 1. The checkout response must be signed by Razorpay with our secret
        if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
            return res.json({ success: false, message: 'Payment Failed' })
        }

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)
        if (orderInfo.status !== 'paid' || !isObjectId(String(orderInfo.receipt))) {
            return res.json({ success: false, message: 'Payment Failed' })
        }

        // 2. The paid order must belong to this user's appointment and match its price
        const appointment = await appointmentModel.findById(orderInfo.receipt)
        if (!appointment || appointment.userId !== userId) {
            return res.json({ success: false, message: 'Payment Failed' })
        }
        if (Number(orderInfo.amount) !== Math.round(appointment.amount * 100)) {
            return res.json({ success: false, message: 'Payment amount mismatch' })
        }

        // 3. Idempotent: only the first verification marks it paid and sends e-mails
        const updated = await appointmentModel.findOneAndUpdate(
            { _id: appointment._id, payment: false },
            { $set: { payment: true, paymentId: razorpay_payment_id } },
            { new: true }
        )

        if (updated) {
            const [patient, doctor] = await Promise.all([
                userModel.findById(appointment.userId).select('email name'),
                doctorModel.findById(appointment.docId).select('email name speciality')
            ]);
            if (patient && doctor) {
                sendAppointmentBookingEmail({
                    appointmentId: appointment._id,
                    patientEmail: patient.email, patientName: patient.name,
                    doctorName: doctor.name, doctorSpeciality: doctor.speciality,
                    slotDate: appointment.slotDate, slotTime: appointment.slotTime,
                    amount: appointment.amount, paymentMethod: 'Razorpay'
                }).catch(e => console.log('Email error:', e.message));
                sendDoctorNewAppointmentAlert({
                    appointmentId: appointment._id,
                    doctorEmail: doctor.email, doctorName: doctor.name,
                    patientName: patient.name,
                    slotDate: appointment.slotDate, slotTime: appointment.slotTime
                }).catch(e => console.log('Email error:', e.message));
            }
        }

        res.json({ success: true, message: "Payment Successful" })
    } catch (error) {
        console.error('verifyRazorpay error:', error.message)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to book appointment with immediate Razorpay payment
const bookAppointmentWithPayment = async (req, res) => {
    try {
        const { userId, docId, slotDate, slotTime } = req.body

        if (!userId || !isObjectId(docId) || !isNonEmptyString(slotDate, 20) || !isNonEmptyString(slotTime, 20)) {
            return res.status(400).json({ success: false, message: 'Missing required booking details' })
        }

        const normalizedSlotDate = normalizeSlotDate(slotDate)
        const normalizedSlotTime = normalizeSlotTime(slotTime)

        const docData = await doctorModel.findById(docId).select("-password")
        if (!docData || !docData.available || !(docData.fees > 0)) {
            return res.json({ success: false, message: 'Doctor Not Available' })
        }

        // 1. Database-level check: Verify if an active appointment already exists or conflicts (60-min session + 30-min buffer)
        const activeAppointments = await appointmentModel.find({
            docId,
            slotDate: normalizedSlotDate,
            cancelled: false
        })

        const hasConflict = activeAppointments.some(app => 
            checkSlotConflict(app.slotTime, normalizedSlotTime, 60, 30)
        )

        if (hasConflict) {
            return res.status(409).json({ 
                success: false, 
                message: 'This appointment slot or buffer time has already been booked.' 
            })
        }

        let slots_booked = docData.slots_booked || {}

        // 2. Checking for slot availability in doctor record (checking normalized slot values)
        const bookedListForDate = (slots_booked[normalizedSlotDate] || []).map(s => normalizeSlotTime(s))
        if (bookedListForDate.includes(normalizedSlotTime)) {
            return res.status(409).json({ 
                success: false, 
                message: 'This appointment slot has already been booked.' 
            })
        }

        if (slots_booked[normalizedSlotDate]) {
            slots_booked[normalizedSlotDate].push(normalizedSlotTime)
        } else {
            slots_booked[normalizedSlotDate] = [normalizedSlotTime]
        }

        const userData = await userModel.findById(userId).select(USER_SNAPSHOT_FIELDS).lean()
        if (!userData) {
            return res.json({ success: false, message: 'User not found' })
        }

        const appointmentData = {
            userId,
            docId,
            userData,
            docData: buildDoctorSnapshot(docData),
            amount: docData.fees,
            duration: 60,
            slotTime: normalizedSlotTime,
            slotDate: normalizedSlotDate,
            date: Date.now()
        }

        const newAppointment = new appointmentModel(appointmentData)

        // Save appointment with atomic partial unique index protection
        try {
            await newAppointment.save()
        } catch (saveErr) {
            if (saveErr.code === 11000 || saveErr.message?.includes('E11000')) {
                return res.status(409).json({ 
                    success: false, 
                    message: 'This appointment slot has already been booked.' 
                })
            }
            throw saveErr
        }

        // Save new slots data in docData
        await doctorModel.findByIdAndUpdate(docId, { slots_booked })

        // Create Razorpay order for immediate payment
        const options = {
            amount: docData.fees * 100,
            currency: process.env.CURRENCY || 'INR',
            receipt: newAppointment._id.toString(),
        }

        const order = await razorpayInstance.orders.create(options)

        res.json({ success: true, message: 'Appointment Booked', order, appointmentId: newAppointment._id })

    } catch (error) {
        console.log(error)
        if (error.code === 11000 || error.message?.includes('E11000')) {
            return res.status(409).json({ 
                success: false, 
                message: 'This appointment slot has already been booked.' 
            })
        }
        res.json({ success: false, message: clientError(error) })
    }
}

// API to handle contact form submission
const contactForm = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, message, userId } = req.body;

        // Check if all required fields are provided (and are plain strings of sane length)
        if (!isNonEmptyString(firstName, 100) || !isNonEmptyString(lastName, 100) || typeof email !== 'string' ||
            !isNonEmptyString(phone, 20) || !isNonEmptyString(message, 5000)) {
            return res.json({ success: false, message: 'All fields are required' });
        }

        // Validate email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: 'Please enter a valid email' });
        }

        // Validate phone number (basic validation)
        if (phone.length < 10 || !/^[0-9+()\-\s]+$/.test(phone)) {
            return res.json({ success: false, message: 'Please enter a valid phone number' });
        }

        // Create new contact entry in database
        const contactData = new contactModel({
            userId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            message: message.trim()
        });

        const savedContact = await contactData.save();

        // Send email notifications (admin alert + user auto-reply). Content is HTML-escaped in emailService.
        sendContactFormEmails({ firstName, lastName, email, phone, message })
            .catch(e => console.log('Email error:', e.message));

        res.json({
            success: true,
            message: 'Thank you for contacting us! We will get back to you soon.',
            contactId: savedContact._id
        });

    } catch (error) {
        console.error('contactForm error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
}

// API to purchase Therapique coins
const purchaseCoins = async (req, res) => {
    try {
        const { userId, coinPackage } = req.body;
        
        if (!COIN_PACKAGES[coinPackage]) {
            return res.json({ success: false, message: 'Invalid coin package' });
        }

        const packageData = COIN_PACKAGES[coinPackage];
        const totalCoins = packageData.coins + packageData.bonus;

        // Create Razorpay order for coin purchase
        const receiptId = `coins_${Date.now().toString().slice(-8)}`;
        const options = {
            amount: packageData.price * 100, // amount in paise
            currency: process.env.CURRENCY || 'INR',
            receipt: receiptId,
            notes: {
                userId: userId,
                coinPackage: coinPackage,
                totalCoins: totalCoins
            }
        };

        const order = await razorpayInstance.orders.create(options);

        res.json({ 
            success: true, 
            order,
            packageData: {
                ...packageData,
                totalCoins
            }
        });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to verify coin purchase payment
const verifyCoinsPayment = async (req, res) => {
    try {
        const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Verify the payment signature (constant-time)
        if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
            return res.json({ success: false, message: 'Invalid payment signature' });
        }

        // Payment is verified, get order details from Razorpay (server-side source of truth)
        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
        if (orderInfo.status !== 'paid') {
            return res.json({ success: false, message: 'Payment not completed' });
        }

        const { userId: orderUserId, coinPackage } = orderInfo.notes || {};
        const packageData = COIN_PACKAGES[coinPackage];

        // The order must have been created by this user, for a real package, at the real price
        if (String(orderUserId) !== String(userId) || !packageData || Number(orderInfo.amount) !== packageData.price * 100) {
            return res.json({ success: false, message: 'Invalid payment for this account' });
        }

        const totalCoins = packageData.coins + packageData.bonus;

        // Idempotent credit: replaying the same order can never add coins twice
        const { user, alreadyCredited } = await creditPurchasedCoinsOnce(userId, totalCoins, razorpay_order_id, {
            description: `Purchased ${coinPackage} package`,
            paymentId: razorpay_payment_id
        });

        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            message: alreadyCredited ? 'This payment has already been credited to your wallet.' : `Successfully purchased ${totalCoins} Therapique coins!`,
            newBalance: user.therapiqueCoins
        });

    } catch (error) {
        console.error('verifyCoinsPayment error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to book appointment with coins
const bookAppointmentWithCoins = async (req, res) => {
    try {
        const { userId, docId, slotDate, slotTime } = req.body;

        if (!userId || !isObjectId(docId) || !isNonEmptyString(slotDate, 20) || !isNonEmptyString(slotTime, 20)) {
            return res.status(400).json({ success: false, message: 'Missing required booking details' });
        }

        const normalizedSlotDate = normalizeSlotDate(slotDate);
        const normalizedSlotTime = normalizeSlotTime(slotTime);

        const docData = await doctorModel.findById(docId).select("-password");
        if (!docData || !docData.available || !(docData.fees > 0)) {
            return res.json({ success: false, message: 'Doctor Not Available' });
        }

        // 1. Database-level check: Verify if an active appointment already exists or conflicts (60-min session + 30-min buffer)
        const activeAppointments = await appointmentModel.find({
            docId,
            slotDate: normalizedSlotDate,
            cancelled: false
        });

        const hasConflict = activeAppointments.some(app =>
            checkSlotConflict(app.slotTime, normalizedSlotTime, 60, 30)
        );

        if (hasConflict) {
            return res.status(409).json({
                success: false,
                message: 'This appointment slot or buffer time has already been booked.'
            });
        }

        const userData = await userModel.findById(userId).select(`${PRIVATE_USER_FIELDS} -coinsTransactions`).lean();
        if (!userData) {
            return res.json({ success: false, message: 'User not found' });
        }
        const appointmentCost = docData.fees; // Cost in coins equals the fee amount

        // Check if user has enough coins (re-checked atomically when deducting below)
        if ((userData.therapiqueCoins || 0) < appointmentCost) {
            return res.json({
                success: false,
                message: `Insufficient coins. You need ${appointmentCost} coins but have only ${userData.therapiqueCoins || 0}`
            });
        }

        let slots_booked = docData.slots_booked || {};

        // 2. Check for slot availability in doctor record
        const bookedListForDate = (slots_booked[normalizedSlotDate] || []).map(s => normalizeSlotTime(s));
        if (bookedListForDate.includes(normalizedSlotTime)) {
            return res.status(409).json({
                success: false,
                message: 'This appointment slot has already been booked.'
            });
        }

        if (slots_booked[normalizedSlotDate]) {
            slots_booked[normalizedSlotDate].push(normalizedSlotTime);
        } else {
            slots_booked[normalizedSlotDate] = [normalizedSlotTime];
        }

        const { therapiqueCoins: _balance, ...userSnapshot } = userData;

        const appointmentData = {
            userId,
            docId,
            userData: userSnapshot,
            docData: buildDoctorSnapshot(docData),
            amount: docData.fees,
            duration: 60,
            slotTime: normalizedSlotTime,
            slotDate: normalizedSlotDate,
            date: Date.now(),
            payment: true, // Mark as paid since coins were used
            paidWithCoins: true
        };

        const newAppointment = new appointmentModel(appointmentData);

        // Save appointment with atomic partial unique index protection
        try {
            await newAppointment.save();
        } catch (saveErr) {
            if (saveErr.code === 11000 || saveErr.message?.includes('E11000')) {
                return res.status(409).json({
                    success: false,
                    message: 'This appointment slot has already been booked.'
                });
            }
            throw saveErr;
        }

        // Deduct coins atomically; roll the booking back if a concurrent request spent them first
        const updatedUser = await debitCoins(userId, appointmentCost, {
            description: `Appointment with ${docData.name}`,
            appointmentId: String(newAppointment._id)
        });
        if (!updatedUser) {
            await appointmentModel.deleteOne({ _id: newAppointment._id });
            return res.json({ success: false, message: 'Insufficient coins to complete this booking.' });
        }

        // Save new slots data in docData
        await doctorModel.findByIdAndUpdate(docId, { slots_booked });

        // Send booking confirmation emails (non-blocking)
        sendAppointmentBookingEmail({
            appointmentId: newAppointment._id,
            patientEmail: userData.email, patientName: userData.name,
            doctorName: docData.name, doctorSpeciality: docData.speciality,
            slotDate, slotTime, amount: appointmentCost, paymentMethod: 'Therapique Tokens'
        }).catch(e => console.log('Email error:', e.message));
        sendDoctorNewAppointmentAlert({
            appointmentId: newAppointment._id,
            doctorEmail: docData.email, doctorName: docData.name,
            patientName: userData.name, slotDate, slotTime
        }).catch(e => console.log('Email error:', e.message));

        res.json({
            success: true,
            message: 'Appointment Booked with Therapique Coins!',
            remainingCoins: updatedUser.therapiqueCoins
        });

    } catch (error) {
        console.error('bookAppointmentWithCoins error:', error.message);
        if (error.code === 11000 || error.message?.includes('E11000')) {
            return res.status(409).json({
                success: false,
                message: 'This appointment slot has already been booked.'
            });
        }
        res.json({ success: false, message: clientError(error) });
    }
};

// API to create book order with Razorpay
/** Validates a cart and address, returning server-priced order data or an error message. */
const prepareBookOrder = async (items, address) => {
    const cleanAddress = sanitizeAddress(address);
    if (!cleanAddress) return { error: 'Invalid order details' };
    try {
        const priced = await priceCartItems(items);
        return { ...priced, address: cleanAddress };
    } catch (err) {
        if (err.expose) return { error: err.message };
        throw err;
    }
};

const createBookOrderRazorpay = async (req, res) => {
    try {
        const { userId, items, address } = req.body;
        const order = await prepareBookOrder(items, address);
        if (order.error) {
            return res.json({ success: false, message: order.error });
        }

        const newOrder = new orderModel({
            userId,
            items: order.items,
            amount: order.amount,
            address: order.address,
            paymentMethod: "RazorPay",
            payment: false,
            date: Date.now()
        });
        await newOrder.save();

        const razorpayOrder = await razorpayInstance.orders.create({
            amount: Math.round(order.amount * 100), // amount in paise, computed server-side
            currency: process.env.CURRENCY || 'INR',
            receipt: newOrder._id.toString(),
        });

        res.json({
            success: true,
            order: razorpayOrder,
            orderId: newOrder._id
        });

    } catch (error) {
        console.error('createBookOrderRazorpay error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to verify book order Razorpay payment
const verifyBookOrderRazorpay = async (req, res) => {
    try {
        const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        if (!isObjectId(orderId) || !verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
            return res.json({ success: false, message: 'Invalid Signature. Payment Failed' });
        }

        // The signed Razorpay order must be the one created for THIS order, owned by THIS user, for the right amount
        const [orderInfo, order] = await Promise.all([
            razorpayInstance.orders.fetch(razorpay_order_id),
            orderModel.findOne({ _id: orderId, userId })
        ]);
        if (!order || String(orderInfo.receipt) !== String(order._id) || orderInfo.status !== 'paid' ||
            Number(orderInfo.amount) !== Math.round(order.amount * 100)) {
            return res.json({ success: false, message: 'Invalid Signature. Payment Failed' });
        }

        // Idempotent: e-mail is sent only on the first successful verification
        const updated = await orderModel.findOneAndUpdate(
            { _id: order._id, payment: false },
            { $set: { payment: true, status: 'Paid' } },
            { new: true }
        );

        if (updated) {
            const customer = await userModel.findById(order.userId).select('email name');
            sendBookOrderPlacedEmail({
                userEmail: customer?.email, userName: customer?.name,
                orderId: order._id, items: order.items,
                amount: order.amount, paymentMethod: 'Razorpay', address: order.address
            }).catch(e => console.log('Email error:', e.message));
        }

        res.json({ success: true, message: "Payment Successful & Order Placed!" });
    } catch (error) {
        console.error('verifyBookOrderRazorpay error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to place COD book order
const placeBookOrderCOD = async (req, res) => {
    try {
        const { userId, items, address } = req.body;
        const order = await prepareBookOrder(items, address);
        if (order.error) {
            return res.json({ success: false, message: order.error });
        }

        const newOrder = new orderModel({
            userId,
            items: order.items,
            amount: order.amount,
            address: order.address,
            paymentMethod: "COD",
            payment: false,
            date: Date.now()
        });
        await newOrder.save();

        // Send order invoice email (non-blocking)
        const customer = await userModel.findById(userId).select('email name');
        sendBookOrderPlacedEmail({
            userEmail: customer?.email, userName: customer?.name,
            orderId: newOrder._id, items: order.items, amount: order.amount,
            paymentMethod: 'Cash on Delivery', address: order.address
        }).catch(e => console.log('Email error:', e.message));

        res.json({ success: true, message: 'Order Placed Successfully via Cash on Delivery!' });

    } catch (error) {
        console.error('placeBookOrderCOD error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to place Book Order using Therapique Tokens
const placeBookOrderTokens = async (req, res) => {
    try {
        const { userId, items, address } = req.body;
        const order = await prepareBookOrder(items, address);
        if (order.error) {
            return res.json({ success: false, message: order.error });
        }
        const amount = Math.round(order.amount);

        // Atomic, balance-guarded deduction (no negative amounts, no double spending)
        const userData = await debitCoins(userId, amount, {
            description: `Book Order Purchase (${order.items.length} items)`
        });

        if (!userData) {
            const current = await userModel.findById(userId).select('therapiqueCoins').lean();
            if (!current) {
                return res.json({ success: false, message: 'User not found' });
            }
            return res.json({
                success: false,
                message: `Insufficient Therapique Tokens balance! Required: T ${amount}, Available: T ${current.therapiqueCoins || 0}.`
            });
        }

        const newOrder = new orderModel({
            userId,
            items: order.items,
            amount,
            address: order.address,
            paymentMethod: "Therapique Tokens",
            payment: true,
            date: Date.now()
        });
        await newOrder.save();

        // Send order invoice email (non-blocking)
        sendBookOrderPlacedEmail({
            userEmail: userData.email, userName: userData.name,
            orderId: newOrder._id, items: order.items, amount,
            paymentMethod: 'Therapique Tokens', address: order.address
        }).catch(e => console.log('Email error:', e.message));

        res.json({
            success: true,
            message: `Order Placed Successfully using T ${amount} Therapique Tokens!`,
            remainingCoins: Math.round(userData.therapiqueCoins)
        });

    } catch (error) {
        console.error('placeBookOrderTokens error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

const computeAutoStatus = (orderDate, currentStatus, isManualStatus = false) => {
    if (isManualStatus) return currentStatus;
    if (currentStatus === 'Cancelled') return 'Cancelled';
    const elapsedHours = (Date.now() - new Date(orderDate).getTime()) / (1000 * 60 * 60);
    if (elapsedHours < 2) return 'Order Placed';
    if (elapsedHours < 6) return 'Packing & Preparing';
    if (elapsedHours < 24) return 'Shipped';
    if (elapsedHours < 48) return 'Out for Delivery';
    return 'Delivered';
};

// API to get user book orders
const getUserOrders = async (req, res) => {
    try {
        const { userId } = req.body;
        const orders = await orderModel.find({ userId }).sort({ date: -1 }).lean();
        
        // Batch auto-status updates using bulkWrite instead of N sequential order.save() calls
        const bulkOps = [];
        for (const order of orders) {
            if (order.status !== 'Cancelled' && !order.isManualStatus) {
                const autoStatus = computeAutoStatus(order.date, order.status, order.isManualStatus);
                if (order.status !== autoStatus) {
                    order.status = autoStatus;
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: order._id },
                            update: { $set: { status: autoStatus } }
                        }
                    });
                }
            }
        }
        if (bulkOps.length > 0) {
            await orderModel.bulkWrite(bulkOps);
        }

        res.json({ success: true, orders });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to get single order details by orderId
const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { userId } = req.body;
        if (!isObjectId(orderId)) {
            return res.json({ success: false, message: 'Order not found' });
        }
        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        res.json({ success: true, order });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to claim pending refund for a cancelled appointment (tokens or bank)
const claimRefund = async (req, res) => {
    try {
        const { userId, appointmentId, refundChoice } = req.body;

        if (!appointmentId || !refundChoice) {
            return res.json({ success: false, message: "Appointment ID and refund choice are required" });
        }
        if (refundChoice !== 'tokens' && refundChoice !== 'bank') {
            return res.json({ success: false, message: "Invalid refund choice. Must be 'tokens' or 'bank'." });
        }
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized action" });
        }

        if (!appointment.cancelled) {
            return res.json({ success: false, message: "This appointment is not cancelled" });
        }

        // Atomically claim the refund: only ONE request can move it out of the pending state
        const claimed = await appointmentModel.findOneAndUpdate(
            { _id: appointmentId, userId, cancelled: true, payment: true, refundStatus: { $in: ['pending_choice', '', null] } },
            { $set: { refundStatus: 'processing' } },
            { new: false }
        );
        if (!claimed) {
            return res.json({ success: false, message: `Refund has already been processed as ${appointment.refundStatus}` });
        }

        const amount = claimed.amount || 0;
        const [user, doctor] = await Promise.all([
            userModel.findById(userId).select('email name therapiqueCoins'),
            doctorModel.findById(claimed.docId).select('name')
        ]);
        const doctorName = doctor?.name || claimed.docData?.name || 'Doctor';

        if (refundChoice === 'tokens') {
            // Instant 1:1 Tokens credit
            const credited = await creditCoins(userId, amount, {
                description: `Refund for Cancelled Session (Dr. ${doctorName})`,
                appointmentId: String(appointmentId)
            });
            await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'refunded_tokens' });

            sendRefundConfirmedEmail({
                appointmentId: claimed._id,
                patientEmail: user?.email,
                patientName: user?.name,
                doctorName: doctor?.name || claimed.docData?.name,
                amount,
                refundMethod: 'tokens'
            }).catch(e => console.log('Email error:', e.message));

            return res.json({
                success: true,
                message: `₹${amount} successfully credited as ${amount} Therapique Tokens to your wallet!`,
                therapiqueCoins: credited?.therapiqueCoins ?? user?.therapiqueCoins ?? 0,
                refundStatus: 'refunded_tokens'
            });
        }

        // Direct Razorpay refund
        if (claimed.paymentId && razorpayInstance) {
            try {
                await razorpayInstance.payments.refund(claimed.paymentId, {
                    amount: amount * 100,
                    speed: "optimum",
                    notes: { reason: "Refund claimed by patient for cancelled appointment" }
                });
            } catch (err) {
                console.log("Razorpay refund API call error:", err.message);
                // Release the claim so the patient can retry or choose tokens instead
                await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'pending_choice' });
                return res.json({ success: false, message: "Bank refund could not be initiated right now. Please try again later or choose Therapique Tokens." });
            }
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { refundStatus: 'refunded_bank' });

        sendRefundConfirmedEmail({
            appointmentId: claimed._id,
            patientEmail: user?.email,
            patientName: user?.name,
            doctorName: doctor?.name || claimed.docData?.name,
            amount,
            refundMethod: 'bank'
        }).catch(e => console.log('Email error:', e.message));

        return res.json({
            success: true,
            message: `₹${amount} refund initiated directly to your original Bank / UPI account via Razorpay!`,
            therapiqueCoins: user?.therapiqueCoins || 0,
            refundStatus: 'refunded_bank'
        });

    } catch (error) {
        console.error('claimRefund error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to handle newsletter subscription
const subscribeNewsletter = async (req, res) => {
    try {
        const { email } = req.body;

        if (typeof email !== 'string' || email.length > 254 || !validator.isEmail(email)) {
            return res.json({ success: false, message: 'Please provide a valid email address' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if already subscribed in database
        const existing = await newsletterModel.findOne({ email: normalizedEmail });
        if (!existing) {
            const newSub = new newsletterModel({ email: normalizedEmail });
            await newSub.save();
        }

        // Send confirmation to subscriber and alert to admin (therapique.official@gmail.com)
        await sendNewsletterEmails({ email: normalizedEmail });

        res.json({
            success: true,
            message: 'Thank you for subscribing to our newsletter! We have sent a confirmation to your email.'
        });
    } catch (error) {
        console.log('Newsletter subscription error:', error);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to check/verify join eligibility for user
const verifyAppointmentJoinUser = async (req, res) => {
    try {
        const userId = req.body.userId;
        const appointmentId = req.params.appointmentId || req.body.appointmentId;

        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, canJoin: false, message: 'Appointment ID required' });
        }

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, canJoin: false, message: 'Appointment not found' });
        }

        if (String(appointment.userId) !== String(userId)) {
            return res.json({ success: false, canJoin: false, message: 'Unauthorized appointment access' });
        }

        const timingStatus = getAppointmentJoinStatus(appointment);
        return res.json({
            success: true,
            canJoin: timingStatus.canJoin,
            status: timingStatus.status,
            availableAt: timingStatus.formattedJoinTime,
            startTime: timingStatus.formattedStartTime,
            reason: timingStatus.reason,
            appointment: {
                _id: appointment._id,
                slotDate: appointment.slotDate,
                slotTime: appointment.slotTime,
                cancelled: appointment.cancelled,
                isCompleted: appointment.isCompleted,
                docData: appointment.docData
            }
        });
    } catch (error) {
        console.log('verifyAppointmentJoinUser error:', error);
        res.json({ success: false, canJoin: false, message: clientError(error) });
    }
};

// API for logged-in user to change their password from My Profile
const changePassword = async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
            return res.json({ success: false, message: "Please provide your current password and new password." });
        }

        if (!isValidPassword(newPassword)) {
            return res.json({ success: false, message: "New password must be at least 8 characters long." });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found." });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: "Current password is incorrect." });
        }

        user.password = await hashPassword(newPassword);
        // Revoke every other session; the caller receives a fresh token
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ success: true, message: "Password updated successfully!", token: signToken('user', user._id, user.tokenVersion) });
    } catch (error) {
        console.error('changePassword error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to send password reset OTP
const sendResetPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (typeof email !== 'string' || email.length > 254 || !validator.isEmail(email)) {
            return res.json({ success: false, message: "Please provide a valid email address." });
        }

        const user = await userModel.findOne({ email: normalizeEmail(email) });
        // Same response whether or not the account exists (prevents account enumeration)
        const genericResponse = { success: true, message: "If an account exists for this email, a 6-digit reset code has been sent." };
        if (!user) {
            return res.json(genericResponse);
        }

        // Cooldown between codes to prevent e-mail bombing
        if (Date.now() - (user.verifyOtpLastSentAt || 0) < OTP_RESEND_COOLDOWN_MS) {
            return res.json(genericResponse);
        }

        // Generate cryptographically secure 6-digit OTP
        const { otp, hash: otpHash } = generateOtp();

        user.verifyOtp = otpHash;
        user.verifyOtpExpireAt = Date.now() + OTP_TTL_MS; // 10 minutes
        user.verifyOtpAttempts = 0;
        user.verifyOtpLastSentAt = Date.now();
        await user.save();

        // Send OTP via Brevo
        await sendPasswordResetOtpEmail({
            email: user.email,
            name: user.name,
            otp
        });

        res.json(genericResponse);
    } catch (error) {
        console.error('sendResetPasswordOtp error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

// API to verify OTP and reset password
const verifyResetPasswordOtp = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (typeof email !== 'string' || typeof otp !== 'string' || typeof newPassword !== 'string' || !email || !otp || !newPassword) {
            return res.json({ success: false, message: "Please provide email, 6-digit code, and your new password." });
        }

        if (!isValidPassword(newPassword)) {
            return res.json({ success: false, message: "New password must be at least 8 characters long." });
        }

        const invalidCode = { success: false, message: "Invalid or expired reset code. Please request a new one." };
        const user = await userModel.findOne({ email: normalizeEmail(email) });
        if (!user || !user.verifyOtp || !user.verifyOtpExpireAt || Date.now() > user.verifyOtpExpireAt) {
            return res.json(invalidCode);
        }

        // Brute-force protection: the code is destroyed after too many wrong guesses
        if ((user.verifyOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
            user.verifyOtp = "";
            user.verifyOtpExpireAt = 0;
            await user.save();
            return res.json({ success: false, message: "Too many failed attempts. Please request a new reset code." });
        }

        if (hashOtp(otp) !== user.verifyOtp) {
            user.verifyOtpAttempts = (user.verifyOtpAttempts || 0) + 1;
            await user.save();
            return res.json({ success: false, message: "Invalid reset code. Please check and try again." });
        }

        user.password = await hashPassword(newPassword);
        user.verifyOtp = "";
        user.verifyOtpExpireAt = 0;
        user.verifyOtpAttempts = 0;
        // Receiving the code by e-mail proves ownership of the address
        if (user.emailVerified === false) user.emailVerified = true;
        // Revoke every existing session after a reset
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ success: true, message: "Password reset successful! You can now log in with your new password." });
    } catch (error) {
        console.error('verifyResetPasswordOtp error:', error.message);
        res.json({ success: false, message: clientError(error) });
    }
};

export { 
    registerUser, 
    loginUser, 
    verifyEmailOtp,
    resendEmailOtp,
    getProfile, 
    updateProfile, 
    changePassword,
    sendResetPasswordOtp,
    verifyResetPasswordOtp,
    listAppointment, 
    cancelAppointment, 
    claimRefund,
    paymentRazorpay, 
    verifyRazorpay, 
    contactForm, 
    purchaseCoins, 
    verifyCoinsPayment, 
    bookAppointmentWithCoins, 
    bookAppointmentWithPayment,
    createBookOrderRazorpay,
    verifyBookOrderRazorpay,
    placeBookOrderCOD,
    placeBookOrderTokens,
    getUserOrders,
    getSingleOrder,
    subscribeNewsletter,
    verifyAppointmentJoinUser
}
