const appwriteService = require("../utils/appwrite");
const emailService = require("../utils/email");
const { SUBSCRIPTION_PLANS, TILL_NUMBER } = require("../config/constants");
const { Query, Databases } = require("node-appwrite");
const { db } = require("../utils/AppwriteS");
const { Client } = require("node-appwrite");

class PaymentController {
  constructor() {
    this.client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    this.databases = new Databases(this.client);
    this.databaseId = process.env.APPWRITE_DATABASE_ID;
  }

  // Submit payment details
  async submitPayment(req, res) {
    try {
      const { fullName, email, phone, transactionCode, planType } = req.body;

      // Validation
      if (!fullName || !email || !phone || !transactionCode || !planType) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Validate plan type
      if (!SUBSCRIPTION_PLANS[planType]) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan type",
        });
      }

      // Validate phone number
      const phoneRegex = /^(?:254|\+254|0)?[17]\d{8}$/;
      const cleanPhone = phone.replace(/\D/g, "");
      let formattedPhone = cleanPhone;

      if (cleanPhone.startsWith("0")) {
        formattedPhone = "254" + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith("+254")) {
        formattedPhone = cleanPhone.substring(1);
      }

      if (!phoneRegex.test(formattedPhone) || formattedPhone.length !== 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number. Please use format: 07XX XXX XXX",
        });
      }

      // Check if transaction code already exists
      const existingPayment = await appwriteService.getPaymentByTransactionCode(
        transactionCode
      );
      if (existingPayment.success && existingPayment.payment) {
        return res.status(400).json({
          success: false,
          message: "This transaction code has already been used",
        });
      }

      // Create payment record
      const paymentData = {
        fullName,
        email,
        phone: formattedPhone,
        transactionCode,
        planType,
        amount: SUBSCRIPTION_PLANS[planType].amount,
        tillNumber: TILL_NUMBER,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      };

      const result = await appwriteService.createPayment(paymentData);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to record payment",
        });
      }

      console.log("✅ Payment saved to Appwrite. ID:", result.payment.$id);

      // Send confirmation email
      /* await emailService.sendPaymentConfirmation({
        ...paymentData,
        paymentId: result.payment.$id,
      }); */

      // Send confirmation email (with error handling)
      try {
        console.log("📧 Attempting to send email to:", paymentData.email);
        await emailService.sendPaymentConfirmation({
          ...paymentData,
          paymentId: result.payment.$id,
        });
        console.log("✅ Email sent successfully");
      } catch (emailError) {
        console.error("⚠️ Email failed but payment saved:", emailError.message);
        // Don't fail the payment - email is secondary
      }

      // Create user session
      await appwriteService.createUserSession({
        email,
        phone: formattedPhone,
        fullName,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: "Payment submitted successfully",
        paymentId: result.payment.$id,
        data: {
          email,
          phone: formattedPhone,
          planType,
          amount: paymentData.amount,
        },
      });
    } catch (error) {
      console.error("Submit Payment Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Check user subscription status
  async checkSubscription(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      const result = await appwriteService.getUserActiveSubscription(email);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to check subscription status",
        });
      }

      if (result.subscription) {
        const expiresAt = new Date(result.subscription.expires_at);
        const daysRemaining = Math.ceil(
          (expiresAt - new Date()) / (1000 * 60 * 60 * 24)
        );

        return res.json({
          success: true,
          isActive: true,
          subscription: {
            email: result.subscription.email,
            phone: result.subscription.phone,
            planType: result.subscription.plan_type,
            amount: result.subscription.amount,
            expiresAt: result.subscription.expires_at,
            daysRemaining,
            paidAt: result.subscription.paid_at,
          },
        });
      }

      res.json({
        success: true,
        isActive: false,
        message: "No active subscription found",
      });
    } catch (error) {
      console.error("Check Subscription Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get payment history
  async getPaymentHistory(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      const result = await appwriteService.getUserPaymentHistory(email);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch payment history",
        });
      }

      const formattedPayments = result.payments.map((payment) => ({
        id: payment.$id,
        transactionCode: payment.transaction_code,
        amount: payment.amount,
        planType: payment.plan_type,
        status: payment.status,
        paidAt: payment.paid_at,
        expiresAt: payment.expires_at,
        verifiedAt: payment.verification_date,
        gameName: payment.game_name,
        tillNumber: payment.till_number,
      }));

      res.json({
        success: true,
        payments: formattedPayments,
      });
    } catch (error) {
      console.error("Payment History Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Admin: Get all pending payments
  async getPendingPayments(req, res) {
    try {
      const result = await appwriteService.getPendingPayments();

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch pending payments",
        });
      }

      res.json({
        success: true,
        payments: result.payments,
      });
    } catch (error) {
      console.error("Pending Payments Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Admin: Get payment by ID
  async getPaymentById(req, res) {
    try {
      const { adminKey } = req.headers;
      const { paymentId } = req.params;

      // Admin authentication
      if (adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const result = await appwriteService.getPaymentById(paymentId);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      res.json({
        success: true,
        payment: result.payment,
      });
    } catch (error) {
      console.error("Get Payment By ID Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Add to your appwrite.js service:
  async getTotalPaymentsCount() {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID
      );
      return result.total;
    } catch (error) {
      console.error("Get Total Payments Count Error:", error);
      return 0;
    }
  }

  async getPendingPaymentsCount() {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("status", "pending")]
      );
      return result.total;
    } catch (error) {
      console.error("Get Pending Payments Count Error:", error);
      return 0;
    }
  }

  async getActiveUsersCount() {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [
          Query.equal("status", "active"),
          Query.greaterThan("expires_at", new Date().toISOString()),
        ]
      );
      return result.total;
    } catch (error) {
      console.error("Get Active Users Count Error:", error);
      return 0;
    }
  }

  async getTotalRevenue() {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("status", "active")]
      );

      let total = 0;
      result.documents.forEach((payment) => {
        total += parseInt(payment.amount) || 0;
      });

      return total;
    } catch (error) {
      console.error("Get Total Revenue Error:", error);
      return 0;
    }
  }

  /* async getAllPayments(filters) {
    try {
      const queries = [];

      if (filters.status && filters.status !== "all") {
        queries.push(Query.equal("status", filters.status));
      }

      if (filters.dateFrom) {
        queries.push(Query.greaterThanEqual("paid_at", filters.dateFrom));
      }

      if (filters.dateTo) {
        queries.push(Query.lessThanEqual("paid_at", filters.dateTo));
      }

      if (filters.search) {
        queries.push(
          Query.or([
            Query.search("email", filters.search),
            Query.search("transaction_code", filters.search),
            Query.search("full_name", filters.search),
          ])
        );
      }

      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        queries,
        filters.limit,
        (filters.page - 1) * filters.limit,
        "paid_at",
        "DESC"
      );

      return {
        success: true,
        payments: result.documents,
        total: result.total,
      };
    } catch (error) {
      console.error("Get All Payments Error:", error);
      return { success: false, error: error.message };
    }
  }
 */
  async getPaymentById(paymentId) {
    try {
      const payment = await this.databases.getDocument(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        paymentId
      );

      return { success: true, payment };
    } catch (error) {
      console.error("Get Payment By ID Error:", error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Get payment statistics
  async getPaymentStats(req, res) {
    try {
      const { adminKey } = req.headers;

      // Admin authentication
      /* if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid admin key",
        });
      } */

      // Get statistics from Appwrite
      const stats = await appwriteService.getPaymentStats();

      res.json({
        success: true,
        totalPayments: stats.totalPayments || 0,
        pendingCount: stats.pendingCount || 0,
        activeUsers: stats.activeUsers || 0,
        totalRevenue: stats.totalRevenue || 0,
      });
    } catch (error) {
      console.error("Get Payment Stats Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Admin: Get all payments with filters
  async getAllPayments(req, res) {
    try {
      const { adminKey } = req.headers;
      const {
        page = 1,
        limit = 10,
        dateFrom,
        dateTo,
        status,
        search,
      } = req.query;

      // Admin authentication
      /* if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid admin key",
        });
      } */

      const result = await appwriteService.getAllPayments({
        page: parseInt(page),
        limit: parseInt(limit),
        dateFrom,
        dateTo,
        status,
        search,
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to fetch payments",
        });
      }

      res.json({
        success: true,
        payments: result.payments || [],
        total: result.total || 0,
        pages: Math.ceil((result.total || 0) / limit),
        page: parseInt(page),
      });
    } catch (error) {
      console.error("Get All Payments Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Admin: Get payment by ID
  async getPaymentById(req, res) {
    try {
      const { adminKey } = req.headers;
      const { paymentId } = req.params;

      // Admin authentication
      if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid admin key",
        });
      }

      const result = await appwriteService.getPaymentById(paymentId);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      res.json({
        success: true,
        payment: result.payment,
      });
    } catch (error) {
      console.error("Get Payment By ID Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async verifyPayment(req, res) {
    try {
      const { paymentId, status } = req.body;
      const { adminkey, "admin-key": adminKeyHeader } = req.headers;

      // Accept both adminkey and admin-key headers
      const adminKey = adminkey || adminKeyHeader;

      // Simple admin authentication
      if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        console.log("❌ Unauthorized admin attempt:", {
          providedKey: adminKey ? "***" + adminKey.slice(-3) : "none",
          expectedKey: process.env.ADMIN_SECRET
            ? "***" + process.env.ADMIN_SECRET.slice(-3)
            : "none",
        });
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Invalid admin key",
        });
      }

      if (!paymentId || !status) {
        return res.status(400).json({
          success: false,
          message: "Payment ID and status are required",
        });
      }

      console.log(`🔄 Verifying payment ${paymentId} with status: ${status}`);

      const result = await appwriteService.updatePaymentStatus(
        paymentId,
        status
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to update payment status",
        });
      }

      console.log("✅ Payment status updated:", result.payment.$id);

      // If payment is activated, send activation email
      if (status === "active") {
        try {
          console.log("📧 Attempting to send activation email...");
          const emailResult = await emailService.sendActivationConfirmation(
            result.payment
          );

          if (!emailResult.success) {
            console.warn("⚠️ Activation email failed:", emailResult.error);
            // Don't fail the whole operation - just log the warning
            // The payment is still activated even if email fails
          } else {
            console.log("✅ Activation email sent successfully");
          }
        } catch (emailError) {
          console.error(
            "⚠️ Activation email error (non-critical):",
            emailError.message
          );
          // Continue even if email fails
        }
      }

      res.json({
        success: true,
        message: `Payment ${status} successfully`,
        payment: result.payment,
      });
    } catch (error) {
      console.error("Verify Payment Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
  /* async verifyPayment(req, res) {
    try {
      const { paymentId, status } = req.body;
      const { adminKey } = req.headers;

      // Simple admin authentication
       if (adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      } 

      if (!paymentId || !status) {
        return res.status(400).json({
          success: false,
          message: "Payment ID and status are required",
        });
      }

      const result = await appwriteService.updatePaymentStatus(
        paymentId,
        status
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to update payment status",
        });
      }

      // If payment is activated, send activation email
      if (status === "active") {
        await emailService.sendActivationConfirmation(result.payment);
      }

      res.json({
        success: true,
        message: `Payment ${status} successfully`,
        payment: result.payment,
      });
    } catch (error) {
      console.error("Verify Payment Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  } */
}

module.exports = new PaymentController();
