import express from 'express';
import { getProfile, loginUser, registerUser, verifyEmailOtp, resendEmailOtp, updateProfile, changePassword, sendResetPasswordOtp, verifyResetPasswordOtp, listAppointment, cancelAppointment, claimRefund, paymentRazorpay, verifyRazorpay, contactForm, purchaseCoins, verifyCoinsPayment, bookAppointmentWithCoins, bookAppointmentWithPayment, createBookOrderRazorpay, verifyBookOrderRazorpay, placeBookOrderCOD, placeBookOrderTokens, getUserOrders, getSingleOrder, subscribeNewsletter, verifyAppointmentJoinUser } from '../controllers/userController.js';
import upload from '../middlewares/multer.js';
import authUser, { requireVerifiedEmail } from '../middlewares/authUser.js';
import { limiters } from '../middlewares/rateLimit.js';

const userRouter = express.Router();
const verified = [authUser, requireVerifiedEmail];

// Public auth endpoints (rate limited)
userRouter.post("/register", limiters.register, registerUser)
userRouter.post("/login", limiters.loginIp, limiters.login, loginUser)
userRouter.post("/verify-otp", limiters.otp, authUser, verifyEmailOtp)
userRouter.post("/resend-otp", limiters.otp, authUser, resendEmailOtp)
userRouter.post("/forgot-password", limiters.passwordResetRequest, sendResetPasswordOtp)
userRouter.post("/reset-password", limiters.passwordReset, verifyResetPasswordOtp)
userRouter.post("/change-password", limiters.passwordReset, authUser, changePassword)
userRouter.post("/contact", limiters.contact, authUser, contactForm)
userRouter.post("/newsletter-subscribe", limiters.newsletter, subscribeNewsletter)

// Profile (authentication runs BEFORE the upload is accepted)
userRouter.get("/get-profile", authUser, getProfile)
userRouter.post("/update-profile", authUser, upload.single('image'), updateProfile)

// Appointments
userRouter.post("/book-appointment-payment", limiters.payment, ...verified, bookAppointmentWithPayment)
userRouter.get("/appointments", authUser, listAppointment)
userRouter.get("/verify-appointment-join/:appointmentId", authUser, verifyAppointmentJoinUser)
userRouter.post("/cancel-appointment", authUser, cancelAppointment)
userRouter.post("/claim-refund", limiters.payment, authUser, claimRefund)

userRouter.post("/payment-razorpay", limiters.payment, ...verified, paymentRazorpay)
userRouter.post("/verifyRazorpay", limiters.payment, authUser, verifyRazorpay)

// Coin-related routes
userRouter.post("/book-appointment-coins", limiters.payment, ...verified, bookAppointmentWithCoins)
userRouter.post("/purchase-coins", limiters.payment, ...verified, purchaseCoins)
userRouter.post("/verify-coins-payment", limiters.payment, authUser, verifyCoinsPayment)

// Book Order routes
userRouter.post("/create-book-order-razorpay", limiters.payment, ...verified, createBookOrderRazorpay)
userRouter.post("/verify-book-order-razorpay", limiters.payment, authUser, verifyBookOrderRazorpay)
userRouter.post("/place-book-order-cod", limiters.payment, ...verified, placeBookOrderCOD)
userRouter.post("/place-book-order-tokens", limiters.payment, ...verified, placeBookOrderTokens)
userRouter.get("/user-orders", authUser, getUserOrders)
userRouter.get("/order/:orderId", authUser, getSingleOrder)
// NOTE: order status changes are admin-only (POST /api/book/update-status). The former
// unauthenticated /api/user/update-order-status endpoint was removed.

export default userRouter;
