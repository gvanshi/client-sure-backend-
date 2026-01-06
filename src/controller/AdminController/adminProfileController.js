import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Admin from '../../models/Admin.js';

// Admin Signup
export const adminSignup = async (req, res) => {
  try {
    const { name, email, password, adminSecret } = req.body;

    // Validate admin secret
    if (adminSecret !== process.env.ADMIN_SIGNUP_SECRET) {
      return res.status(403).json({ error: 'Invalid admin secret key' });
    }

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create admin
    const admin = new Admin({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'admin'
    });

    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email, 
        role: admin.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Admin signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Admin Profile
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id)
      .select('-passwordHash -resetTokenHash -resetTokenExpires');

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        lastLogin: admin.lastLogin
      }
    });

  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update Admin Profile
export const updateAdminProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email is already in use by another admin
    const existingAdmin = await Admin.findOne({ 
      email: email.toLowerCase(), 
      _id: { $ne: req.admin.id } 
    });

    if (existingAdmin) {
      return res.status(400).json({ error: 'Email is already in use by another admin' });
    }

    // Update admin profile
    const admin = await Admin.findByIdAndUpdate(
      req.admin.id,
      { 
        name: name.trim(), 
        email: email.toLowerCase().trim() 
      },
      { new: true }
    ).select('-passwordHash -resetTokenHash -resetTokenExpires');

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        lastLogin: admin.lastLogin
      }
    });

  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Change Admin Password
export const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    // Get admin with password
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, admin.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    admin.passwordHash = newPasswordHash;
    await admin.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset Admin Password Request
export const requestAdminPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found with this email' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save reset token
    admin.resetTokenHash = resetTokenHash;
    admin.resetTokenExpires = resetTokenExpires;
    await admin.save();

    // In production, send email with reset link
    // For now, return the token (remove this in production)
    res.json({
      success: true,
      message: 'Password reset token generated',
      resetToken: resetToken // Remove this in production
    });

  } catch (error) {
    console.error('Request admin password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset Admin Password
export const resetAdminPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find admin with valid reset token
    const admin = await Admin.findOne({
      resetTokenHash,
      resetTokenExpires: { $gt: new Date() }
    });

    if (!admin) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    admin.passwordHash = passwordHash;
    admin.resetTokenHash = undefined;
    admin.resetTokenExpires = undefined;
    await admin.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset admin password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};