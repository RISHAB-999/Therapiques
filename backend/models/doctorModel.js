import mongoose from "mongoose"

const doctorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    speciality: {
        type: String,
        required: true
    },
    degree: {
        type: String,
        required: true
    },
    experience: {
        type: String,
        required: true
    },
    about: {
        type: String,
        required: true
    },
    available: {
        type: Boolean,
        default: true
    },
    fees: {
        type: Number,
        required: true,
        min: [1, 'Fees must be a positive amount'],
        max: [100000, 'Fees are too high']
    },
    address: {
        type: Object,
        required: true
    },
    date: {
        type: Number,
        required: true
    },
    slots_booked: {
        type: Object,
        default: {}
    },
    // Incremented when credentials change to revoke every previously issued doctor token
    tokenVersion: {
        type: Number,
        default: 0
    }
}, {
    minimize: false // Prevent mongoose from removing empty objects
});

const doctorModel = mongoose.models.doctor || mongoose.model("doctor", doctorSchema);

export default doctorModel;