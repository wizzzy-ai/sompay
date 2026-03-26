import mongoose from "mongoose";

const connectDB = async () =>{
    try {
        const mongoUri =
          process.env.MONGODB_URI ||
          process.env.MONGO_URI ||
          process.env.MONGO_URL ||
          "mongodb://localhost:27017/psp";

        const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 })
        console.log(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.log(`Error: ${error.message}`);
        process.exit(1)
    }
}

export default connectDB;
