import axios from "axios";
import { getAuthToken } from "./phonepeAuth.service.js";

export const createPayment = async (orderId, amount) => {
  console.log("FINAL URL:", `${process.env.PHONEPE_BASE_URL}/v2/pay`);
  console.log("FINAL URL:", orderId, amount);

  const token = await getAuthToken();

  console.log("TOKEN:", token);

  const response = await axios.post(
    "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
    {
      merchantOrderId: orderId,
      amount: amount * 100,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl: `${process.env.FRONTEND_URL}/checkout/success?orderId=${orderId}`,
          callbackUrl: `${process.env.FRONTEND_URL}/api/payment/webhook`,
        },
      },
    },
    {
      headers: {
        Authorization: `O-Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  console.log("Response pay: ", response);
  console.error("PHONEPE FULL ERROR:", response?.data);

  return response.data;
};

export const checkPaymentStatus = async (orderId) => {
  try {
    console.log("Checking status for Order ID:", orderId);
    const token = await getAuthToken();

    const response = await axios.get(
      `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${orderId}/status`,
      {
        headers: {
          Authorization: `O-Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10s timeout
      },
    );

    console.log(
      "PhonePe Status API Response:",
      JSON.stringify(response.data, null, 2),
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("PhonePe API Error Response:", error.response.data);
    } else {
      console.error("PhonePe Request Error:", error.message);
    }
    throw error;
  }
};
