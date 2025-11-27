const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Daraja API configuration
const config = {
  consumerKey: process.env.DARAJA_CONSUMER_KEY,
  consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
  businessShortCode: process.env.BUSINESS_SHORT_CODE,
  passkey: process.env.DARAJA_PASSKEY,
  callbackUrl: process.env.CALLBACK_URL,
  environment: process.env.NODE_ENV || "sandbox",
};

// Base URL based on environment
const baseURL =
  config.environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// User and subscription storage (use database in production)
const users = new Map(); // phoneNumber -> userData
const subscriptions = new Map(); // phoneNumber -> subscriptionData
const paymentStore = new Map(); // checkoutRequestID -> paymentData

// Get access token
async function getAccessToken() {
  try {
    const auth = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`
    ).toString("base64");

    const response = await axios.get(
      `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error getting access token:",
      error.response?.data || error.message
    );
    throw new Error("Failed to get access token");
  }
}

// Generate password for STK Push
function generatePassword() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(
    `${config.businessShortCode}${config.passkey}${timestamp}`
  ).toString("base64");
  return { password, timestamp };
}

// Calculate subscription expiry
function calculateExpiry(planType) {
  const now = new Date();
  switch (planType) {
    case "monthly":
      return new Date(now.setMonth(now.getMonth() + 1));
    case "quarterly":
      return new Date(now.setMonth(now.getMonth() + 3));
    case "yearly":
      return new Date(now.setFullYear(now.getFullYear() + 1));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

// Check if subscription is active
function isSubscriptionActive(phoneNumber) {
  const subscription = subscriptions.get(phoneNumber);
  if (!subscription) return false;

  return new Date(subscription.expiresAt) > new Date();
}

// STK Push endpoint - UPDATED for website subscription
app.post("/api/initiate-payment", async (req, res) => {
  try {
    const { phoneNumber, amount, accountReference, transactionDesc, planType } =
      req.body;

    console.log("Initiating website subscription for:", {
      phoneNumber,
      amount,
      planType,
    });

    // Validate input
    if (!phoneNumber || !amount || !planType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: phoneNumber, amount, planType",
      });
    }

    const accessToken = await getAccessToken();
    const { password, timestamp } = generatePassword();

    const paymentData = {
      BusinessShortCode: config.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: config.businessShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: `${config.callbackUrl}/api/payment-callback`,
      AccountReference: "SHULEAI_SUB", // Fixed for website subscription
      TransactionDesc: `Website Subscription - ${planType}`,
    };

    console.log("Sending STK Push request for website subscription...");

    const response = await axios.post(
      `${baseURL}/mpesa/stkpush/v1/processrequest`,
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log("STK Push response:", response.data);

    // Store payment info with subscription data
    const paymentInfo = {
      checkoutRequestID: response.data.CheckoutRequestID,
      phoneNumber,
      amount,
      planType: planType,
      accountReference: "WEBSITE_SUBSCRIPTION",
      timestamp: new Date(),
      status: "pending",
      merchantRequestID: response.data.MerchantRequestID,
      isWebsiteSubscription: true, // Mark as website subscription
    };

    paymentStore.set(response.data.CheckoutRequestID, paymentInfo);
    console.log(
      `📝 Stored website subscription payment: ${response.data.CheckoutRequestID}`
    );

    res.json({
      success: true,
      checkoutRequestID: response.data.CheckoutRequestID,
      responseDescription: response.data.ResponseDescription,
      customerMessage: response.data.CustomerMessage,
    });
  } catch (error) {
    console.error(
      "Payment initiation error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message:
        error.response?.data?.errorMessage || "Payment initiation failed",
    });
  }
});

// Payment callback endpoint - UPDATED for subscription management
app.post("/api/payment-callback", (req, res) => {
  console.log(
    "💰 Payment callback received:",
    JSON.stringify(req.body, null, 2)
  );

  const callbackData = req.body;

  if (callbackData.Body && callbackData.Body.stkCallback) {
    const stkCallback = callbackData.Body.stkCallback;
    const resultCode = stkCallback.ResultCode;
    const checkoutRequestID = stkCallback.CheckoutRequestID;

    console.log(
      `🔄 Processing callback for: ${checkoutRequestID}, ResultCode: ${resultCode}`
    );

    if (paymentStore.has(checkoutRequestID)) {
      const paymentInfo = paymentStore.get(checkoutRequestID);

      if (resultCode === 0) {
        // Payment successful - activate subscription
        paymentInfo.status = "completed";
        paymentInfo.completedAt = new Date();
        paymentInfo.mpesaReceiptNumber =
          stkCallback.CallbackMetadata?.Item.find(
            (item) => item.Name === "MpesaReceiptNumber"
          )?.Value;
        paymentInfo.transactionDate = stkCallback.CallbackMetadata?.Item.find(
          (item) => item.Name === "TransactionDate"
        )?.Value;

        // If this is a website subscription, activate user access
        if (paymentInfo.isWebsiteSubscription) {
          const expiresAt = calculateExpiry(paymentInfo.planType);

          // Create or update user subscription
          const userData = {
            phoneNumber: paymentInfo.phoneNumber,
            subscription: {
              planType: paymentInfo.planType,
              amount: paymentInfo.amount,
              activatedAt: new Date(),
              expiresAt: expiresAt,
              isActive: true,
              mpesaReceiptNumber: paymentInfo.mpesaReceiptNumber,
            },
            lastActive: new Date(),
          };

          subscriptions.set(paymentInfo.phoneNumber, userData.subscription);
          users.set(paymentInfo.phoneNumber, userData);

          console.log(
            `✅ Website subscription activated for: ${paymentInfo.phoneNumber}`
          );
          console.log(`📅 Subscription expires: ${expiresAt}`);
          console.log(`💳 Plan: ${paymentInfo.planType}`);
        }
      } else {
        // Payment failed
        paymentInfo.status = "failed";
        paymentInfo.failedAt = new Date();
        paymentInfo.failureReason = stkCallback.ResultDesc;

        console.log(
          `❌ Payment failed: ${checkoutRequestID} - ${stkCallback.ResultDesc}`
        );
      }

      // Update the store
      paymentStore.set(checkoutRequestID, paymentInfo);
    } else {
      console.log(`⚠️ Payment not found in store: ${checkoutRequestID}`);
    }
  }

  res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
});

// Check payment status
app.get("/api/payment-status/:checkoutRequestID", (req, res) => {
  const { checkoutRequestID } = req.params;

  console.log(`🔍 Checking payment status for: ${checkoutRequestID}`);

  if (paymentStore.has(checkoutRequestID)) {
    const paymentInfo = paymentStore.get(checkoutRequestID);
    console.log(
      `📊 Payment status: ${checkoutRequestID} -> ${paymentInfo.status}`
    );

    res.json({
      success: true,
      payment: paymentInfo,
      status: paymentInfo.status,
    });
  } else {
    console.log(`❓ Payment not found: ${checkoutRequestID}`);
    res.status(404).json({
      success: false,
      message: "Payment not found",
    });
  }
});

// Check user subscription status
app.get("/api/user-status/:phoneNumber", (req, res) => {
  const { phoneNumber } = req.params;

  console.log(`🔍 Checking user status for: ${phoneNumber}`);

  const subscription = subscriptions.get(phoneNumber);
  const isActive = isSubscriptionActive(phoneNumber);

  if (subscription) {
    console.log(`📊 User ${phoneNumber} subscription active: ${isActive}`);
    res.json({
      success: true,
      user: {
        phoneNumber,
        subscription,
        isActive,
        expiresAt: subscription.expiresAt,
        daysRemaining: Math.ceil(
          (new Date(subscription.expiresAt) - new Date()) /
            (1000 * 60 * 60 * 24)
        ),
      },
    });
  } else {
    console.log(`❓ User not found or no subscription: ${phoneNumber}`);
    res.json({
      success: true,
      user: {
        phoneNumber,
        subscription: null,
        isActive: false,
        expiresAt: null,
        daysRemaining: 0,
      },
    });
  }
});

// List all users and subscriptions (for admin/debugging)
app.get("/api/admin/users", (req, res) => {
  const userList = Array.from(users.entries()).map(([phone, userData]) => ({
    phoneNumber: phone,
    ...userData,
    isActive: isSubscriptionActive(phone),
  }));

  console.log(`📋 Total users: ${userList.length}`);

  res.json({
    users: userList,
    total: userList.length,
    active: userList.filter((u) => u.isActive).length,
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const activeSubscriptions = Array.from(subscriptions.entries()).filter(
    ([phone]) => isSubscriptionActive(phone)
  ).length;

  res.json({
    status: "OK",
    environment: config.environment,
    timestamp: new Date().toISOString(),
    stats: {
      totalUsers: users.size,
      activeSubscriptions: activeSubscriptions,
      totalPayments: paymentStore.size,
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${config.environment}`);
  console.log(`🔗 Callback URL: ${config.callbackUrl}`);
  console.log(`👥 User subscription system enabled`);
});
