import { Router } from "express";
import {
  initiatePayment,
  checkPaymentStatus,
  handlePaymentWebhook,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/initiate", initiatePayment);
router.get("/status/:transactionId", checkPaymentStatus);
router.post("/webhook", handlePaymentWebhook);

export default router;
