import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  leadId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
 
 
  linkedin: {
    type: String,
    trim: true
  },
  lastVerifiedAt: {
    type: Date
  },
  phone: {
    type: String,
    trim: true
  },
  facebookLink: {
    type: String,
    trim: true
  },
  websiteLink: {
    type: String,
    trim: true
  },
  googleMapLink: {
    type: String,
    trim: true
  },
  instagram: {
    type: String,
    trim: true
  },
  addressStreet: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  uploadSequence: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  accessedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

export default mongoose.model('Lead', leadSchema);