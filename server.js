import dotenv from "dotenv";
dotenv.config();

console.log(
  "DEBUG ENV — EMAIL_USER set?",
  !!process.env.EMAIL_USER,
  "OAuth2 credentials configured:",
  !!(
    process.env.EMAIL_CLIENT_ID &&
    process.env.EMAIL_CLIENT_SECRET &&
    process.env.EMAIL_REFRESH_TOKEN
  ),
);

import { createServer } from "http";
import app from "./app.js";
import "./src/config/db.js";

const PORT = process.env.PORT || 5001;

const server = createServer(app);

server.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
