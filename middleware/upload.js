import multer from 'multer';
import { AppError } from '../utils/app-error.js';

// Use memory storage so the file buffer is available via req.file.buffer.
// Vercel Serverless Functions have a read-only filesystem, so disk storage
// cannot be used in production. The buffer is streamed to Vercel Blob instead.
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError('Only JPEG, PNG, and WebP images are allowed.', {
        status: 400,
        code: 'INVALID_FILE_TYPE',
      }),
      false,
    );
  }
};

export const uploadItemImage = multer({
  storage,
  // Keep below Vercel's 4.5 MB serverless request body limit.
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter,
});
