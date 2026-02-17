import axios from "axios";

async function testStatus() {
  const orderId = "69905f8ca4a6644fb04652e0";
  const url = `http://localhost:5001/api/payment/status/${orderId}`;

  console.log(`Testing status check for order ${orderId}...`);
  try {
    const response = await axios.get(url, { timeout: 15000 });
    console.log("SUCCESS!");
    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log("FAILED!");
    if (error.response) {
      console.log("Status Code:", error.response.status);
      console.log("Error Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("Error Message:", error.message);
    }
  }
}

testStatus();
