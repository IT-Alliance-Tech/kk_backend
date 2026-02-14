import { Router } from "express";
import {
  initiatePayment,
  checkPaymentStatus,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/initiate", initiatePayment);
router.get("/status/:transactionId", checkPaymentStatus);

export default router;
