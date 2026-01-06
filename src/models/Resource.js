import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['pdf', 'video', 'image', 'document'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String
  },
  content: {
    type: String
  },
  thumbnailUrl: {
    type: String
  },
  previewUrl: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  allowedPlans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  }],
  accessedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

export default mongoose.model('Resource', resourceSchema);