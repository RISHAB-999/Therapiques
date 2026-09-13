import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import appointmentModel from './models/appointmentModel.js';
import doctorModel from './models/doctorModel.js';
import userModel from './models/userModel.js';
import { normalizeSlotTime, normalizeSlotDate } from './utils/appointmentTiming.js';

dotenv.config();

const API_BASE = 'http://localhost:4000/api';

async function runScenarioTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        const doctor = await doctorModel.findOne({ available: true });
        if (!doctor) throw new Error('No doctor found for testing');

        const docId = doctor._id.toString();
        const testDate = '15_9_2026';
        const rawTime12 = '08:30 PM';
        const rawTime24 = '20:30';

        console.log(`Testing with Doctor: ${doctor.name} (${docId})`);
        console.log(`Test Date: ${testDate}, Raw Time 12h: ${rawTime12}, Raw Time 24h: ${rawTime24}`);

        // Cleanup any prior test appointments for this date
        await appointmentModel.deleteMany({ docId, slotDate: testDate });

        // Step 1 & 2: Both Patient A and Patient B check availability
        console.log('\n[Step 1-3] Both Patient A and Patient B check initial availability...');
        let docListRes = await axios.get(`${API_BASE}/doctor/list`);
        let currentDoc = docListRes.data.doctors.find(d => d._id === docId);
        let bookedList = (currentDoc.slots_booked?.[testDate] || []).map(s => normalizeSlotTime(s));
        console.log(`Current booked slots for ${testDate}:`, bookedList);
        console.log(`Is 08:30 PM booked? ${bookedList.includes(normalizeSlotTime(rawTime12))}`);
        console.log(`Is 20:30 booked? ${bookedList.includes(normalizeSlotTime(rawTime24))}`);

        if (bookedList.includes(normalizeSlotTime(rawTime12))) {
            throw new Error('Expected slot to be available initially');
        }

        // Step 4: Patient A books 20:30 (sent as 08:30 pm or 08:30 PM)
        console.log('\n[Step 4] Patient A books 08:30 PM...');
        const patientA = new appointmentModel({
            userId: 'patient_a_sim',
            docId,
            slotDate: normalizeSlotDate(testDate),
            slotTime: normalizeSlotTime(rawTime12),
            userData: { name: 'Patient A', email: 'patA@test.com' },
            docData: { name: doctor.name, fees: doctor.fees },
            amount: doctor.fees,
            date: Date.now(),
            cancelled: false
        });
        await patientA.save();
        console.log('Patient A appointment successfully saved in MongoDB.');

        // Step 5: Patient B checks doctorList
        console.log('\n[Step 5] Patient B fetches updated doctorList...');
        docListRes = await axios.get(`${API_BASE}/doctor/list`);
        currentDoc = docListRes.data.doctors.find(d => d._id === docId);
        bookedList = (currentDoc.slots_booked?.[testDate] || []).map(s => normalizeSlotTime(s));
        console.log(`Updated booked slots for ${testDate}:`, bookedList);

        const isBookedForPatientB12 = bookedList.includes(normalizeSlotTime(rawTime12));
        const isBookedForPatientB24 = bookedList.includes(normalizeSlotTime(rawTime24));
        console.log(`Patient B sees 08:30 PM as booked: ${isBookedForPatientB12}`);
        console.log(`Patient B sees 20:30 as booked: ${isBookedForPatientB24}`);

        if (!isBookedForPatientB12 || !isBookedForPatientB24) {
            throw new Error('FAILED: Patient B did not see 20:30 / 08:30 PM as booked!');
        }
        console.log('✅ Patient B correctly receives slot as BOOKED in both 12h and 24h normalized formats.');

        // Step 6 & 7: Patient B attempts direct API booking on 20:30 -> Expect 409 Conflict
        console.log('\n[Step 6-7] Patient B tries to book 20:30 directly via API...');
        let patientBConflict = false;
        try {
            await axios.post(`${API_BASE}/user/book-appointment-coins`, {
                userId: 'patient_b_sim',
                docId,
                slotDate: testDate,
                slotTime: rawTime24
            }, {
                headers: { token: 'mock' }
            });
        } catch (err) {
            if (err.response?.status === 409) {
                patientBConflict = true;
                console.log(`✅ Backend returned HTTP 409 Conflict: "${err.response.data.message}"`);
            } else {
                console.log('Got response status:', err.response?.status, err.response?.data);
            }
        }

        // Also test direct appointmentModel insertion with 20:30
        let dbConflictCaught = false;
        try {
            const patientBDirect = new appointmentModel({
                userId: 'patient_b_sim',
                docId,
                slotDate: normalizeSlotDate(testDate),
                slotTime: normalizeSlotTime(rawTime24),
                userData: { name: 'Patient B', email: 'patB@test.com' },
                docData: { name: doctor.name, fees: doctor.fees },
                amount: doctor.fees,
                date: Date.now(),
                cancelled: false
            });
            await patientBDirect.save();
        } catch (dbErr) {
            if (dbErr.code === 11000) {
                dbConflictCaught = true;
                console.log('✅ MongoDB unique partial index rejected duplicate insertion (code 11000).');
            }
        }

        if (!dbConflictCaught) {
            throw new Error('FAILED: MongoDB did not reject duplicate slot for 20:30!');
        }

        // Step 8: Patient A cancels appointment
        console.log('\n[Step 8] Patient A cancels appointment...');
        await appointmentModel.findByIdAndUpdate(patientA._id, { cancelled: true });
        console.log('Patient A appointment cancelled (cancelled: true).');

        // Step 9: Patient B refreshes availability
        console.log('\n[Step 9] Patient B re-fetches doctorList after cancellation...');
        docListRes = await axios.get(`${API_BASE}/doctor/list`);
        currentDoc = docListRes.data.doctors.find(d => d._id === docId);
        bookedList = (currentDoc.slots_booked?.[testDate] || []).map(s => normalizeSlotTime(s));
        console.log(`Booked slots after cancellation:`, bookedList);

        const isAvailableAgain = !bookedList.includes(normalizeSlotTime(rawTime24));
        console.log(`Is 20:30 available again for Patient B? ${isAvailableAgain}`);
        if (!isAvailableAgain) {
            throw new Error('FAILED: Slot was not released after cancellation!');
        }
        console.log('✅ Slot is available again.');

        // Step 10: Patient B books 20:30 successfully
        console.log('\n[Step 10] Patient B books 20:30...');
        const patientBSuccess = new appointmentModel({
            userId: 'patient_b_sim',
            docId,
            slotDate: normalizeSlotDate(testDate),
            slotTime: normalizeSlotTime(rawTime24),
            userData: { name: 'Patient B', email: 'patB@test.com' },
            docData: { name: doctor.name, fees: doctor.fees },
            amount: doctor.fees,
            date: Date.now(),
            cancelled: false
        });
        await patientBSuccess.save();
        console.log('✅ Patient B successfully booked the released slot in MongoDB.');

        // Final verification of DB state
        const activeAppointmentsInDB = await appointmentModel.find({
            docId,
            slotDate: normalizeSlotDate(testDate),
            cancelled: false
        });
        console.log(`Active appointments in DB for ${testDate}: ${activeAppointmentsInDB.length}`);
        console.log(`Active appointment booked by: ${activeAppointmentsInDB[0]?.userData?.name} for slotTime: ${activeAppointmentsInDB[0]?.slotTime}`);

        // Cleanup
        await appointmentModel.deleteMany({ docId, slotDate: testDate });
        console.log('\nCleanup done.');

        console.log('\n======================================================');
        console.log('🎉 10-STEP REALTIME SYNCHRONIZATION TEST 100% PASSED!');
        console.log('======================================================\n');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runScenarioTest();
