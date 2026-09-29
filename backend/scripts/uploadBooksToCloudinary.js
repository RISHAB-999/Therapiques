import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const bookPicsDir = path.join(__dirname, '../../frontend/src/assets/book pic');

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const files = fs.readdirSync(bookPicsDir);
  console.log(`Found ${files.length} images in ${bookPicsDir}`);

  // Mapping of filename -> Cloudinary secure URL
  const fileToCloudinaryUrl = {};

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(bookPicsDir, file);
    const publicId = `therapique_books/${path.parse(file).name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    console.log(`[${i + 1}/${files.length}] Uploading ${file}...`);
    try {
      const uploadRes = await cloudinary.uploader.upload(filePath, {
        public_id: publicId,
        overwrite: false,
        resource_type: 'image'
      });
      fileToCloudinaryUrl[file] = uploadRes.secure_url;
      console.log(`  -> ${uploadRes.secure_url}`);
    } catch (err) {
      console.error(`Error uploading ${file}:`, err.message);
      // Try fetching existing if already exists or fallback
      try {
        const details = await cloudinary.api.resource(publicId);
        fileToCloudinaryUrl[file] = details.secure_url;
        console.log(`  -> Retrieved existing: ${details.secure_url}`);
      } catch (e) {
        console.error(`Could not retrieve existing ${file}:`, e.message);
      }
    }
  }

  console.log('\n--- Updating Books in MongoDB ---');
  const booksCollection = mongoose.connection.db.collection('books');
  const allBooks = await booksCollection.find({}).toArray();

  let updatedBooksCount = 0;
  for (const book of allBooks) {
    if (!book.image) continue;

    const rawImages = Array.isArray(book.image) ? book.image : [book.image];
    let modified = false;

    const updatedImages = rawImages.map((imgUrl) => {
      if (typeof imgUrl !== 'string') return imgUrl;

      // Extract filename if it was localhost / book-covers
      if (imgUrl.includes('/book-covers/')) {
        const decodedUrl = decodeURIComponent(imgUrl);
        const filename = decodedUrl.split('/book-covers/').pop();
        if (fileToCloudinaryUrl[filename]) {
          modified = true;
          return fileToCloudinaryUrl[filename];
        }
        // Try finding by matching base name
        const matched = Object.keys(fileToCloudinaryUrl).find(
          f => f.toLowerCase() === filename.toLowerCase() || encodeURIComponent(f) === filename
        );
        if (matched) {
          modified = true;
          return fileToCloudinaryUrl[matched];
        }
      }

      // Check if direct filename match in fileToCloudinaryUrl
      if (fileToCloudinaryUrl[imgUrl]) {
        modified = true;
        return fileToCloudinaryUrl[imgUrl];
      }

      return imgUrl;
    });

    if (modified) {
      await booksCollection.updateOne(
        { _id: book._id },
        { $set: { image: Array.isArray(book.image) ? updatedImages : updatedImages[0] } }
      );
      updatedBooksCount++;
      console.log(`Updated book: ${book.title}`);
    }
  }

  console.log(`Successfully updated ${updatedBooksCount} / ${allBooks.length} books in MongoDB.`);

  console.log('\n--- Updating Orders in MongoDB ---');
  const ordersCollection = mongoose.connection.db.collection('orders');
  const allOrders = await ordersCollection.find({}).toArray();
  let updatedOrdersCount = 0;

  for (const order of allOrders) {
    if (!order.items || !Array.isArray(order.items)) continue;
    let orderModified = false;

    const updatedItems = order.items.map((item) => {
      let itemImg = item.image;
      if (Array.isArray(itemImg)) itemImg = itemImg[0];
      if (typeof itemImg === 'string' && itemImg.includes('/book-covers/')) {
        const decodedUrl = decodeURIComponent(itemImg);
        const filename = decodedUrl.split('/book-covers/').pop();
        if (fileToCloudinaryUrl[filename]) {
          orderModified = true;
          return { ...item, image: [fileToCloudinaryUrl[filename]] };
        }
      }
      return item;
    });

    if (orderModified) {
      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { items: updatedItems } }
      );
      updatedOrdersCount++;
    }
  }
  console.log(`Successfully updated ${updatedOrdersCount} / ${allOrders.length} orders in MongoDB.`);

  console.log('\nDone! Closing DB connection...');
  await mongoose.disconnect();
  console.log('Migration finished successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
