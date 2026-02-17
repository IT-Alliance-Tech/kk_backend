import axios from "axios";

export const getAuthToken = async () => {
  const response = await axios.post(
    "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.PHONEPE_CLIENT_ID,
      client_secret: process.env.PHONEPE_CLIENT_SECRET,
      client_version: process.env.PHONEPE_CLIENT_VERSION,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  console.log("PHONEPE AUTH RESPONSE:", response.data);

  return response.data.access_token;
};
