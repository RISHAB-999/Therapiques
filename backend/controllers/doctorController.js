import bcrypt from "bcrypt";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import userModel from "../models/userModel.js";
import { v2 as cloudinary } from 'cloudinary';
import { sendAppointmentCancellationEmail, sendSessionCompletedEmails } from '../services/emailService.js';
import { getAppointmentJoinStatus, normalizeSlotTime, normalizeSlotDate } from '../utils/appointmentTiming.js';

import { signToken } from '../utils/tokens.js';
import { clientError, isObjectId } from '../utils/security.js';
import { creditCoins } from '../utils/coins.js';

// Simple in-memory cache for doctorList — this endpoint is polled every 30s by every connected frontend user
let doctorListCache = { data: null, timestamp: 0 }
const DOCTOR_LIST_CACHE_TTL = 30000 // 30 seconds — matches frontend polling interval

// API for doctor Login 
const loginDoctor = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.json({ success: false, message: "Invalid credentials" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const user = await doctorModel.findOne({ 
            email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } 
        });

        if (!user) {
            return res.json({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = signToken('doctor', user._id, user.tokenVersion || 0);
            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: "Invalid credentials" });
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: clientError(error) });
    }
};


// API to get doctor appointments for doctor panel
const appointmentsDoctor = async (req, res) => {
    try {

        const docId = req.docId || req.body.docId
        const appointments = await appointmentModel.find({ docId }).sort({ date: -1 }).lean()

        // Fetch latest patient profile info (image, name, dob, gender, phone) so appointments always show updated profile pics
        const userIds = [...new Set(appointments.map(a => a.userId).filter(Boolean))]
        const users = await userModel.find({ _id: { $in: userIds } }).select('image name dob gender phone').lean()
        const userMap = new Map(users.map(u => [u._id.toString(), u]))

        const updatedAppointments = appointments.map(app => {
            const user = userMap.get(app.userId?.toString())
            if (user) {
                return {
                    ...app,
                    userData: {
                        ...app.userData,
                        image: user.image || app.userData?.image,
                        name: user.name || app.userData?.name,
                        dob: user.dob || app.userData?.dob,
                        gender: user.gender || app.userData?.gender,
                        phone: user.phone || app.userData?.phone
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

// API to cancel appointment for doctor panel with automatic token refund & slot release
const appointmentCancel = async (req, res) => {
    try {
        const docId = req.docId || req.body.docId
        const { appointmentId } = req.body
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: 'Unauthorized or Appointment not found' })
        }

        // 1. Atomically mark the doctor's own appointment as cancelled (prevents double refunds)
        const appointmentData = await appointmentModel.findOneAndUpdate(
            { _id: appointmentId, docId, cancelled: false },
            { $set: { cancelled: true } },
            { new: false }
        )
        if (!appointmentData) {
            const existing = await appointmentModel.findById(appointmentId).select('docId cancelled').lean()
            if (existing && existing.docId === docId && existing.cancelled) {
                return res.json({ success: false, message: 'Appointment is already cancelled' });
            }
        }
        if (appointmentData) {

            // 2. Release doctor schedule slot
            const { slotDate, slotTime, userId, payment, amount } = appointmentData
            const doctorData = await doctorModel.findById(docId)
            if (doctorData && doctorData.slots_booked && doctorData.slots_booked[slotDate]) {
                let slots_booked = doctorData.slots_booked
                slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime)
                await doctorModel.findByIdAndUpdate(docId, { slots_booked })
            }

            // 3. Refund logic based on payment method
            if (payment && userId) {
                if (appointmentData.paidWithCoins) {
                    const user = await creditCoins(userId, amount || 0, {
                        description: `Refund for Cancelled Appointment with Dr. ${doctorData?.name || 'Doctor'}`,
                        appointmentId: String(appointmentId)
                    })
                    if (user) {
                        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true, refundStatus: 'refunded_tokens' })
                        sendAppointmentCancellationEmail({
                            appointmentId,
                            patientEmail: user.email, patientName: user.name,
                            doctorEmail: doctorData?.email, doctorName: doctorData?.name, 
                            slotDate, slotTime,
                            cancelledBy: 'doctor',
                            refundMessage: `${amount} Therapique Tokens refunded to your wallet.`
                        }).catch(e => console.log('Email error:', e.message));
                        return res.json({ success: true, message: `Appointment Cancelled. ${amount} Therapique Tokens refunded to patient's wallet!` })
                    }
                } else {
                    // Paid with real money / Razorpay -> Let patient choose their preferred refund on the website!
                    await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true, refundStatus: 'pending_choice' });
                    const patient = await userModel.findById(userId);
                    sendAppointmentCancellationEmail({
                        appointmentId,
                        patientEmail: patient?.email,
                        patientName: patient?.name,
                        doctorEmail: doctorData?.email, doctorName: doctorData?.name, 
                        slotDate, slotTime,
                        cancelledBy: 'doctor',
                        needsRefundChoice: true,
                        amount: appointmentData.amount
                    }).catch(e => console.log('Email error:', e.message));
                    return res.json({ success: true, message: `Appointment Cancelled. Patient has been notified to choose their refund method on the website.` })
                }
            }

            // No-payment cancellation email
            await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true, refundStatus: 'none' })
            const patient = await userModel.findById(userId);
            sendAppointmentCancellationEmail({
                appointmentId,
                patientEmail: patient?.email, patientName: patient?.name,
                doctorEmail: doctorData?.email, doctorName: doctorData?.name, 
                slotDate, slotTime,
                cancelledBy: 'doctor'
            }).catch(e => console.log('Email error:', e.message));
            return res.json({ success: true, message: 'Appointment Cancelled' })
        }

        return res.json({ success: false, message: 'Unauthorized or Appointment not found' })

    } catch (error) {
        console.log(error)
        return res.json({ success: false, message: clientError(error) })
    }
}

// API to mark appointment completed for doctor panel
const appointmentComplete = async (req, res) => {
    try {

        const docId = req.docId || req.body.docId
        const { appointmentId } = req.body
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: 'Appointment not found or invalid' })
        }

        const appointmentData = await appointmentModel.findById(appointmentId)
        if (appointmentData && appointmentData.docId === docId && !appointmentData.cancelled) {
            await appointmentModel.findByIdAndUpdate(appointmentId, { isCompleted: true })

            // Look up patient & doctor details for completion notification emails
            const [user, doctor] = await Promise.all([
                userModel.findById(appointmentData.userId).lean(),
                doctorModel.findById(docId).lean()
            ])

            const patientEmail = user?.email || appointmentData.userData?.email
            const patientName = user?.name || appointmentData.userData?.name || 'Patient'
            const doctorEmail = doctor?.email || appointmentData.docData?.email
            const doctorName = doctor?.name || appointmentData.docData?.name || 'Doctor'
            const doctorSpeciality = doctor?.speciality || appointmentData.docData?.speciality || 'Specialist'

            sendSessionCompletedEmails({
                appointmentId,
                patientEmail,
                patientName,
                doctorEmail,
                doctorName,
                doctorSpeciality,
                slotDate: appointmentData.slotDate,
                slotTime: appointmentData.slotTime,
                amount: appointmentData.amount,
                paymentMethod: appointmentData.isCoinsPayment ? 'Therapique Coins' : (appointmentData.payment ? 'Online (Razorpay)' : 'Cash / Clinic')
            }).catch(err => console.error('[EMAIL ERROR] sendSessionCompletedEmails failed:', err))

            return res.json({ success: true, message: 'Consultation marked as completed successfully.' })
        }

        return res.json({ success: false, message: 'Appointment not found or invalid' })

    } catch (error) {
        console.log(error)
        return res.json({ success: false, message: clientError(error) })
    }

}

// API to get all doctors list for Frontend (with authoritative slots_booked computed from active appointments)
// Uses a 30-second in-memory cache since this is polled every 30s by every connected user
const doctorList = async (req, res) => {
    try {
        const now = Date.now()
        if (doctorListCache.data && (now - doctorListCache.timestamp) < DOCTOR_LIST_CACHE_TTL) {
            return res.json(doctorListCache.data)
        }

        // Parallel fetch: doctors + active appointments (uses { docId: 1, cancelled: 1 } index)
        const [doctors, activeAppointments] = await Promise.all([
            doctorModel.find({}).select(['-password', '-email', '-tokenVersion']).lean(),
            appointmentModel.find({ cancelled: false })
                .select('docId slotDate slotTime')
                .lean()
        ])

        const docSlotsMap = {};
        for (const app of activeAppointments) {
            const dId = app.docId ? app.docId.toString() : '';
            if (!dId) continue;
            const sDate = normalizeSlotDate(app.slotDate);
            const sTime = normalizeSlotTime(app.slotTime);

            if (!docSlotsMap[dId]) docSlotsMap[dId] = {};
            if (!docSlotsMap[dId][sDate]) docSlotsMap[dId][sDate] = [];
            if (!docSlotsMap[dId][sDate].includes(sTime)) {
                docSlotsMap[dId][sDate].push(sTime);
            }
        }

        const updatedDoctors = doctors.map(doc => {
            const dId = doc._id.toString();
            const bookedSlots = docSlotsMap[dId] || {};
            return {
                ...doc,
                slots_booked: bookedSlots
            };
        });

        const response = { success: true, doctors: updatedDoctors }
        doctorListCache = { data: response, timestamp: now }
        res.json(response);

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

const changeAvailability = async (req, res) => {
    try {
        const { docId } = req.body
        if (!isObjectId(docId)) {
            return res.json({ success: false, message: "Doctor not found" });
        }

        const docData = await doctorModel.findById(docId);
        if (!docData) {
            return res.json({
                success: false,
                message: "Doctor not found"
            });
        }

        await doctorModel.findByIdAndUpdate(docId, { available: !docData.available });

        res.json({
            success: true,
            message: "Doctor availability updated",
        });

    } catch (error) {
        console.log(error)
        res.json({
            success: false,
            message: clientError(error),
        });
    }
}


// API to get doctor profile for Doctor Panel
const doctorProfile = async (req, res) => {
    try {

        const docId = req.docId || req.body.docId
        const profileData = await doctorModel.findById(docId).select('-password -tokenVersion')

        res.json({ success: true, profileData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to update doctor profile data from Doctor Panel
const updateDoctorProfile = async (req, res) => {
    try {
        const docId = req.docId || req.body.docId
        const { fees, address, available, about, image } = req.body
        const imageFile = req.file

        if (!docId) {
            return res.json({ success: false, message: "Doctor ID missing or unauthorized" })
        }

        let parsedAddress = address
        if (typeof address === 'string') {
            try {
                parsedAddress = JSON.parse(address)
            } catch (e) {
                parsedAddress = address
            }
        }

        let imageUrl = null
        if (imageFile) {
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
            imageUrl = imageUpload.secure_url
        } else if (typeof image === 'string' && image.length <= 7 * 1024 * 1024 && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image)) {
            const imageUpload = await cloudinary.uploader.upload(image, { resource_type: "image" })
            imageUrl = imageUpload.secure_url
        }

        const updateFields = {}
        if (fees !== undefined && fees !== '') {
            const parsedFees = Number(fees)
            if (!Number.isFinite(parsedFees) || parsedFees < 1 || parsedFees > 100000) {
                return res.json({ success: false, message: "Please enter valid consultation fees" })
            }
            updateFields.fees = Math.round(parsedFees)
        }
        if (parsedAddress !== undefined && (parsedAddress === null || typeof parsedAddress !== 'object' || Array.isArray(parsedAddress))) {
            return res.json({ success: false, message: "Invalid address" })
        }
        if (parsedAddress !== undefined) updateFields.address = parsedAddress
        if (available !== undefined) updateFields.available = (available === true || available === 'true')
        if (about !== undefined) updateFields.about = String(about).slice(0, 5000)
        if (imageUrl) {
            updateFields.image = imageUrl
        }

        const updatedDoctor = await doctorModel.findByIdAndUpdate(docId, updateFields, { new: true, runValidators: true }).select('-password -tokenVersion')

        if (!updatedDoctor) {
            return res.json({ success: false, message: "Doctor not found in database" })
        }

        // Synchronize updated doctor profile (image, fees, address, about) across all their appointments
        const appointmentDocUpdates = {}
        if (updateFields.image) appointmentDocUpdates["docData.image"] = updateFields.image
        if (updateFields.name) appointmentDocUpdates["docData.name"] = updateFields.name
        if (updateFields.fees) appointmentDocUpdates["docData.fees"] = updateFields.fees
        if (updateFields.address) appointmentDocUpdates["docData.address"] = updateFields.address
        if (updateFields.about) appointmentDocUpdates["docData.about"] = updateFields.about
        if (Object.keys(appointmentDocUpdates).length > 0) {
            await appointmentModel.updateMany({ docId }, { $set: appointmentDocUpdates }).catch(err => console.log("Appointment doc sync error:", err.message))
        }

        res.json({ success: true, message: 'Profile Updated Successfully', profileData: updatedDoctor })

    } catch (error) {
        console.log("Error in updateDoctorProfile:", error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to get dashboard data for doctor panel
const doctorDashboard = async (req, res) => {
    try {

        const docId = req.docId || req.body.docId

        const appointments = await appointmentModel.find({ docId }).sort({ date: -1 }).lean()

        const earnings = appointments.reduce((sum, item) => {
            return (item.isCompleted && !item.cancelled) ? sum + item.amount : sum
        }, 0)

        const patients = [...new Set(appointments.map(a => a.userId).filter(Boolean))]

        // Fetch latest patient profile info for recent appointments table
        const userIds = [...new Set(appointments.map(a => a.userId).filter(Boolean))]
        const users = await userModel.find({ _id: { $in: userIds } }).select('image name dob gender phone').lean()
        const userMap = new Map(users.map(u => [u._id.toString(), u]))

        const updatedAppointments = appointments.map(app => {
            const user = userMap.get(app.userId?.toString())
            if (user) {
                return {
                    ...app,
                    userData: {
                        ...app.userData,
                        image: user.image || app.userData?.image,
                        name: user.name || app.userData?.name
                    }
                }
            }
            return app
        })

        const appointmentStats = {
            total: appointments.length,
            completed: appointments.filter(a => a.isCompleted && !a.cancelled).length,
            cancelled: appointments.filter(a => a.cancelled).length,
            upcoming: appointments.filter(a => !a.cancelled && !a.isCompleted).length
        }

        const dashData = {
            earnings,
            appointments: appointments.length,
            patients: patients.length,
            appointmentStats,
            latestAppointments: updatedAppointments
        }

        res.json({ success: true, dashData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to generate short-lived, one-time call ticket for doctor video call session
const generateCallTicket = async (req, res) => {
    try {
        const docId = req.docId || req.body.docId
        const { appointmentId } = req.body
        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, message: 'Appointment not found' })
        }
        const appointment = await appointmentModel.findById(appointmentId)

        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' })
        }

        if (appointment.docId !== docId) {
            return res.json({ success: false, message: 'Unauthorized appointment access' })
        }

        const doctor = await doctorModel.findById(docId)
        const { createCallTicket } = await import('../socket/callTicketManager.js')
        const ticket = createCallTicket(appointmentId, docId, doctor.name)

        res.json({ success: true, ticket })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: clientError(error) })
    }
}

// API to verify join eligibility for doctor
const verifyAppointmentJoinDoctor = async (req, res) => {
    try {
        const docId = req.docId || req.body.docId;
        const appointmentId = req.params.appointmentId || req.body.appointmentId;

        if (!isObjectId(appointmentId)) {
            return res.json({ success: false, canJoin: false, message: 'Appointment ID required' });
        }

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, canJoin: false, message: 'Appointment not found' });
        }

        if (String(appointment.docId) !== String(docId)) {
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
                userData: appointment.userData
            }
        });
    } catch (error) {
        console.log('verifyAppointmentJoinDoctor error:', error);
        res.json({ success: false, canJoin: false, message: clientError(error) });
    }
};

export {
    loginDoctor,
    appointmentsDoctor,
    appointmentCancel,
    doctorList,
    changeAvailability,
    appointmentComplete,
    doctorDashboard,
    doctorProfile,
    updateDoctorProfile,
    generateCallTicket,
    verifyAppointmentJoinDoctor
}