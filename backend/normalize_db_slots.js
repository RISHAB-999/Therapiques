import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const normalizeSlotTime = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?:\s*([a-zA-Z]+))?$/i);
  if (!match) return str;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3] ? match[3].toUpperCase() : null;
  if (modifier === 'PM' && hours < 12) hours += 12;
  else if (modifier === 'AM' && hours === 12) hours = 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
};

const normalizeSlotDate = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (str.includes('_')) {
    const parts = str.split('_').map(p => parseInt(p, 10));
    if (parts.length >= 3) return `${parts[0]}_${parts[1]}_${parts[2]}`;
  }
  return str;
};

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const apps = await db.collection('appointments').find({}).toArray();
    for (const app of apps) {
        const normTime = normalizeSlotTime(app.slotTime);
        const normDate = normalizeSlotDate(app.slotDate);
        if (normTime !== app.slotTime || normDate !== app.slotDate) {
            console.log(`Updating app ${app._id}: ${app.slotDate} ${app.slotTime} -> ${normDate} ${normTime}`);
            await db.collection('appointments').updateOne(
                { _id: app._id },
                { $set: { slotDate: normDate, slotTime: normTime } }
            );
        }
    }
    console.log('All appointment records normalized.');
    await mongoose.disconnect();
}
run();
