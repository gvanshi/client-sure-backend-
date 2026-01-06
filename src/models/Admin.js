import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  resetTokenHash: {
    type: String,
    required: false
  },
  resetTokenExpires: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Index for faster queries
adminSchema.index({ email: 1 });
adminSchema.index({ isActive: 1 });

export default mongoose.model('Admin', adminSchema);