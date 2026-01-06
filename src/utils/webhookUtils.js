import crypto from 'crypto';

export const verifyWebhookSignature = (rawBody, signature, secret) => {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    
    // Handle different signature formats
    const cleanSignature = signature.replace('sha256=', '');
    const cleanExpected = expected.replace('sha256=', '');
    
    return cleanSignature === cleanExpected;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

export const generateTestSignature = (payload, secret) => {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
};