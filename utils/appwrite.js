const { Client, Databases, Query, ID } = require("node-appwrite");

class AppwriteService {
  constructor() {
    this.client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    this.databases = new Databases(this.client);
    this.databaseId = process.env.APPWRITE_DATABASE_ID;
  }

  // Payment Methods
  async createPayment(paymentData) {
    try {
      const expiresAt = new Date();
      const { SUBSCRIPTION_PLANS } = require("../config/constants");
      expiresAt.setDate(
        expiresAt.getDate() + SUBSCRIPTION_PLANS[paymentData.planType].days
      );

      const payment = await this.databases.createDocument(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        ID.unique(),
        {
          email: paymentData.email,
          phone: paymentData.phone,
          transaction_code: paymentData.transactionCode,
          plan_type: paymentData.planType,
          amount: paymentData.amount,
          status: "pending",
          expires_at: expiresAt.toISOString(),
          paid_at: new Date().toISOString(),
          game_name: paymentData.gameName || "",
          till_number: paymentData.tillNumber || process.env.TILL_NUMBER,
          full_name: paymentData.fullName,
          user_agent: paymentData.userAgent || "",
          ip_address: paymentData.ipAddress || "",
        }
      );

      return { success: true, payment };
    } catch (error) {
      console.error("Appwrite Error - Create Payment:", error);
      return { success: false, error: error.message };
    }
  }

  async getPaymentByTransactionCode(transactionCode) {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("transaction_code", transactionCode)]
      );

      return {
        success: true,
        payment: result.documents[0] || null,
      };
    } catch (error) {
      console.error("Appwrite Error - Get Payment:", error);
      return { success: false, error: error.message };
    }
  }

  async getUserActiveSubscription(email) {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [
          Query.equal("email", email),
          Query.equal("status", "active"),
          Query.greaterThan("expires_at", new Date().toISOString()),
        ]
      );

      return {
        success: true,
        subscription: result.documents[0] || null,
      };
    } catch (error) {
      console.error("Appwrite Error - Get Subscription:", error);
      return { success: false, error: error.message };
    }
  }

  async getUserPaymentHistory(email) {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("email", email), Query.orderDesc("$createdAt")],
        100 // Limit to 100 records
      );

      return {
        success: true,
        payments: result.documents,
      };
    } catch (error) {
      console.error("Appwrite Error - Get Payment History:", error);
      return { success: false, error: error.message };
    }
  }

  async updatePaymentStatus(paymentId, status) {
    try {
      const updatedPayment = await this.databases.updateDocument(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        paymentId,
        {
          status: status,
          verification_date: new Date().toISOString(),
        }
      );

      return { success: true, payment: updatedPayment };
    } catch (error) {
      console.error("Appwrite Error - Update Payment:", error);
      return { success: false, error: error.message };
    }
  }

  async getPendingPayments(limit = 50) {
    try {
      const result = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("status", "pending"), Query.orderDesc("$createdAt")],
        limit
      );

      return { success: true, payments: result.documents };
    } catch (error) {
      console.error("Appwrite Error - Get Pending Payments:", error);
      return { success: false, error: error.message };
    }
  }

  // User session management
  async createUserSession(userData) {
    try {
      const session = await this.databases.createDocument(
        this.databaseId,
        process.env.SESSIONS_COLLECTION_ID,
        ID.unique(),
        {
          user_email: userData.email,
          user_phone: userData.phone,
          user_full_name: userData.fullName,
          created_at: new Date().toISOString(),
          expires_at: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(), // 30 days
          last_active: new Date().toISOString(),
          user_agent: userData.userAgent || "",
          ip_address: userData.ipAddress || "",
        }
      );

      return { success: true, session };
    } catch (error) {
      console.error("Appwrite Error - Create Session:", error);
      return { success: false, error: error.message };
    }
  }

  async validateSession(sessionId) {
    try {
      const session = await this.databases.getDocument(
        this.databaseId,
        process.env.SESSIONS_COLLECTION_ID,
        sessionId
      );

      if (new Date(session.expires_at) < new Date()) {
        return { success: false, valid: false, reason: "expired" };
      }

      return { success: true, valid: true, session };
    } catch (error) {
      return { success: false, valid: false, reason: "not_found" };
    }
  }

  // Get payment statistics
  async getPaymentStats() {
    try {
      // Get total payments
      const totalResult = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID
      );

      // Get pending payments
      const pendingResult = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("status", "pending")]
      );

      // Get active users
      const activeResult = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [
          Query.equal("status", "active"),
          Query.greaterThan("expires_at", new Date().toISOString()),
        ]
      );

      // Calculate total revenue from active payments
      const revenueResult = await this.databases.listDocuments(
        this.databaseId,
        process.env.USER_PAYMENTS_COLLECTION_ID,
        [Query.equal("status", "active")]
      );

      let totalRevenue = 0;
      revenueResult.documents.forEach((payment) => {
        totalRevenue += parseInt(payment.amount) || 0;
      });

      return {
        totalPayments: totalResult.total,
        pendingCount: pendingResult.total,
        activeUsers: activeResult.total,
        totalRevenue,
      };
    } catch (error) {
      console.error("Get Payment Stats Error:", error);
      return {
        totalPayments: 0,
        pendingCount: 0,
        activeUsers: 0,
        totalRevenue: 0,
      };
    }
  }

  // Get all payments with filters
  async getAllPayments(filters) {
    try {
      let queries = [];

      if (filters.status && filters.status !== "all") {
        queries.push(Query.equal("status", filters.status));
      }

      if (filters.dateFrom) {
        queries.push(Query.greaterThanEqual("paid_at", filters.dateFrom));
      }

      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        queries.push(Query.lessThanEqual("paid_at", dateTo.toISOString()));
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

  // Get payment by ID
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
}

module.exports = new AppwriteService();
