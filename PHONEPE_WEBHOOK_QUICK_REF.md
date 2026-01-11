# PhonePe Webhook Quick Reference

## 🔗 Webhook URL
```
https://client-sure-backend-eight.vercel.app/api/phonepe/webhook
```

## 🔐 Credentials
- **Username**: `umang123`
- **Password**: `umang123`

## 📋 Dashboard Setup Checklist

- [ ] 1. Log in to [PhonePe Business Dashboard](https://business.phonepe.com)
- [ ] 2. Toggle **Test Mode** (ON for testing)
- [ ] 3. Go to **Developer Settings** → **Webhook** tab
- [ ] 4. Click **Create Webhook**
- [ ] 5. Enter Webhook URL
- [ ] 6. Enter Username and Password
- [ ] 7. Select Events:
  - [ ] `checkout.order.completed`
  - [ ] `checkout.order.failed`
- [ ] 8. Click **Create**

## ✅ What's Already Configured

Your backend is ready with:
- ✅ Webhook endpoint at `/api/phonepe/webhook`
- ✅ Authorization verification using SHA256
- ✅ Support for both hex and base64 hash formats
- ✅ Order completion handling
- ✅ Order failure handling
- ✅ Subscription activation
- ✅ Token purchase processing
- ✅ Referral reward processing

## 🧪 Test Webhook

### Generate Test Hash (Node.js)
```javascript
const crypto = require('crypto');
const credentials = 'umang123:umang123';
const hash = crypto.createHash('sha256').update(credentials).digest('hex');
console.log('Authorization: SHA256 ' + hash);
```

### Test Request
```bash
curl -X POST https://client-sure-backend-eight.vercel.app/api/phonepe/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: SHA256 <your_generated_hash>" \
  -d '{ "event": "checkout.order.completed", "payload": {...} }'
```

## 📊 Supported Events

| Event | Description | Status |
|-------|-------------|--------|
| `checkout.order.completed` | Payment successful | ✅ Implemented |
| `checkout.order.failed` | Payment failed | ✅ Implemented |
| `pg.refund.completed` | Refund successful | ⚠️ Optional |
| `pg.refund.failed` | Refund failed | ⚠️ Optional |

## 🔍 Key Fields

- **Use `payload.state`** for payment status (COMPLETED/FAILED/PENDING)
- **Use `event`** to identify event type
- **`metaInfo.udf1`** contains your internal order ID
- **`metaInfo.udf2`** contains payment type (subscription/token_purchase)

## 🚨 Important Notes

1. Always respond with HTTP 200 to acknowledge receipt
2. Webhook is processed asynchronously after acknowledgment
3. Both subscription and token purchases are handled
4. Referral rewards are automatically processed on successful payment
5. Users receive email notifications after successful payment

## 📞 Support

- Backend Logs: Check Vercel deployment logs
- PhonePe Docs: https://developer.phonepe.com/
- Dashboard: https://business.phonepe.com/
