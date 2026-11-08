import express from 'express';
import { appointmentCancel, appointmentComplete, appointmentsDoctor, doctorDashboard, doctorList, doctorProfile, loginDoctor, updateDoctorProfile, generateCallTicket, verifyAppointmentJoinDoctor } from '../controllers/doctorController.js';
import authDoctor from '../middlewares/authDoctor.js';
import upload from '../middlewares/multer.js';
import { limiters } from '../middlewares/rateLimit.js';

const doctorRouter = express.Router();

doctorRouter.post("/login", limiters.loginIp, limiters.login, loginDoctor)
doctorRouter.get("/appointments", authDoctor, appointmentsDoctor)
doctorRouter.get("/list", doctorList)
doctorRouter.get("/verify-appointment-join/:appointmentId", authDoctor, verifyAppointmentJoinDoctor)
doctorRouter.post("/cancel-appointment", authDoctor, appointmentCancel)
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete)
doctorRouter.post("/generate-call-ticket", authDoctor, generateCallTicket)
doctorRouter.get("/dashboard", authDoctor, doctorDashboard)
doctorRouter.get("/profile", authDoctor, doctorProfile)
// Authentication runs BEFORE the upload is accepted
doctorRouter.post("/update-profile", authDoctor, upload.single('image'), updateDoctorProfile)

export default doctorRouter;