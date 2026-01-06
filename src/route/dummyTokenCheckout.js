import express from 'express';
import TokenTransaction from '../models/TokenTransaction.js';
import { User } from '../models/index.js';

const router = express.Router();

// GET /dummy-token-checkout - Dummy payment page for tokens
router.get('/dummy-token-checkout', async (req, res) => {
  try {
    const { transaction } = req.query;
    
    if (!transaction) {
      return res.status(400).send('Transaction ID required');
    }

    // Find transaction
    const tokenTransaction = await TokenTransaction.findOne({ transactionId: transaction })
      .populate('packageId', 'name tokens price')
      .populate('userId', 'name email');

    if (!tokenTransaction) {
      return res.status(404).send('Transaction not found');
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Token Purchase - ClientSure</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #007cba; margin-bottom: 10px; }
          .package-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .amount { font-size: 32px; font-weight: bold; color: #28a745; text-align: center; margin: 20px 0; }
          .btn { width: 100%; padding: 15px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; margin: 10px 0; transition: all 0.3s; }
          .btn-success { background: #28a745; color: white; }
          .btn-success:hover { background: #218838; }
          .btn-danger { background: #dc3545; color: white; }
          .btn-danger:hover { background: #c82333; }
          .info { font-size: 14px; color: #666; text-align: center; margin-top: 20px; }
          .loading { display: none; text-align: center; color: #007cba; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">ClientSure</div>
            <h2>Token Purchase</h2>
          </div>
          
          <div class="package-info">
            <h3>${tokenTransaction.packageId.name}</h3>
            <p><strong>Tokens:</strong> ${tokenTransaction.packageId.tokens}</p>
            <p><strong>Customer:</strong> ${tokenTransaction.userId.name}</p>
            <p><strong>Email:</strong> ${tokenTransaction.userId.email}</p>
            <p><strong>Transaction ID:</strong> ${tokenTransaction.transactionId}</p>
          </div>
          
          <div class="amount">₹${tokenTransaction.amount}</div>
          
          <button class="btn btn-success" onclick="processPayment('success')">
            ✅ Pay Now (Dummy Success)
          </button>
          
          <button class="btn btn-danger" onclick="processPayment('failed')">
            ❌ Cancel Payment (Dummy Failure)
          </button>
          
          <div class="loading" id="loading">
            <p>Processing payment...</p>
          </div>
          
          <div class="info">
            <p>🔒 This is a dummy payment gateway for testing purposes.</p>
            <p>In production, this would be replaced with actual payment gateway.</p>
          </div>
        </div>

        <script>
          async function processPayment(status) {
            document.getElementById('loading').style.display = 'block';
            document.querySelectorAll('.btn').forEach(btn => btn.disabled = true);
            
            try {
              const response = await fetch('/api/tokens/webhook', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  transactionId: '${tokenTransaction.transactionId}',
                  paymentId: 'dummy_' + Date.now(),
                  status: status
                })
              });
              
              const result = await response.json();
              
              const frontendUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:3000'
                : 'https://client-sure-frontend.vercel.app';
              
              if (status === 'success' && result.success) {
                window.location.href = frontendUrl + '/user/profile/tokens?purchase=success&tokens=${tokenTransaction.packageId.tokens}';
              } else if (status === 'failed') {
                window.location.href = frontendUrl + '/user/profile/tokens?purchase=cancelled';
              } else {
                window.location.href = frontendUrl + '/user/profile/tokens?purchase=failed';
              }
            } catch (error) {
              console.error('Payment error:', error);
              const frontendUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:3000'
                : 'https://client-sure-frontend.vercel.app';
              window.location.href = frontendUrl + '/user/profile/tokens?purchase=error';
            }
          }
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Dummy checkout error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;