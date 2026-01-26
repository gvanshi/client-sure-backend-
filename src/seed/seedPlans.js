import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Plan from "../models/Plan.js";
import dbConnect from "../config/db.js";

// Load .env from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env") });

const plans = [
  {
    _id: "692b60d410a688989f325ff1",
    name: "Basic Plan",
    price: 999,
    durationDays: 30,
    dailyTokens: 100,
    bonusTokens: 0,
    totalPlanTokens: 3000, // 30 * 100 + 0
    referralCommission: 100,
    providerPlanId: "basic_plan_001",
    createdAt: "2025-11-29T21:08:36.706Z",
    updatedAt: "2025-11-29T21:08:36.706Z",
  },
  {
    _id: "692b60d410a688989f325ff2",
    name: "Standard Plan",
    price: 2499,
    durationDays: 90,
    dailyTokens: 100,
    bonusTokens: 500,
    totalPlanTokens: 9500, // 90 * 100 + 500
    referralCommission: 250,
    providerPlanId: "standard_plan_001",
    createdAt: "2025-11-29T21:08:36.709Z",
    updatedAt: "2025-11-29T21:08:36.709Z",
  },
  {
    _id: "692b60d410a688989f325ff3",
    name: "Premium Plan",
    price: 4499,
    durationDays: 180,
    dailyTokens: 100,
    bonusTokens: 1000,
    totalPlanTokens: 19000, // 180 * 100 + 1000
    referralCommission: 450,
    providerPlanId: "premium_plan_001",
    createdAt: "2025-11-29T21:08:36.709Z",
    updatedAt: "2025-11-29T21:08:36.709Z",
  },
  {
    _id: "692b60d410a688989f325ff4",
    name: "Pro Plan",
    price: 7999,
    durationDays: 365,
    dailyTokens: 100,
    bonusTokens: 12000,
    totalPlanTokens: 48500, // 365 * 100 + 12000
    referralCommission: 800,
    providerPlanId: "pro_plan_001",
    createdAt: "2025-11-29T21:08:36.709Z",
    updatedAt: "2025-11-29T21:08:36.709Z",
  },
];

export const seedPlans = async () => {
  try {
    await dbConnect();

    // Check if plans already exist
    const existingCount = await Plan.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Plans already exist (${existingCount} plans). Skipping seed.`,
      );
      console.log(
        "To force re-seed, manually delete plans first or use seedPlansForce()",
      );
      return await Plan.find().sort({ price: 1 });
    }

    // Insert new plans
    const createdPlans = await Plan.insertMany(plans);
    console.log(`Created ${createdPlans.length} plans:`);

    createdPlans.forEach((plan) => {
      console.log(
        `- ${plan.name}: ${plan.durationDays} days for ₹${plan.price} ` +
          `(Daily: ${plan.dailyTokens}, Bonus: ${plan.bonusTokens}, Total: ${plan.totalPlanTokens || "N/A"})`,
      );
    });

    return createdPlans;
  } catch (error) {
    console.error("Error seeding plans:", error);
    throw error;
  }
};

// Force seed - deletes existing and recreates (use with caution)
export const seedPlansForce = async () => {
  try {
    await dbConnect();

    // Clear existing plans
    await Plan.deleteMany({});
    console.log("Cleared existing plans");

    // Insert new plans
    const createdPlans = await Plan.insertMany(plans);
    console.log(`Created ${createdPlans.length} plans:`);

    createdPlans.forEach((plan) => {
      console.log(
        `- ${plan.name}: ${plan.durationDays} days for ₹${plan.price} ` +
          `(Daily: ${plan.dailyTokens}, Bonus: ${plan.bonusTokens}, Total: ${plan.totalPlanTokens || "N/A"})`,
      );
    });

    return createdPlans;
  } catch (error) {
    console.error("Error seeding plans:", error);
    throw error;
  }
};

// Run seeder if called directly
if (process.argv[1]?.includes("seedPlans")) {
  const runSeed = process.argv.includes("--force") ? seedPlansForce : seedPlans;

  runSeed()
    .then(() => {
      console.log("Plans seeded successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to seed plans:", error);
      process.exit(1);
    });
}
