import { createTransporter, sendEmailWithRetry } from '../utils/emailUtils.js';

/**
 * Send subscription expiry warning email
 * @param {object} user - User object
 * @param {number} daysLeft - Days until expiry
 * @returns {Promise<boolean>} Success status
 */
export const sendExpiryWarningEmail = async (user, daysLeft) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const renewalLink = `${process.env.BASE_URL}/user/subscription?renewal=true&email=${encodeURIComponent(user.email)}`;
    const urgencyColor = daysLeft <= 1 ? '#dc3545' : daysLeft <= 3 ? '#fd7e14' : '#ffc107';
    const urgencyIcon = daysLeft <= 1 ? '🚨' : daysLeft <= 3 ? '⚠️' : '⏰';

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `${urgencyIcon} Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, ${urgencyColor} 0%, ${urgencyColor}dd 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">${urgencyIcon} Subscription Expiring Soon</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: ${urgencyColor};">Hello ${user.name},</h2>
            
            <p>Your ClientSure subscription will expire in <strong style="color: ${urgencyColor};">${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
            
            <div style="background: #fff3cd; padding: 20px; border-left: 4px solid ${urgencyColor}; margin: 20px 0; border-radius: 5px;">
              <h3 style="margin-top: 0; color: #856404;">📅 Subscription Details:</h3>
              <p style="margin: 5px 0;"><strong>Plan:</strong> ${user.subscription?.planId?.name || 'Premium'}</p>
              <p style="margin: 5px 0;"><strong>Expires:</strong> ${new Date(user.subscription.endDate).toLocaleDateString('en-IN')}</p>
              <p style="margin: 5px 0;"><strong>Current Tokens:</strong> ${user.tokens || 0} daily, ${user.monthlyTokensRemaining || 0} monthly</p>
            </div>
            
            <p><strong>What happens after expiry?</strong></p>
            <ul style="color: #666;">
              <li>Your subscription will become inactive</li>
              <li>Daily tokens will be set to 0</li>
              <li>Monthly tokens will be reset to 0</li>
              <li>Access to premium features will be restricted</li>
            </ul>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${renewalLink}" 
                 style="background: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                🔄 Renew Subscription Now
              </a>
            </p>
            
            <div style="background: #d1ecf1; padding: 20px; border-left: 4px solid #bee5eb; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #0c5460;"><strong>💡 Pro Tip:</strong> Renew now to avoid any service interruption and keep your current token balance!</p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} regarding your ClientSure subscription.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Expiry warning email sent to ${user.email} (${daysLeft} days left)`);
    return true;
  } catch (error) {
    console.error('Send expiry warning email error:', error);
    return false;
  }
};

/**
 * Send subscription expired email
 * @param {object} user - User object
 * @returns {Promise<boolean>} Success status
 */
export const sendSubscriptionExpiredEmail = async (user) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const renewalLink = `${process.env.BASE_URL}/user/subscription?expired=true&email=${encodeURIComponent(user.email)}`;

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: '🔴 Your ClientSure subscription has expired',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">🔴 Subscription Expired</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #dc3545;">Hello ${user.name},</h2>
            
            <p>Your ClientSure subscription expired on <strong>${new Date(user.subscription.endDate).toLocaleDateString('en-IN')}</strong>.</p>
            
            <div style="background: #f8d7da; padding: 20px; border-left: 4px solid #dc3545; margin: 20px 0; border-radius: 5px;">
              <h3 style="margin-top: 0; color: #721c24;">⚠️ Account Status:</h3>
              <p style="margin: 5px 0; color: #721c24;"><strong>Status:</strong> Inactive</p>
              <p style="margin: 5px 0; color: #721c24;"><strong>Daily Tokens:</strong> 0 (was ${user.tokens || 0})</p>
              <p style="margin: 5px 0; color: #721c24;"><strong>Monthly Tokens:</strong> 0 (was ${user.monthlyTokensRemaining || 0})</p>
              <p style="margin: 5px 0; color: #721c24;"><strong>Premium Features:</strong> Restricted</p>
            </div>
            
            <p><strong>To reactivate your account:</strong></p>
            <ul style="color: #666;">
              <li>Choose a new subscription plan</li>
              <li>Complete the payment process</li>
              <li>Your tokens and features will be restored immediately</li>
              <li>All your data and settings remain safe</li>
            </ul>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${renewalLink}" 
                 style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                🚀 Reactivate Account
              </a>
            </p>
            
            <div style="background: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #155724;"><strong>🎯 Special Offer:</strong> Reactivate within 7 days and get 10% extra tokens on your next plan!</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Need help?</strong> Contact our support team if you have any questions about reactivating your subscription.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} regarding your expired ClientSure subscription.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Subscription expired email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Send subscription expired email error:', error);
    return false;
  }
};

/**
 * Send renewal reminder email (for users with expired subscriptions)
 * @param {object} user - User object
 * @param {number} daysExpired - Days since expiry
 * @returns {Promise<boolean>} Success status
 */
export const sendRenewalReminderEmail = async (user, daysExpired) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const renewalLink = `${process.env.BASE_URL}/user/subscription?reminder=true&email=${encodeURIComponent(user.email)}`;
    const specialOffer = daysExpired <= 7 ? '10% extra tokens' : daysExpired <= 14 ? '5% extra tokens' : 'Welcome back bonus';

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `💙 We miss you! Come back to ClientSure (Day ${daysExpired})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">💙 We Miss You!</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #6f42c1;">Hello ${user.name},</h2>
            
            <p>It's been ${daysExpired} days since your ClientSure subscription expired, and we miss having you as an active member!</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="margin: 0 0 15px; color: #6f42c1;">🎁 Special Welcome Back Offer</h3>
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: #28a745;">${specialOffer}</p>
              <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Valid for the next 48 hours</p>
            </div>
            
            <p><strong>What you're missing:</strong></p>
            <ul style="color: #666;">
              <li>Daily token refresh (100 tokens every day)</li>
              <li>Monthly token allocation for extended usage</li>
              <li>Access to premium features and resources</li>
              <li>Priority customer support</li>
              <li>Community access and networking</li>
            </ul>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${renewalLink}" 
                 style="background: #6f42c1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                🎯 Claim Special Offer
              </a>
            </p>
            
            <div style="background: #e7f3ff; padding: 20px; border-left: 4px solid #007cba; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #004085;"><strong>💡 Your Data is Safe:</strong> All your account data, preferences, and history are preserved and ready when you return!</p>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If you're not interested in renewing, you can safely ignore this email. We'll send just a few more reminders and then respect your decision.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} as a renewal reminder.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Renewal reminder email sent to ${user.email} (${daysExpired} days expired)`);
    return true;
  } catch (error) {
    console.error('Send renewal reminder email error:', error);
    return false;
  }
};