import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';
import { checkReferralMilestones, getMilestoneProgress } from './src/utils/referralUtils.js';

dotenv.config();

const testMilestoneSystem = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a user with referrals or create test scenario
    const testUser = await User.findOne({ 'referralStats.totalReferrals': { $gt: 0 } });
    
    if (!testUser) {
      console.log('No users with referrals found. Create some referrals first.');
      return;
    }

    console.log(`\nTesting cycle-based milestone system for user: ${testUser.email}`);
    console.log(`Current active referrals: ${testUser.referralStats.activeReferrals}`);
    console.log(`Current milestone cycles:`, testUser.milestoneRewards);

    // Test milestone checking
    console.log('\n--- Testing milestone check ---');
    await checkReferralMilestones(testUser._id);

    // Get updated user data
    const updatedUser = await User.findById(testUser._id);
    console.log(`Updated milestone cycles:`, updatedUser.milestoneRewards);
    console.log(`Temporary tokens:`, updatedUser.temporaryTokens);
    console.log(`Active referrals after check:`, updatedUser.referralStats.activeReferrals);

    // Test milestone progress API
    console.log('\n--- Testing milestone progress ---');
    const milestoneProgress = await getMilestoneProgress(testUser._id);
    console.log('Milestone progress:', JSON.stringify(milestoneProgress, null, 2));

    // Test scenario: Simulate multiple cycles
    console.log('\n--- Simulating multiple cycles ---');
    
    // Cycle 1: 8 referrals
    testUser.referralStats.activeReferrals = 8;
    await testUser.save();
    console.log('\nCycle 1: Set to 8 referrals');
    await checkReferralMilestones(testUser._id);
    
    let cycleUser = await User.findById(testUser._id);
    console.log(`After Cycle 1: Cycles=${cycleUser.milestoneRewards?.referral8Cycles}, Active=${cycleUser.referralStats.activeReferrals}`);
    
    // Cycle 2: Build up to 8 again
    cycleUser.referralStats.activeReferrals = 8;
    await cycleUser.save();
    console.log('\nCycle 2: Set to 8 referrals again');
    await checkReferralMilestones(cycleUser._id);
    
    const finalUser = await User.findById(testUser._id);
    console.log(`After Cycle 2: Cycles=${finalUser.milestoneRewards?.referral8Cycles}, Active=${finalUser.referralStats.activeReferrals}`);
    console.log(`Total tokens earned: ${finalUser.milestoneRewards?.totalTokensEarned}`);

    console.log('\n✅ Milestone system test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the test
testMilestoneSystem();