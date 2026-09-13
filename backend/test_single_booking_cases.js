import mongoose from 'mongoose';
import dotenv from 'dotenv';
import appointmentModel from './models/appointmentModel.js';
import doctorModel from './models/doctorModel.js';
import userModel from './models/userModel.js';

dotenv.config();

async function runSingleBookingTests() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // 1. Ensure indexes are built
        console.log('Ensuring appointmentSchema indexes are built...');
        await appointmentModel.syncIndexes();
        const indexes = await appointmentModel.collection.indexes();
        console.log('Current appointmentModel indexes in MongoDB:');
        console.log(JSON.stringify(indexes, null, 2));

        // Verify partial unique index exists
        const uniqueIndex = indexes.find(idx => idx.unique === true && idx.key?.docId && idx.key?.slotDate && idx.key?.slotTime);
        if (!uniqueIndex) {
            throw new Error('Partial unique index on { docId, slotDate, slotTime } was NOT found!');
        }
        console.log('✅ Partial unique index verified:', uniqueIndex.name, uniqueIndex.partialFilterExpression);

        // Find or create test doctor & users
        let docA = await doctorModel.findOne({ available: true });
        let docB = await doctorModel.findOne({ available: true, _id: { $ne: docA._id } });

        if (!docA) {
            throw new Error('No doctor found in DB for testing');
        }

        const testDocAId = docA._id.toString();
        const testDocBId = docB ? docB._id.toString() : 'mock_doc_b_' + Date.now();
        const patientAId = 'test_patient_a_' + Date.now();
        const patientBId = 'test_patient_b_' + Date.now();
        const testDate = '99_99_2099'; // Safe test date far in the future
        const testTime1 = '10:30 AM';
        const testTime2 = '11:00 AM';

        // Helper cleanup function
        const cleanupTestDocs = async () => {
            await appointmentModel.deleteMany({
                slotDate: testDate
            });
        };

        await cleanupTestDocs();
        console.log('\n--- Starting Single Booking Test Cases ---');

        // CASE 1: Patient A books 10:30 AM -> Patient B tries to book 10:30 AM -> Patient B must be rejected
        console.log('\n[TEST 1] Patient A books 10:30 AM; Patient B tries to book 10:30 AM');
        const app1 = new appointmentModel({
            userId: patientAId,
            docId: testDocAId,
            slotDate: testDate,
            slotTime: testTime1,
            userData: { name: 'Patient A', email: 'a@test.com' },
            docData: { name: 'Doctor A', fees: 500 },
            amount: 500,
            date: Date.now(),
            cancelled: false
        });
        await app1.save();
        console.log('Patient A booking saved successfully.');

        let patientBRejected = false;
        try {
            const appB = new appointmentModel({
                userId: patientBId,
                docId: testDocAId,
                slotDate: testDate,
                slotTime: testTime1,
                userData: { name: 'Patient B', email: 'b@test.com' },
                docData: { name: 'Doctor A', fees: 500 },
                amount: 500,
                date: Date.now(),
                cancelled: false
            });
            await appB.save();
        } catch (err) {
            if (err.code === 11000) {
                patientBRejected = true;
                console.log('✅ Patient B duplicate booking correctly REJECTED by Mongo E11000 duplicate key error.');
            } else {
                console.error('Unexpected error:', err);
            }
        }
        if (!patientBRejected) {
            throw new Error('FAILED: Patient B was NOT rejected for duplicate slot!');
        }

        // CASE 2: Patient A books 10:30 AM; Patient B books 11:00 AM (Same doctor, different time) -> Both succeed
        console.log('\n[TEST 2] Patient B books 11:00 AM with Doctor A (different time)');
        const app2 = new appointmentModel({
            userId: patientBId,
            docId: testDocAId,
            slotDate: testDate,
            slotTime: testTime2,
            userData: { name: 'Patient B', email: 'b@test.com' },
            docData: { name: 'Doctor A', fees: 500 },
            amount: 500,
            date: Date.now(),
            cancelled: false
        });
        await app2.save();
        console.log('✅ Different time slot for same doctor booked successfully.');

        // CASE 3: Patient A books Doctor A at 10:30 AM; Patient B books Doctor B at 10:30 AM -> Both succeed
        console.log('\n[TEST 3] Patient B books Doctor B at 10:30 AM (different doctor, same time)');
        const app3 = new appointmentModel({
            userId: patientBId,
            docId: testDocBId,
            slotDate: testDate,
            slotTime: testTime1,
            userData: { name: 'Patient B', email: 'b@test.com' },
            docData: { name: 'Doctor B', fees: 600 },
            amount: 600,
            date: Date.now(),
            cancelled: false
        });
        await app3.save();
        console.log('✅ Same time slot for different doctor booked successfully.');

        // CASE 4: Patient A cancels Doctor A at 10:30 AM -> Patient B books Doctor A at 10:30 AM -> Succeeds
        console.log('\n[TEST 4] Patient A cancels appointment -> Patient B books same slot');
        await appointmentModel.findByIdAndUpdate(app1._id, { cancelled: true });
        console.log('Patient A appointment cancelled (cancelled: true).');

        const app4 = new appointmentModel({
            userId: patientBId,
            docId: testDocAId,
            slotDate: testDate,
            slotTime: testTime1,
            userData: { name: 'Patient B', email: 'b@test.com' },
            docData: { name: 'Doctor A', fees: 500 },
            amount: 500,
            date: Date.now(),
            cancelled: false
        });
        await app4.save();
        console.log('✅ Patient B successfully booked the released slot after cancellation.');

        // CASE 5: Race Condition / Concurrency Test
        console.log('\n[TEST 5] Race Condition: Two concurrent requests attempting to book the same slot simultaneously');
        const raceDate = '98_98_2099';
        const raceTime = '02:30 PM';

        const createBookingPromise = async (patientName, pId) => {
            const appointment = new appointmentModel({
                userId: pId,
                docId: testDocAId,
                slotDate: raceDate,
                slotTime: raceTime,
                userData: { name: patientName, email: `${pId}@test.com` },
                docData: { name: 'Doctor A', fees: 500 },
                amount: 500,
                date: Date.now(),
                cancelled: false
            });
            return appointment.save();
        };

        const results = await Promise.allSettled([
            createBookingPromise('Race Patient 1', 'race_user_1'),
            createBookingPromise('Race Patient 2', 'race_user_2')
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        console.log(`Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);
        if (fulfilled.length === 1 && rejected.length === 1) {
            console.log('✅ Race condition correctly resolved: Exactly 1 appointment succeeded, 1 rejected with duplicate key error.');
        } else {
            throw new Error(`FAILED Race condition test! Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);
        }

        const activeCount = await appointmentModel.countDocuments({
            docId: testDocAId,
            slotDate: raceDate,
            slotTime: raceTime,
            cancelled: false
        });
        console.log(`Database active appointments for race slot: ${activeCount}`);
        if (activeCount !== 1) {
            throw new Error(`Expected exactly 1 active appointment in DB, found ${activeCount}`);
        }

        // Cleanup test entries
        await cleanupTestDocs();
        await appointmentModel.deleteMany({ slotDate: raceDate });
        console.log('\nCleanup completed.');

        console.log('\n========================================');
        console.log('🎉 ALL 5 TEST CASES PASSED WITH 100% SUCCESS!');
        console.log('========================================\n');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Test execution failed:', err);
        process.exit(1);
    }
}

runSingleBookingTests();
