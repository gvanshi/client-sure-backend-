import { manualSubscriptionCheck } from '../../src/services/cronJobs.js';

export default async function handler(req, res) {
  // Verify this is a cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
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