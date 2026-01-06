import nodemailer from 'nodemailer';
import dotenv from 'dotenv';


dotenv.config()


/**
 * Create and verify SMTP transporter
 * @returns {object|null} Configured transporter or null if failed
 */
export const createTransporter = () => {
  try {
    console.log('🔧 Creating SMTP transporter...');
    console.log('📧 SMTP User:', process.env.SMTP_USER);
    console.log('🔑 SMTP Pass configured:', !!process.env.SMTP_PASS);
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ SMTP credentials not configured');
      return null;
    }
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      debug: false,
      logger: false
    });

    console.log('✅ SMTP Transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Failed to initialize SMTP transporter:', error);
    return null;
  }
};

/**
 * Send email with retry mechanism
 * @param {object} transporter - Nodemailer transporter
 * @param {object} mailOptions - Email options
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<boolean>} Success status
 */
export const sendEmailWithRetry = async (transporter, mailOptions, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!transporter) {
        throw new Error('Transporter not initialized');
      }

      console.log(`📤 Attempt ${attempt}: Sending email to ${mailOptions.to}`);
      const result = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully:`, result.messageId);
      return true;
    } catch (error) {
      console.error(`❌ Email sending attempt ${attempt} failed:`, {
        error: error.message,
        code: error.code,
        command: error.command
      });
      
      if (attempt === retries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
};

/**
 * Send password reset confirmation email
 * @param {object} user - User object
 * @returns {Promise<boolean>} Success status
 */
export const sendPasswordResetConfirmationEmail = async (user) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Password Reset Successful - ClientSure',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #007cba 0%, #005a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">Password Reset Successful ✅</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #007cba;">Hello ${user.name},</h2>
            
            <p>Your password has been successfully reset for your ClientSure account.</p>
            
            <div style="background: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 5px;">
              <p style="margin: 0; color: #155724;"><strong>✅ Password Reset Complete</strong></p>
              <p style="margin: 10px 0 0; color: #155724;">You can now log in with your new password.</p>
            </div>
            
            <p>If you did not make this change, please contact our support team immediately.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} to confirm your password reset.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Password reset confirmation email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Send password reset confirmation email error:', error);
    return false;
  }
};

/**
 * Send welcome email with password reset link
 * @param {object} user - User object
 * @param {string} resetToken - Password reset token
 * @param {object} planInfo - Plan information (optional)
 * @returns {Promise<boolean>} Success status
 */
export const sendWelcomeEmail = async (user, resetToken, planInfo = null) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const resetLink = `${process.env.BASE_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    const planSection = planInfo ? `
      <div style="background: #e8f5e8; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #28a745;">Selected Plan:</h3>
        <p><strong>Plan:</strong> ${planInfo.planName}</p>
        <p><strong>Price:</strong> ₹${planInfo.planPrice}</p>
        <p style="color: #666; font-size: 14px; margin-bottom: 0;">Complete your payment to activate your subscription.</p>
      </div>
    ` : '';

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Welcome to ClientSure - Set Your Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #007cba 0%, #005a87 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">Welcome! 🎉</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #007cba;">Hello ${user.name},</h2>
            
            <p>Welcome to ClientSure! Your account has been created successfully.</p>
            
            <p>To get started and secure your account, please set your password by clicking the button below:</p>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${resetLink}" 
                 style="background: #007cba; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                Set Your Password
              </a>
            </p>
            
            ${planSection}
            
            <div style="background: #f8f9fa; padding: 20px; border-left: 4px solid #007cba; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #007cba;">Your Account Details:</h3>
              <p><strong>Name:</strong> ${user.name}</p>
              <p><strong>Email:</strong> ${user.email}</p>
              ${user.phone ? `<p><strong>Phone:</strong> ${user.phone}</p>` : ''}
              <p><strong>Temporary Password:</strong> ${user.email}</p>
              <p style="color: #666; font-size: 14px; margin-bottom: 0;">You can use your email as password to login temporarily, but we recommend setting a secure password.</p>
            </div>
            
            <p style="margin: 30px 0; color: #666; font-size: 14px;">
              <strong>This link will expire in 24 hours.</strong> If you didn't create this account, you can safely ignore this email.
            </p>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all; color: #007cba;">${resetLink}</span>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} for your new ClientSure account.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Welcome email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Send welcome email error:', error);
    return false;
  }
};

/**
 * Send email utility function
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 * @returns {Promise<boolean>} Success status
 */
export const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Send email error:', error);
    return false;
  }
};

/**
 * Send repurchase email when user runs out of tokens
 * @param {object} user - User object
 * @returns {Promise<boolean>} Success status
 */
export const sendRepurchaseEmail = async (user) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      throw new Error('Email transporter not available');
    }

    // Create repurchase link
    const repurchaseLink = `${process.env.BASE_URL}/?repurchase=true&email=${encodeURIComponent(user.email)}`;

    const mailOptions = {
      from: `"ClientSure" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Your Daily Tokens Are Exhausted - Renew Your Plan',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">ClientSure</h1>
            <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">⚠️ Tokens Exhausted</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #ff6b6b;">Hello ${user.name},</h2>
            
            <p>Your monthly plan tokens are running low! 🎯</p>
            
            <p><strong>Token System:</strong></p>
            <p>• Daily tokens: Reset to 100 every day at 1:00 AM</p>
            <p>• Monthly tokens: Decrease with usage, don't reset until new plan</p>
            
            <p>To get more monthly tokens, please renew your subscription plan.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px; color: #333;">📊 Your Token Status:</h3>
              <p style="margin: 5px 0;">• Daily Tokens: ${user.tokens || 0}/100 (resets at 1:00 AM)</p>
              <p style="margin: 5px 0;">• Monthly Remaining: <strong style="color: #ff6b6b;">${user.monthlyTokensRemaining || 0}</strong></p>
              <p style="margin: 5px 0;">• Plan Total: ${user.monthlyTokensTotal || 0} tokens</p>
              <p style="margin: 5px 0;">• Total Used: ${user.tokensUsedTotal || 0}</p>
            </div>
            
            <p style="margin: 30px 0; text-align: center;">
              <a href="${repurchaseLink}" 
                 style="background: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                🔄 Renew Subscription
              </a>
            </p>
            
            <p style="margin: 30px 0; color: #666; font-size: 14px;">
              <strong>Note:</strong> Your daily tokens (100) will refresh tomorrow at 1:00 AM, but your monthly plan tokens only increase with a new subscription.
            </p>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all; color: #ff6b6b;">${repurchaseLink}</span>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
              <p>This email was sent to ${user.email} because your daily tokens were exhausted.</p>
              <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendEmailWithRetry(transporter, mailOptions);
    console.log(`Repurchase email sent to ${user.email}`);
    
    return true;
  } catch (error) {
    console.error('Send repurchase email error:', error);
    return false;
  }
};