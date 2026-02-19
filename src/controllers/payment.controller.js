import * as phonepeService from "../services/phonepe.service.js";
import Order from "../models/Order.js";

export const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // SECURITY: Always re-fetch order from DB — never trust frontend amount
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Use authoritative amount from DB (totalAmount > finalTotal > total)
    const amount = order.totalAmount || order.finalTotal || order.total;
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    const result = await phonepeService.createPayment(orderId, amount);

    res.json({
      success: true,
      data: {
        redirectUrl: result.redirectUrl,
      },
    });
  } catch (error) {
    console.error("PHONEPE ERROR:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Payment initiation failed",
    });
  }
};

export const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params; // Reusing param name, actually orderId from frontend
    console.log("Controller checking status for:", transactionId);

    const result = await phonepeService.checkPaymentStatus(transactionId);
    console.log("Service Result in Controller:", result);

    // Process status for frontend
    // PhonePe states: COMPLETED, FAILED, PENDING, EXPIRED, etc.
    let paymentStatus = "failed";

    // Check if result has state at top level or nested in data
    const state = result.state || (result.data && result.data.state);
    console.log("Extracted State:", state);

    if (state === "COMPLETED") {
      paymentStatus = "success";
    } else if (state === "PENDING") {
      paymentStatus = "pending";
    }

    // --- PERSIST payment status AND advance order status ---
    try {
      const updateFields = { "payment.status": paymentStatus };

      // If payment succeeded, also store the transaction ID from PhonePe
      const txnId =
        result.transactionId ||
        (result.data && result.data.transactionId) ||
        null;
      if (txnId) {
        updateFields["payment.txnId"] = txnId;
      }

      // State machine: link payment outcome to order status
      if (paymentStatus === "success") {
        updateFields["status"] = "accepted"; // Payment confirmed → order accepted
      } else if (paymentStatus === "failed") {
        updateFields["status"] = "cancelled"; // Payment failed → order cancelled
      }
      // "pending" payment → keep order.status as-is (still "pending")

      const updatedOrder = await Order.findByIdAndUpdate(
        transactionId,
        { $set: updateFields },
        { new: true }
      );

      if (updatedOrder) {
        console.log(
          `Order ${transactionId} updated — payment: ${paymentStatus}, order status: ${updatedOrder.status}`
        );
      } else {
        console.warn(
          `Order ${transactionId} not found in DB — payment status not persisted`
        );
      }
    } catch (dbError) {
      // Log but don't fail the response — the PhonePe status is still valid
      console.error("Failed to persist payment status in DB:", dbError.message);
    }

    res.json({
      success: true,
      data: {
        paymentStatus,
        raw: result,
      },
    });
  } catch (error) {
    console.error(
      "STATUS CHECK ERROR:",
      error?.response?.data || error.message,
    );
    res.status(500).json({
      success: false,
      message: "Status check failed",
      error: error?.response?.data || error.message,
    });
  }
};

/**
 * PhonePe Webhook/Callback handler
 * Called by PhonePe server-to-server when payment status changes.
 * This ensures payment status is persisted even if the user closes the browser.
 */
export const handlePaymentWebhook = async (req, res) => {
  try {
    console.log("PhonePe Webhook received:", JSON.stringify(req.body, null, 2));

    const { merchantOrderId, state, transactionId } = req.body || {};

    if (!merchantOrderId) {
      console.warn("Webhook: missing merchantOrderId");
      return res.status(400).json({ success: false, message: "Missing merchantOrderId" });
    }

    let paymentStatus = "failed";
    if (state === "COMPLETED") {
      paymentStatus = "success";
    } else if (state === "PENDING") {
      paymentStatus = "pending";
    }

    const updateFields = { "payment.status": paymentStatus };
    if (transactionId) {
      updateFields["payment.txnId"] = transactionId;
    }

    // State machine: link payment outcome to order status
    if (paymentStatus === "success") {
      updateFields["status"] = "accepted"; // Payment confirmed → order accepted
    } else if (paymentStatus === "failed") {
      updateFields["status"] = "cancelled"; // Payment failed → order cancelled
    }
    // "pending" payment → keep order.status as-is

    const updatedOrder = await Order.findByIdAndUpdate(
      merchantOrderId,
      { $set: updateFields },
      { new: true }
    );

    if (updatedOrder) {
      console.log(`Webhook: Order ${merchantOrderId} updated — payment: ${paymentStatus}, order status: ${updatedOrder.status}`);
    } else {
      console.warn(`Webhook: Order ${merchantOrderId} not found in DB`);
    }

    // PhonePe expects a 200 response to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error.message);
    // Still return 200 to prevent PhonePe from retrying indefinitely
    res.status(200).json({ success: false, message: "Webhook processing error" });
  }
};
