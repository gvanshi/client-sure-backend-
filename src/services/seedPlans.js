import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Plan } from '../models/index.js';
import dbConnect from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const seedPlans = async () => {
  try {
    const existingPlans = await Plan.countDocuments();
    if (existingPlans > 0) {
      console.log('Plans already exist, skipping seed');
      return;
    }

    console.log('Creating sample plans...');
    const plans = await Plan.insertMany([
      {
        name: 'Basic Plan',
        price: 299,
        durationDays: 30,
        dailyTokens: 100,
        bonusTokens: 0,
        providerPlanId: 'basic_plan_001'
      },
     {
        name: 'Standard Plan',
        price: 799,
        durationDays:95,
        dailyTokens: 100,
        bonusTokens:500,
        providerPlanId: 'standard_plan_001'
      },
      {
        name: 'Premium Plan', 
        price: 1699,
        durationDays: 190,
        bonusTokens:1000,
        dailyTokens: 100,
        providerPlanId: 'premium_plan_001'
      },
      {
        name: 'Pro Plan',
        price: 3599,
        durationDays: 485,
        bonusTokens:12000,
        dailyTokens: 100,
        providerPlanId: 'pro_plan_001'
      }
    ]);

    console.log('Plans created:', plans.length);
    console.log('✅ Plans seeded successfully');
  } catch (error) {
    console.error('❌ Seed plans error:', error.message);
    throw error;
  }
};

(async () => {
  try {
    console.log('Starting plan seed process...');
    await dbConnect();
    await seedPlans();
    console.log('Seeding completed, exiting...');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
})();

export default seedPlans;
