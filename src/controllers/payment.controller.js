import crypto from "crypto";
import Order from "../models/Order.js";

export const initiatePayment = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    // 1. Get order details
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // 2. Prepare PhonePe payload
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || 1;
    const baseUrl =
      process.env.PHONEPE_BASE_URL ||
      "https://api-preprod.phonepe.com/apis/pg-sandbox";

    // This is where the USER is redirected after payment (Frontend URL)
    // e.g. http://localhost:3000/payment/status
    const redirectUrl =
      process.env.PHONEPE_REDIRECT_URL ||
      `http://localhost:3000/payment/status`;

    // This is the server-to-server webhook (Backend URL)
    // e.g. http://localhost:5001/api/payment/callback
    const callbackUrl =
      process.env.PHONEPE_CALLBACK_URL ||
      `http://localhost:5001/api/payment/callback`;

    // Validate required PhonePe configuration
    if (!merchantId || !saltKey) {
      console.error("Critical: Missing PhonePe credentials in .env");
      return res.status(500).json({
        success: false,
        message: "Payment gateway configuration error",
      });
    }

    // Transaction ID must be unique
    const merchantTransactionId = `MT${Date.now()}_${orderId}`;

    // Amount in paise (100 paise = 1 INR)
    const amount = Math.round(order.total * 100);

    const payload = {
      merchantId: merchantId,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: req.user.id,
      amount: amount,
      redirectUrl: redirectUrl,
      redirectMode: "REDIRECT", // "POST" or "REDIRECT"
      callbackUrl: callbackUrl,
      mobileNumber: order.address?.phone || "9999999999",
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    // 3. Encode payload and generate checksum
    const payloadJson = JSON.stringify(payload);
    const base64Payload = Buffer.from(payloadJson).toString("base64");

    const stringToSign = base64Payload + "/pg/v1/pay" + saltKey;
    const sha256 = crypto
      .createHash("sha256")
      .update(stringToSign)
      .digest("hex");
    const checksum = sha256 + "###" + saltIndex;

    // 4. Call PhonePe API
    // Using fetch (available in Node 18+) or axios if preferred. Assuming fetch for native support.
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        accept: "application/json",
      },
      body: JSON.stringify({
        request: base64Payload,
      }),
    };

    const targetUrl = `${baseUrl}/pg/v1/pay`;
    console.log("Debug: PhonePe Request URL:", targetUrl);
    console.log("Debug: Merchant ID:", merchantId);
    // console.log("Debug: Payload:", payload); // Be careful logging PII

    const response = await fetch(targetUrl, options);
    const data = await response.json();

    if (data.success) {
      // Return the PhonePe redirect URL to frontend
      return res.status(200).json({
        success: true,
        data: {
          redirectUrl: data.data.instrumentResponse.redirectInfo.url,
          merchantTransactionId,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: data.message || "Payment initiation failed",
        error: data,
        debug: {
          usedMerchantId: merchantId,
          usedUrl: targetUrl,
          payloadMerchantId: payload.merchantId,
        },
      });
    }
  } catch (error) {
    console.error("Payment initiation error:", error);
    next(error);
  }
};
