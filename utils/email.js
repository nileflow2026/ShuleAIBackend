const nodemailer = require("nodemailer");
const {
  SUBSCRIPTION_PLANS,
  TILL_NUMBER,
  SUPPORT_WHATSAPP,
} = require("../config/constants");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendPaymentConfirmation(paymentData) {
    console.log("📧 sendPaymentConfirmation called with:", {
      email: paymentData.email,
      user: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASSWORD,
    });
    const plan = SUBSCRIPTION_PLANS[paymentData.planType];

    const mailOptions = {
      from: `"ShuleAI" <${process.env.EMAIL_USER}>`,
      to: paymentData.email,
      subject: `Payment Received - ShuleAI ${plan.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #2e7d4a, #4caf50); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Payment Received!</h1>
                    <p>Thank you for subscribing to ShuleAI</p>
                </div>
                <div class="content">
                    <h2>Hello ${paymentData.fullName},</h2>
                    <p>We have received your payment for ShuleAI ${
                      plan.name
                    }.</p>
                    
                    <div class="info-box">
                        <h3>Payment Details:</h3>
                        <p><strong>Transaction Code:</strong> ${
                          paymentData.transactionCode
                        }</p>
                        <p><strong>Amount Paid:</strong> KSh ${
                          paymentData.amount
                        }</p>
                        <p><strong>Plan:</strong> ${plan.name}</p>
                        <p><strong>Till Number:</strong> ${TILL_NUMBER}</p>
                        <p><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</p>
                        <p><strong>Payment ID:</strong> ${
                          paymentData.paymentId
                        }</p>
                    </div>
                    
                    <div class="info-box">
                        <h3>What's Next?</h3>
                        <p>✅ Your payment is being verified</p>
                        <p>📧 You'll receive another email when your subscription is activated</p>
                        <p>⏰ Activation typically takes 2-24 hours</p>
                        <p>📱 For immediate activation, WhatsApp your M-Pesa confirmation to: <strong>${SUPPORT_WHATSAPP}</strong></p>
                    </div>
                    
                    <p>If you have any questions, please reply to this email or contact our support team.</p>
                    
                    <div class="footer">
                        <p>Best regards,<br>The ShuleAI Team</p>
                        <p>© 2025 ShuleAI. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `,
    };

    try {
      console.log("📤 Attempting to send email via transporter");
      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", info.messageId);
      return { success: true };
    } catch (error) {
      console.error("Email Error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendActivationConfirmation(paymentData) {
    try {
      console.log("📧 Activation email payment data:", {
        planType: paymentData.planType,
        plan_type: paymentData.plan_type,
        keys: Object.keys(paymentData),
      });

      // Use plan_type (from database) if planType is not available
      const planType = paymentData.planType || paymentData.plan_type;

      if (!planType) {
        console.error("❌ Plan type not found in payment data");
        return { success: false, error: "Plan type not found" };
      }

      const plan = SUBSCRIPTION_PLANS[planType];

      if (!plan) {
        console.error("❌ Invalid plan type:", planType);
        console.log("Available plans:", Object.keys(SUBSCRIPTION_PLANS));
        return { success: false, error: `Invalid plan type: ${planType}` };
      }

      const expiresAt = new Date(paymentData.expires_at);
      const fullName =
        paymentData.full_name || paymentData.fullName || "Valued User";
      const email = paymentData.email;

      if (!email) {
        console.error("❌ Email not found in payment data");
        return { success: false, error: "Email not found" };
      }

      console.log("✅ Preparing activation email for:", {
        email,
        fullName,
        planType,
        planName: plan.name,
        expiresAt: expiresAt.toISOString(),
      });

      const mailOptions = {
        from: `"ShuleAI" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `🎉 Your ShuleAI Subscription is Now Active!`,
        html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #4caf50, #2e7d4a); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .success-icon { font-size: 4rem; margin: 20px 0; }
                        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                        .cta-button { display: inline-block; background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="success-icon">✅</div>
                            <h1>Subscription Activated!</h1>
                            <p>Your ShuleAI access is now active</p>
                        </div>
                        <div class="content">
                            <h2>Welcome to ShuleAI Premium, ${fullName}!</h2>
                            
                            <p>Your <strong>${
                              plan.name
                            }</strong> subscription has been verified and activated.</p>
                            
                            <h3>Your Subscription Details:</h3>
                            <ul>
                                <li><strong>Plan:</strong> ${plan.name}</li>
                                <li><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</li>
                                <li><strong>Days Remaining:</strong> ${Math.ceil(
                                  (expiresAt - new Date()) /
                                    (1000 * 60 * 60 * 24)
                                )} days</li>
                                <li><strong>Access Level:</strong> Full access to all games and features</li>
                            </ul>
                            
                            <a href="${
                              process.env.FRONTEND_URL ||
                              "https://shule.memeyai.com"
                            }" class="cta-button">
                                Start Playing Now! 🎮
                            </a>
                            
                            <p><strong>Need Help?</strong></p>
                            <ul>
                                <li>Email: ${
                                  process.env.SUPPORT_EMAIL ||
                                  process.env.EMAIL_USER
                                }</li>
                                <li>WhatsApp: ${SUPPORT_WHATSAPP}</li>
                                <li>Website: ${
                                  process.env.FRONTEND_URL ||
                                  "hhttps://shule.memeyai.com"
                                }</li>
                            </ul>
                            
                            <div class="footer">
                                <p>Happy learning!<br>The ShuleAI Team</p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `,
      };

      console.log("📤 Sending activation email to:", email);
      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ Activation email sent successfully:", info.messageId);

      return { success: true };
    } catch (error) {
      console.error("❌ Activation Email Error:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  /* async sendActivationConfirmation(paymentData) {
    const plan = SUBSCRIPTION_PLANS[paymentData.planType];
    const expiresAt = new Date(paymentData.expires_at);

    const mailOptions = {
      from: `"ShuleAI" <${process.env.EMAIL_USER}>`,
      to: paymentData.email,
      subject: `🎉 Your ShuleAI Subscription is Now Active!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4caf50, #2e7d4a); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .success-icon { font-size: 4rem; margin: 20px 0; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                .cta-button { display: inline-block; background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✅</div>
                    <h1>Subscription Activated!</h1>
                    <p>Your ShuleAI access is now active</p>
                </div>
                <div class="content">
                    <h2>Welcome to ShuleAI Premium, ${
                      paymentData.full_name
                    }!</h2>
                    
                    <p>Your <strong>${
                      plan.name
                    }</strong> subscription has been verified and activated.</p>
                    
                    <h3>Your Subscription Details:</h3>
                    <ul>
                        <li><strong>Plan:</strong> ${plan.name}</li>
                        <li><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</li>
                        <li><strong>Days Remaining:</strong> ${Math.ceil(
                          (expiresAt - new Date()) / (1000 * 60 * 60 * 24)
                        )} days</li>
                        <li><strong>Access Level:</strong> Full access to all games and features</li>
                    </ul>
                    
                    <a href="${
                      process.env.FRONTEND_URL || "http://localhost:5500"
                    }" class="cta-button">
                        Start Playing Now! 🎮
                    </a>
                    
                    <p><strong>Need Help?</strong></p>
                    <ul>
                        <li>Email: ${process.env.SUPPORT_EMAIL}</li>
                        <li>WhatsApp: ${SUPPORT_WHATSAPP}</li>
                        <li>Website: ${
                          process.env.FRONTEND_URL || "http://localhost:5500"
                        }</li>
                    </ul>
                    
                    <div class="footer">
                        <p>Happy learning!<br>The ShuleAI Team</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Activation Email Error:", error);
      return { success: false, error: error.message };
    }
  } */
}

module.exports = new EmailService();
