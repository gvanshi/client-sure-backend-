import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

const resetLeaderboard = async () => {
    try {
        // Connect to database
        const MONGOURL = process.env.MONGO_URI;
        if (!MONGOURL) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }
        
        console.log("Connecting to MongoDB...");
        await mongoose.connect(MONGOURL, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4
        });
        console.log("✅ Database connected successfully");

        // Find Aditya Raj's current points
        const adityaRaj = await User.findOne({ name: { $regex: /aditya raj/i } });
        let adityaPoints = 0;
        
        if (adityaRaj) {
            adityaPoints = adityaRaj.points;
            console.log(`Found Aditya Raj with ${adityaPoints} points - keeping unchanged`);
        } else {
            console.log("Aditya Raj not found in database");
        }

        // Reset all other users' points to 0
        const result = await User.updateMany(
            { 
                name: { $not: { $regex: /aditya raj/i } },
                points: { $gt: 0 }
            },
            { 
                $set: { 
                    points: 0,
                    'communityActivity.postsCreated': 0,
                    'communityActivity.commentsMade': 0,
                    'communityActivity.likesGiven': 0,
                    'communityActivity.likesReceived': 0
                }
            }
        );

        console.log(`✅ Reset complete! Updated ${result.modifiedCount} users' points to 0`);
        console.log(`Aditya Raj's points remain: ${adityaPoints}`);

        // Show final leaderboard
        const leaderboard = await User.find({ points: { $gt: 0 } })
            .select('name points')
            .sort({ points: -1 })
            .limit(10);

        console.log("\n🏆 Final Leaderboard:");
        leaderboard.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name}: ${user.points} points`);
        });

        if (leaderboard.length === 0) {
            console.log("No users with points > 0");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await mongoose.disconnect();
        console.log("Database connection closed");
        process.exit(0);
    }
};

resetLeaderboard();