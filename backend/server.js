import dns from 'dns'
if (dns && dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first')
}
import 'dotenv/config'
import http from 'http'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import { createApp } from './app.js'
import { initializeSocket } from './socket/index.js'
import doctorModel from './models/doctorModel.js'
import userModel from './models/userModel.js'
import appointmentModel from './models/appointmentModel.js'
import { startAppointmentReminderService } from './services/appointmentReminderService.js'

// Fail fast if required configuration is missing (never start with insecure defaults)
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key])
if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(', ')}`)
    process.exit(1)
}
if (process.env.JWT_SECRET.length < 32) {
    console.warn('[Security] JWT_SECRET is shorter than 32 characters. Rotate it to a long random value.')
}
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
    console.warn('[Security] CORS_ORIGINS is not set; allowing *.vercel.app origins. Set it to your exact frontend URLs.')
}

const app = createApp()
const server = http.createServer(app)
const PORT = process.env.PORT || 4000

connectDB().then(() => {
    // Start automated 10-minute appointment pre-join reminder service
    startAppointmentReminderService();

    // Defer appointment image sync to background — runs 5s after startup to avoid blocking initial requests
    setTimeout(async () => {
        try {
            const [doctors, users] = await Promise.all([
                doctorModel.find({}).select('image name').lean(),
                userModel.find({}).select('image name').lean()
            ]);

            // Use bulkWrite instead of N sequential updateMany calls
            const bulkOps = [];
            for (const doc of doctors) {
                if (doc.image) {
                    bulkOps.push({
                        updateMany: {
                            filter: { docId: doc._id.toString() },
                            update: { $set: { "docData.image": doc.image, "docData.name": doc.name } }
                        }
                    });
                }
            }
            for (const user of users) {
                if (user.image) {
                    bulkOps.push({
                        updateMany: {
                            filter: { userId: user._id.toString() },
                            update: { $set: { "userData.image": user.image, "userData.name": user.name } }
                        }
                    });
                }
            }
            if (bulkOps.length > 0) {
                await appointmentModel.bulkWrite(bulkOps);
            }
        } catch (e) {
            console.log("Appointment media sync info:", e.message);
        }
    }, 5000);
});
connectCloudinary();

// Initialize Socket.io WebRTC signaling server
initializeSocket(server);

server.listen(PORT, () => {
    console.log(`Server & Socket.io running on port ${PORT}`);
});
