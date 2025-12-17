module.exports = {
  TILL_NUMBER: "889900",
  SUPPORT_WHATSAPP: "+254111579473",
  ADMIN_EMAIL: "support@shuleai.com",
  SUPPORT_EMAIL: "support@shuleai.com",

  SUBSCRIPTION_PLANS: {
    monthly: {
      amount: 299,
      days: 30,
      name: "Monthly Access",
    },
    quarterly: {
      amount: 799,
      days: 90,
      name: "Quarterly Access",
    },
    yearly: {
      amount: 2999,
      days: 365,
      name: "Yearly Access",
    },
  },

  PAYMENT_STATUS: {
    PENDING: "pending",
    VERIFIED: "verified",
    ACTIVE: "active",
    EXPIRED: "expired",
    REJECTED: "rejected",
  },

  COLLECTIONS: {
    USER_PAYMENTS: "user_payments",
    USERS: "users",
    SESSIONS: "sessions",
  },
};
