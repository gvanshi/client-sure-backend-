import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/index.js';
import { generateReferralCode } from './referralUtils.js';

dotenv.config();

const migrateExistingUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users without referral codes
    const usersWithoutReferralCode = await User.find({
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: '' }
      ]
    });

    console.log(`Found ${usersWithoutReferralCode.length} users without referral codes`);

    for (const user of usersWithoutReferralCode) {
      // Generate unique referral code
      let newReferralCode;
      let isUnique = false;
      
      while (!isUnique) {
        newReferralCode = generateReferralCode();
        const existingUser = await User.findOne({ referralCode: newReferralCode });
        if (!existingUser) isUnique = true;
      }

      // Update user with referral code and stats
      await User.findByIdAndUpdate(user._id, {
        referralCode: newReferralCode,
        referrals: [],
        referralStats: {
          totalReferrals: 0,
          activeReferrals: 0,
          totalEarnings: 0
        }
      });

      console.log(`Updated user ${user.email} with referral code: ${newReferralCode}`);
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateExistingUsers();