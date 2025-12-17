const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// Submit payment
router.post("/submit", paymentController.submitPayment);

// Check subscription status
router.get("/status/:email", paymentController.checkSubscription);

// Get payment history
router.get("/history/:email", paymentController.getPaymentHistory);
router.post("/verify", paymentController.verifyPayment);

// New admin routes
router.get("/admin/stats", paymentController.getPaymentStats);
router.get("/admin", paymentController.getAllPayments);
router.get("/admin/:paymentId", paymentController.getPaymentById);

module.exports = router;
