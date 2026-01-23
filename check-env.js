import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("--- Environment Variable Check ---");
console.log(`PHONEPE_MERCHANT_ID: '${process.env.PHONEPE_MERCHANT_ID}'`);
console.log(`PHONEPE_SALT_KEY: '${process.env.PHONEPE_SALT_KEY}'`);
console.log(`PHONEPE_SALT_INDEX: '${process.env.PHONEPE_SALT_INDEX}'`);
console.log(`PHONEPE_BASE_URL: '${process.env.PHONEPE_BASE_URL}'`);
