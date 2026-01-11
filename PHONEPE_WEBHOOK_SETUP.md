# PhonePe Webhook Setup Guide

## Webhook Configuration

### 1. Webhook URL
```
https://client-sure-backend-eight.vercel.app/api/phonepe/webhook
```

### 2. Authentication Credentials
These credentials are configured in your `.env` file:
- **Username**: `umang123`
- **Password**: `umang123`

⚠️ **Important**: These credentials must match exactly with what you configure in the PhonePe Business Dashboard.

## PhonePe Dashboard Configuration Steps

### 1. Access Dashboard
1. Log in to your [PhonePe Business Dashboard](https://business.phonepe.com)
2. Set the environment mode using the **Test Mode toggle**:
   - **ON** for Sandbox (Testing)
   - **OFF** for Production (Live)

### 2. Navigate to Webhook Settings
1. Go to **Developer Settings** from the side menu
2. Select the **Webhook** tab
3. Click **Create Webhook** button

### 3. Configure Webhook
Fill in the following details:

| Field | Value |
|-------|-------|
| **Webhook URL** | `https://client-sure-backend-eight.vercel.app/api/phonepe/webhook` |
| **Username** | `umang123` |
| **Password** | `umang123` |
| **Description** | Client Sure Payment Webhooks |

### 4. Select Events
Choose the following events:

#### Order Events:
- ✅ `checkout.order.completed` - Sent when an order is successfully completed
- ✅ `checkout.order.failed` - Sent when an order fails

#### Refund Events (Optional):
- ⬜ `pg.refund.completed` - Sent when a refund is successfully processed
- ⬜ `pg.refund.failed` - Sent when a refund processing fails

### 5. Save Configuration
Click **Create** to save and activate the webhook.

## Webhook Security

### Authorization Header
PhonePe includes an `Authorization` header in webhook requests:
```
Authorization: SHA256(username:password)
```

The hash is created using SHA256 algorithm on the string `username:password`.

### Example
For credentials:
- Username: `umang123`
- Password: `umang123`

The Authorization header would be:
```
Authorization: SHA256(<hash_of_umang123:umang123>)
```

## Webhook Response Format

### Order Completed Event
```json
{
  "event": "checkout.order.completed",
  "payload": {
    "orderId": "OMO2403282020198641071317",
    "merchantId": "M235ZYV5XEMI6",
    "merchantOrderId": "YOUR_ORDER_ID",
    "state": "COMPLETED",
    "amount": 10000,
    "expireAt": 1724866793837,
    "metaInfo": {
      "udf1": "order_id_from_db",
      "udf2": "subscription",
      "udf3": "",
      "udf4": ""
    },
    "paymentDetails": [
      {
        "paymentMode": "UPI_QR",
        "transactionId": "OM12334",
        "timestamp": 1724866793837,
        "amount": 10000,
        "state": "COMPLETED"
      }
    ]
  }
}
```

### Order Failed Event
```json
{
  "event": "checkout.order.failed",
  "payload": {
    "orderId": "OMO2403282020198641071311",
    "merchantId": "M235ZYV5XEMI6",
    "merchantOrderId": "YOUR_ORDER_ID",
    "state": "FAILED",
    "amount": 10000,
    "expireAt": 1724866793837,
    "metaInfo": {
      "udf1": "order_id_from_db",
      "udf2": "subscription",
      "udf3": "",
      "udf4": ""
    },
    "paymentDetails": [
      {
        "paymentMode": "UPI_COLLECT",
        "timestamp": 1724866793837,
        "amount": 10000,
        "transactionId": "OM12333",
        "state": "FAILED",
        "errorCode": "AUTHORIZATION_ERROR",
        "detailedErrorCode": "ZM"
      }
    ]
  }
}
```

## Webhook Validation Rules

1. ✅ **Use `payload.state` parameter** - Rely on the root-level `payload.state` field for payment status
2. ✅ **Use `event` parameter** - Use the `event` parameter (not `type`) to identify event type
3. ✅ **Verify Authorization header** - Always validate the SHA256 hash matches your credentials
4. ✅ **Time format** - `expireAt` and `timestamp` fields are in epoch time (milliseconds)
5. ✅ **Respond with 200** - Always respond with HTTP 200 to acknowledge receipt

## Testing Webhook

### Using cURL
```bash
# Test with proper Authorization header
curl -X POST https://client-sure-backend-eight.vercel.app/api/phonepe/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: SHA256 <generated_hash>" \
  -d '{
    "event": "checkout.order.completed",
    "payload": {
      "orderId": "TEST123",
      "merchantOrderId": "TEST_ORDER_123",
      "state": "COMPLETED",
      "amount": 10000,
      "metaInfo": {
        "udf1": "order_id",
        "udf2": "subscription"
      },
      "paymentDetails": [{
        "paymentMode": "UPI_QR",
        "transactionId": "TXN123",
        "timestamp": 1724866793837,
        "amount": 10000,
        "state": "COMPLETED"
      }]
    }
  }'
```

## Environment Variables

Ensure these are set in your `.env` file:

```env
# PhonePe Webhook Authentication
PHONEPE_WEBHOOK_USERNAME=umang123
PHONEPE_WEBHOOK_PASSWORD=umang123

# PhonePe Environment
PHONEPE_ENV=sandbox  # or 'production'

# PhonePe Sandbox Credentials
PHONEPE_MERCHANT_ID=M235ZYV5XEMI6
PHONEPE_CLIENT_ID=M235ZYV5XEMI6_2512061655
PHONEPE_CLIENT_SECRET=YjhiY2E5ZDMtYWNmMS00M2JkLWExODgtMmYxZTBjZDE3NGJi
PHONEPE_BASE_URL=https://api-preprod.phonepe.com/apis/pg-sandbox/
```

## Troubleshooting

### Webhook Not Received
1. Check if webhook is active in PhonePe Dashboard
2. Verify the URL is accessible from PhonePe servers
3. Check server logs for incoming requests

### Authorization Failed
1. Ensure username and password in `.env` match PhonePe Dashboard configuration
2. Verify the Authorization header format
3. Check for typos in credentials

### Order Not Found
1. Verify `merchantOrderId` matches your database
2. Check if order was created before webhook arrives
3. Ensure `metaInfo.udf1` contains correct order ID

## Support
For issues, check:
- PhonePe Developer Documentation: https://developer.phonepe.com/
- Application logs in `/var/log/` or Vercel logs
- PhonePe Dashboard webhook logs
