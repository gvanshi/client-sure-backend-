import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import TokenPackage from "../models/TokenPackage.js";
import dbConnect from "../config/db.js";

// Load .env from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env") });

const tokenPackages = [
  {
    _id: "69312351c44a9610e52be7d0",
    name: "Emergency Boost",
    tokens: 100,
    price: 149,
    description: "Quick token boost for urgent needs",
    isActive: true,
    isPopular: false,
    sortOrder: 1,
    metadata: {
      category: "emergency",
      validityHours: 24,
      maxPurchasePerDay: 5,
    },
    createdAt: "2025-12-04T05:59:45.680Z",
    updatedAt: "2025-12-04T05:59:45.680Z",
  },
  {
    _id: "69312351c44a9610e52be7d1",
    name: "Standard Pack",
    tokens: 300,
    price: 399,
    description: "Perfect for moderate usage",
    isActive: true,
    isPopular: true,
    sortOrder: 2,
    metadata: {
      category: "standard",
      validityHours: 24,
      maxPurchasePerDay: 10,
    },
    createdAt: "2025-12-04T05:59:45.683Z",
    updatedAt: "2025-12-04T05:59:45.683Z",
  },
  {
    _id: "69312351c44a9610e52be7d2",
    name: "Value Pack",
    tokens: 700,
    price: 799,
    description: "Best value for heavy users",
    isActive: true,
    isPopular: false,
    sortOrder: 3,
    metadata: {
      category: "premium",
      validityHours: 24,
      maxPurchasePerDay: 10,
    },
    createdAt: "2025-12-04T05:59:45.683Z",
    updatedAt: "2025-12-04T05:59:45.683Z",
  },
  {
    _id: "69312351c44a9610e52be7d3",
    name: "Power Pack",
    tokens: 2000,
    price: 1999,
    description: "Maximum tokens for power users",
    isActive: true,
    isPopular: false,
    sortOrder: 4,
    metadata: {
      category: "bulk",
      validityHours: 24,
      maxPurchasePerDay: 5,
    },
    createdAt: "2025-12-04T05:59:45.683Z",
    updatedAt: "2025-12-04T05:59:45.683Z",
  },
];

export const seedTokenPackages = async () => {
  try {
    await dbConnect();

    // Check if packages already exist
    const existingCount = await TokenPackage.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Token packages already exist (${existingCount} packages). Skipping seed.`,
      );
      console.log(
        "To force re-seed, manually delete packages first or use seedTokenPackagesForce()",
      );
      return await TokenPackage.find().sort({ sortOrder: 1 });
    }

    // Insert new packages only if none exist
    const createdPackages = await TokenPackage.insertMany(tokenPackages);
    console.log(`Created ${createdPackages.length} token packages:`);

    createdPackages.forEach((pkg) => {
      console.log(
        `- ${pkg.name}: ${pkg.tokens} tokens for ₹${pkg.price} (₹${(pkg.price / pkg.tokens).toFixed(2)}/token)`,
      );
    });

    return createdPackages;
  } catch (error) {
    console.error("Error seeding token packages:", error);
    throw error;
  }
};

// Force seed - deletes existing and recreates (use with caution)
export const seedTokenPackagesForce = async () => {
  try {
    await dbConnect();

    // Clear existing packages
    await TokenPackage.deleteMany({});
    console.log("Cleared existing token packages");

    // Insert new packages
    const createdPackages = await TokenPackage.insertMany(tokenPackages);
    console.log(`Created ${createdPackages.length} token packages:`);

    createdPackages.forEach((pkg) => {
      console.log(
        `- ${pkg.name}: ${pkg.tokens} tokens for ₹${pkg.price} (₹${(pkg.price / pkg.tokens).toFixed(2)}/token)`,
      );
    });

    return createdPackages;
  } catch (error) {
    console.error("Error seeding token packages:", error);
    throw error;
  }
};

// Run seeder if called directly
if (process.argv[1]?.includes("seedTokenPackages")) {
  seedTokenPackages()
    .then(() => {
      console.log("Token packages seeded successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to seed token packages:", error);
      process.exit(1);
    });
}
