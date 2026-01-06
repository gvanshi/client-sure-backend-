import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';

dotenv.config();

const migrateMilestoneSystem = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('🔄 Migrating milestone system from boolean to cycle-based...');

    // Find users with old milestone structure
    const usersToMigrate = await User.find({
      $or: [
        { 'milestoneRewards.referral8Achieved': { $exists: true } },
        { 'milestoneRewards.referral15Achieved': { $exists: true } },
        { 'milestoneRewards.referral25Achieved': { $exists: true } }
      ]
    });

    console.log(`Found ${usersToMigrate.length} users to migrate`);

    let migratedCount = 0;

    for (const user of usersToMigrate) {
      const oldMilestones = user.milestoneRewards || {};
      let totalTokensEarned = 0;
      
      // Convert old boolean achievements to cycle counts
      const newMilestones = {
        referral8Cycles: oldMilestones.referral8Achieved ? 1 : 0,
        referral8LastReset: oldMilestones.referral8AchievedAt || null,
        referral15Cycles: oldMilestones.referral15Achieved ? 1 : 0,
        referral15LastReset: oldMilestones.referral15AchievedAt || null,
        referral25Cycles: oldMilestones.referral25Achieved ? 1 : 0,
        referral25LastReset: oldMilestones.referral25AchievedAt || null,
        totalTokensEarned: 0
      };

      // Calculate total tokens earned from previous achievements
      if (oldMilestones.referral8Achieved) totalTokensEarned += 300;
      if (oldMilestones.referral15Achieved) totalTokensEarned += 500;
      if (oldMilestones.referral25Achieved) totalTokensEarned += 1000;
      
      newMilestones.totalTokensEarned = totalTokensEarned;

      // Update user with new milestone structure
      await User.findByIdAndUpdate(user._id, {
        $set: { milestoneRewards: newMilestones }
      });

      migratedCount++;
      console.log(`✅ Migrated user ${user.email}: ${totalTokensEarned} tokens earned from previous achievements`);
    }

    // Initialize milestone structure for users without any milestones
    const usersWithoutMilestones = await User.find({
      milestoneRewards: { $exists: false }
    });

    for (const user of usersWithoutMilestones) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          milestoneRewards: {
            referral8Cycles: 0,
            referral8LastReset: null,
            referral15Cycles: 0,
            referral15LastReset: null,
            referral25Cycles: 0,
            referral25LastReset: null,
            totalTokensEarned: 0
          }
        }
      });
    }

    console.log(`\n🎯 Migration completed successfully!`);
    console.log(`📊 Statistics:`);
    console.log(`   - Users migrated: ${migratedCount}`);
    console.log(`   - Users initialized: ${usersWithoutMilestones.length}`);
    console.log(`   - Total users processed: ${migratedCount + usersWithoutMilestones.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration
migrateMilestoneSystem();