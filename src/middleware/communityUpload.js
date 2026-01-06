import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Custom storage engine for Cloudinary
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Upload middleware
export const communityUpload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Cloudinary upload function
export const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const publicId = `post-${timestamp}-${random}`;
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'clientsure/community-posts',
        public_id: publicId,
        transformation: [
          { width: 1200, height: 800, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ],
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp']
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream);
  });
};

export { cloudinary };