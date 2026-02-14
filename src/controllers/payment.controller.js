import * as phonepeService from "../services/phonepe.service.js";

export const initiatePayment = async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
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
