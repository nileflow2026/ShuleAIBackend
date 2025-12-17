require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function testEmail() {
  try {
    console.log("Testing with:", process.env.EMAIL_USER);

    // Verify connection configuration
    await transporter.verify();
    console.log("✓ SMTP connection verified");

    // Send test email
    const info = await transporter.sendMail({
      from: `"Test" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to yourself first
      subject: "Test Email from ShuleAI",
      text: "If you can read this, email is working!",
      html: "<b>If you can read this, email is working!</b>",
    });

    console.log("✓ Test email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("✗ Email test failed:", error.message);
    console.error("Full error:", error);
    return false;
  }
}

testEmail();
