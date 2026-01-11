import { manualSubscriptionCheck } from '../../src/services/cronJobs.js';

export default async function handler(req, res) {
  // Authorize either via a CRON secret header or Vercel scheduled request header
  const isVercelCron = req.headers['x-vercel-cron'] || req.headers['x-vercel-cron'] === '1'
  const hasValidAuth = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
  if (!hasValidAuth && !isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await manualSubscriptionCheck();
    console.log('Vercel cron - Subscription check completed:', result);
    
    res.status(200).json({
      success: true,
      message: 'Subscription check completed',
      ...result
    });
  } catch (error) {
    console.error('Vercel cron - Subscription check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}