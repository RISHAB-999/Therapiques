import mongoose from "mongoose"

const appointmentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    docId: { type: String, required: true },
    slotDate: { type: String, required: true },
    slotTime: { type: String, required: true },
    userData: { type: Object, required: true },
    docData: { type: Object, required: true },
    amount: { type: Number, required: true },
    date: { type: Number, required: true },
    cancelled: { type: Boolean, default: false },
    payment: { type: Boolean, default: false },
    paymentId: { type: String, default: "" },
    isCompleted: { type: Boolean, default: false },
    paidWithCoins: { type: Boolean, default: false },
    refundStatus: { type: String, default: 'none' }, // 'none' | 'pending_choice' | 'refunded_tokens' | 'refunded_bank'
    reminderSent: { type: Boolean, default: false }
})

// Compound Partial Unique Index:
// Enforces that for any doctor, a specific date and time slot can have ONLY ONE active appointment (cancelled === false).
// Cancelled appointments (cancelled === true) are excluded by the partialFilterExpression, allowing slots to be freely re-booked.
appointmentSchema.index(
    { docId: 1, slotDate: 1, slotTime: 1 },
    { unique: true, partialFilterExpression: { cancelled: false } }
)

const appointmentModel = mongoose.models.appointment || mongoose.model("appointment", appointmentSchema)
export default appointmentModel