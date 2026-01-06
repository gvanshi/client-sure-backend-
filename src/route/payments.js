import express from 'express';
import { createOrder } from '../controller/paymentController.js';
import { handleWebhook } from '../controller/webhookController.js';

const router = express.Router();

// POST /api/payments/create-order
router.post('/create-order', createOrder);
//
// POST /api/payments/webhook
router.post('/webhook', handleWebhook);

export default router;