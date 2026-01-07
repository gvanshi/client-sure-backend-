import express from "express";

const router = express.Router();

// GET /api/dummy-checkout - Dummy payment page
router.get("/dummy-checkout", async (req, res) => {
  const { order } = req.query;

  const backendUrl =
    process.env.BACKEND_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://client-sure-backend.vercel.app"
      : `http://localhost:${process.env.PORT || 5001}`);

  const frontendUrl =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://client-sure-frontend.vercel.app"
      : "http://localhost:3000");

  if (!order) {
    return res.status(400).send("Missing order parameter");
  }

  // Get order details to show correct amount
  let orderAmount = 299;
  let orderType = "subscription";
  try {
    const { Order } = await import("../models/index.js");
    const orderDoc = await Order.findOne({ clientOrderId: order });
    if (orderDoc) {
      orderAmount = orderDoc.amount;
      orderType = orderDoc.type || "subscription";
    }
  } catch (error) {
    console.log("Could not fetch order details:", error.message);
  }

  // Simple HTML page for dummy payment
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dummy Payment - ClientSure</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
            .container { border: 1px solid #ddd; padding: 30px; border-radius: 8px; }
            button { background: #007cba; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin: 10px; }
            button:hover { background: #005a87; }
            .fail { background: #dc3545; }
            .fail:hover { background: #c82333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🔒 Dummy Payment Gateway</h2>
            <p><strong>Order ID:</strong> ${order}</p>
            <p><strong>Status:</strong> Pending Payment</p>
            <hr>
            <p>This is a dummy payment page for testing purposes.</p>
            
            <button onclick="simulatePayment('success')">
                ✅ Simulate Successful Payment
            </button>
            
            <button onclick="simulatePayment('failed')" class="fail">
                ❌ Simulate Failed Payment
            </button>
        </div>

        <script>
            function simulatePayment(status) {
                // Dynamic URLs based on environment
                const backendUrl = "${backendUrl}";
                const frontendUrl = "${frontendUrl}";
                
                const webhookUrl = backendUrl + '/api/payments/webhook';

                if (status === 'success') {
                    // Simulate successful payment webhook
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-signature': 'dummy-signature-dev'
                        },
                        body: JSON.stringify({
                            type: 'payment.success',
                            data: {
                                order_id: 'prov_' + Date.now(),
                                clientOrderId: '${order}',
                                email: localStorage.getItem('pendingUserEmail') || 'test@example.com',
                                name: localStorage.getItem('pendingUserName') || 'Test User',
                                amount: ${orderAmount},
                                orderType: '${orderType}'
                            }
                        })
                    }).then(async response => {
                        console.log('Webhook response status:', response.status);
                        const responseText = await response.text();
                        console.log('Webhook response:', responseText);
                        
                        if (response.ok) {
                            alert('Payment Successful! Redirecting...');
                            const userEmail = localStorage.getItem('pendingUserEmail') || 'test@example.com';
                            window.location.href = frontendUrl + '/payment-success?email=' + encodeURIComponent(userEmail);
                        } else {
                            console.error('Webhook failed with status:', response.status);
                            console.error('Response body:', responseText);
                            alert('Payment processing failed: ' + response.status + ' - ' + responseText);
                        }
                    }).catch(err => {
                        console.error('Webhook error:', err);
                        alert('Error processing payment: ' + err.message);
                    });
                } else {
                    alert('Payment Failed! Please try again.');
                    window.location.href = frontendUrl;
                }
            }
        </script >
    </body >
    </html >
    `;

  res.send(html);
});

export default router;
