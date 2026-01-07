import bcrypt from "bcrypt";
import Admin from "../models/Admin.js";
import dbConnect from "../config/db.js";

const seedAdminCount = async () => {
  await dbConnect();
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@clientsure.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const adminName = "Super Admin";

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("Admin user already exists");
      process.exit(0);
      return;
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // Create Admin
    const newAdmin = new Admin({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "super_admin",
      isActive: true,
    });

    await newAdmin.save();
    console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
  } catch (error) {
    console.error("Error seeding admin:", error);
  } finally {
    process.exit(0);
  }
};

seedAdminCount();
