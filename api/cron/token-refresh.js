import { manualTokenRefresh } from '../../src/services/cronJobs.js';

export default async function handler(req, res) {
  // Authorize either via a CRON secret header or Vercel scheduled request header
  const isVercelCron = req.headers['x-vercel-cron'] || req.headers['x-vercel-cron'] === '1'
  const hasValidAuth = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
  if (!hasValidAuth && !isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await manualTokenRefresh();
    console.log('Vercel cron - Token refresh completed:', result);
    
    res.status(200).json({
      success: true,
      message: 'Token refresh completed',
      ...result
    });
  } catch (error) {
    console.error('Vercel cron - Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}