import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { Plan, Resource, User } from '../models/index.js';
import dbConnect from '../config/db.js';

dotenv.config();

// Seed initial plans and resources
export const seedInitialData = async () => {
  try {
    // Create test user
   
    
    // Check if plans already exist
    const existingPlans = await Plan.countDocuments();
    if (existingPlans > 0) {
      console.log('Plans already exist, skipping seed');
      return;
    }

    console.log('Creating sample plans...');
    // Create sample plans - All get 100 tokens daily, different durations
    const plans = await Plan.insertMany([
      {
        name: 'Basic Plan',
        price: 299,
        durationDays: 30,
        dailyTokens: 100,
        bonusTokens:0,
        providerPlanId: 'basic_plan_001'
      },
      {
        name: 'Standard Plan',
        price: 399,
        durationDays:95,
        dailyTokens: 100,
        bonusTokens:500,
        providerPlanId: 'standard_plan_001'
      },
      {
        name: 'Premium Plan', 
        price: 499,
        durationDays: 190,
        bonusTokens:1000,
        dailyTokens: 100,
        providerPlanId: 'premium_plan_001'
      },
      {
        name: 'Pro Plan',
        price: 999,
        durationDays: 377,
        bonusTokens:12000,
        dailyTokens: 100,
        providerPlanId: 'pro_plan_001'
      }

    ]);

    console.log('Plans created:', plans.length);
    console.log('✅ Initial data seeded successfully');

  } catch (error) {
    console.error('❌ Seed data error:', error.message);
    throw error;
  }
};

// Create test user
// export const createTestUser = async () => {
//   try {
//     // Check if test user already exists
//     const existingUser = await User.findOne({ email: 'test@example.com' });
//     if (existingUser) {
//       console.log('Test user already exists');
//       return;
//     }

//     console.log('Creating test user...');
//     // Create test user with bcrypt hashed password
//     const saltRounds = 12;
//     const passwordHash = await bcrypt.hash('testpassword123', saltRounds);

//     const testUser = new User({
//       name: 'Test User',
//       email: 'test@example.com',
//       passwordHash,
//       tokens: 1000,
//       tokensUsedTotal: 0,
//       subscription: {
//         planId: null,
//         dailyTokens: 100,
//         endDate: null
//       },
//       resetTokenHash: undefined,
//       resetTokenExpires: undefined
//     });

//     await testUser.save();
//     console.log('✅ Test user created successfully');
//   } catch (error) {
//     console.error('❌ Error creating test user:', error.message);
//   }
// };

// Execute seeding if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      console.log('Starting seed process...');
      await dbConnect();
      await seedInitialData();
      console.log('Seeding completed, exiting...');
      process.exit(0);
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    }
  })();
}