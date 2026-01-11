import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Lead } from './src/models/index.js';

dotenv.config();

const countLeads = async () => {
  try {
    // Connect to DB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('Connected to MongoDB');
    }

    const totalLeads = await Lead.countDocuments();
    console.log(`Total leads in database: ${totalLeads}`);

    // Close connection
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error counting leads:', error);
    process.exit(1);
  }
};

countLeads();