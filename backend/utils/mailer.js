const nodemailer = require('nodemailer');

// Build a transport from environment variables.
// Prefer explicit SMTP settings when provided; otherwise fall back to Gmail service.
function createTransport() {
  const hasCustomSmtp = !!process.env.SMTP_HOST;
  if (hasCustomSmtp) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // For Gmail: must be an App Password if 2FA enabled
    },
  });
}

const transporter = createTransport();

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER or EMAIL_PASS not set; skipping email to', to);
    return false;
  }
  const fromAddress = process.env.EMAIL_FROM || `"LawMate" <${process.env.EMAIL_USER}>`;
  try {
    // Optionally verify connection in development
    if (process.env.NODE_ENV !== 'production') {
      try { await transporter.verify(); } catch (_) { /* ignore verify errors */ }
    }
    const info = await transporter.sendMail({ from: fromAddress, to, subject, html, text, replyTo });
    // Helpful log in dev
    if (process.env.NODE_ENV !== 'production') {
      console.log('Mail sent:', { messageId: info.messageId, to });
    }
    return true;
  } catch (err) {
    console.error('sendMail error:', err?.message || err);
    return false;
  }
}

module.exports = { sendMail };