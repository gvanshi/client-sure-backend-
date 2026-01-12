import jwt from "jsonwebtoken";

import Admin from "../../models/Admin.js";
import bcrypt from "bcrypt";

// POST /api/admin/login
export const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body; // frontend sends 'username' but it might be email

    console.log("Received credentials login request for:", username);

    // Find admin by email or username
    const admin = await Admin.findOne({
      $or: [{ email: username }, { username: username }],
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: admin._id,
        username: admin.username,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      message: "Login successful",
      token: token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/logout
export const adminLogout = (req, res) => {
  res.clearCookie("adminToken");
  res.json({ message: "Logout successful" });
};
