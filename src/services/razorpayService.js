import Razorpay from "razorpay";
import crypto from "crypto";

/**
 * Razorpay Payment Gateway Service
 *
 * Handles interactions with Razorpay API:
 * - Order creation
 * - Payment verification
 */

/**
 * Initialize Razorpay instance
 */
const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Missing Razorpay credentials");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

/**
 * Create a payment order in Razorpay
 *
 * @param {Object} orderData
 * @param {number} orderData.amount - Amount in paisa
 * @param {string} orderData.receipt - Unique receipt ID
 * @param {Object} orderData.notes - Optional notes
 *
 * @returns {Promise<Object>} Razorpay order object
 */
export const createOrder = async ({ amount, receipt, notes = {} }) => {
  try {
    const instance = getRazorpayInstance();

    const options = {
      amount: Math.floor(amount), // Amount in smallest currency unit (paisa)
      currency: "INR",
      receipt: receipt,
      notes: notes,
    };

    console.log("Creating Razorpay order:", options);

    const order = await instance.orders.create(options);

    console.log("Razorpay order created:", order.id);

    return order;
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    throw new Error(`Failed to create Razorpay order: ${error.message}`);
  }
};

/**
 * Verify Razorpay payment signature
 *
 * @param {string} orderId - Razorpay Order ID
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature
 *
 * @returns {boolean} True if signature is valid
 */
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const text = orderId + "|" + paymentId;
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(text.toString())
      .digest("hex");

    const isValid = generated_signature === signature;

    if (!isValid) {
      console.warn("Signature verification failed:", {
        generated: generated_signature,
        received: signature,
      });
    }

    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

/**
 * Validate Razorpay configuration
 */
export const validateConfig = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error(
      "Missing Razorpay environment variables: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET",
    );
  }
  console.log("Razorpay configuration validated");
};
