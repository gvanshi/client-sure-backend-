import bcrypt from 'bcrypt';
import { User } from '../models/index.js';
import '../config/db.js'; // This will connect to the database

const seedTestUser = async () => {
  try {
    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    if (existingUser) {
      console.log('Test user already exists');
      process.exit(0);
      return;
    }

    // Create test user with bcrypt hashed password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash('testpassword123', saltRounds);

    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      passwordHash,
      tokens: 1000,
      tokensUsedTotal: 0,
      subscription: {
        planId: null,
        dailyTokens: 100,
        endDate: null
      },
      resetTokenHash: undefined,
      resetTokenExpires: undefined
    });

    await testUser.save();
    console.log('Test user created successfully');

  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    process.exit(0);
  }
};

seedTestUser();