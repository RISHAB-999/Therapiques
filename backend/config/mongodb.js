import mongoose from "mongoose";

const connectDB = async () => {
    mongoose.connection
        .once("connected", () => {
            console.log("Database connected");
        })
    await mongoose.connect(process.env.MONGO_URI, {
        maxPoolSize: 10,                    // Handle concurrent queries efficiently
        serverSelectionTimeoutMS: 5000,     // Fail fast on Render cold starts instead of hanging
        socketTimeoutMS: 45000,             // Allow for longer queries without dropping connection
    });
};

export default connectDB;
