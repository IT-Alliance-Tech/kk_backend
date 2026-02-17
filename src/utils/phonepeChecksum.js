import crypto from "crypto";

export const generateChecksum = (payloadBase64, endpoint) => {
  const string = payloadBase64 + endpoint + process.env.PHONEPE_SALT_KEY;

  const sha256 = crypto.createHash("sha256").update(string).digest("hex");

  return sha256 + "###" + process.env.PHONEPE_SALT_INDEX;
};

export const generateStatusChecksum = (endpoint) => {
  const string = endpoint + process.env.PHONEPE_SALT_KEY;

  const sha256 = crypto.createHash("sha256").update(string).digest("hex");

  return sha256 + "###" + process.env.PHONEPE_SALT_INDEX;
};
