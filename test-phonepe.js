import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const hostUrl =
  process.env.PHONEPE_HOST_URL ||
  "https://api-preprod.phonepe.com/apis/pg-sandbox";
const url = `${hostUrl}/pg/v1/pay`;

console.log("--- PhonePe Connection Test ---");
console.log(`Target URL: ${url}`);
console.log(`Merchant ID: ${process.env.PHONEPE_MERCHANT_ID}`);

async function testConnection() {
  try {
    console.log("Attempting fetch...");
    // We expect a 401 or 400 because we are sending no body/headers, but if we get a response, the connection is working.
    // If "fetch failed" happens here, it confirms a network/DNS/URL issue.
    const response = await fetch(url, {
      method: "POST", // The actual endpoint expects POST
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log(`Response Body Preview: ${text.substring(0, 100)}`);
    console.log(
      "SUCCESS: Connection established (error response is expected for empty body).",
    );
  } catch (error) {
    console.error("ERROR: Fetch failed completely.");
    console.error(error);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

testConnection();
