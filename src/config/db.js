// import mongoose from 'mongoose';
// import dotenv from 'dotenv';
// dotenv.config();

// const dbConnect = async () => {
//     try {
//         const MONGOURL = process.env.MONGO_URI;
//         if (!MONGOURL) {
//             throw new Error('MONGO_URI is not defined in environment variables');
//         }
        
//         console.log("Connecting to MongoDB...");
        
//         // MongoDB Atlas connection options
//         const options = {
//             serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of default 30s
//             socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
//             family: 4 // Use IPv4, skip trying IPv6
//         };
        
//         await mongoose.connect(MONGOURL, options);
//         console.log("✅ Database connected successfully");
        
//     } catch (error) {
//         console.error("❌ Error in DB Connection:", error.message);
//         console.error("Please check:");
//         console.error("1. Your MongoDB Atlas credentials in .env file");
//         console.error("2. That your IP address is whitelisted in MongoDB Atlas");
//         console.error("3. That your MongoDB Atlas cluster is running");
//         process.exit(1); // Exit process with failure
//     }
// }

// export default dbConnect;

import mongoose from "mongoose"
import dotenv from "dotenv"
dotenv.config()
const dbConnect = async () =>{
try {
    const connectInstance = await mongoose.connect(`${process.env.MONGO_URI}`)   //change "" to BACKTICKS and a to $
    console.log(`MongoDB Connected !! DB host : ${connectInstance.connection.host}`); // change "" to BACKTICKS and a to $
} catch (error) {
    console.log("Error: "+ error)
    process.exit(1)
    }
}


export default dbConnect;