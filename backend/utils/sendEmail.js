const nodemailer = require('nodemailer');

function createTransport() {
  if (process.env.SMTP_HOST) {
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
      pass: process.env.EMAIL_PASS,
    },
  });
}

const transporter = createTransport();

/**
 * Send an email using Nodemailer and .env credentials.
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} html
 * @param {{ text?: string, replyTo?: string }} [opts]
 * @returns {Promise<boolean>}
 */
async function sendEmail(to, subject, html, opts = {}) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER or EMAIL_PASS not set; skipping email to', to);
    return false;
  }
  try {
    if (process.env.NODE_ENV !== 'production') {
      try { await transporter.verify(); } catch (_) { /* ignore verify errors in dev */ }
    }
    const from = process.env.EMAIL_FROM || `"${process.env.APP_NAME || 'LawMate'}" <${process.env.EMAIL_USER}>`;
    const info = await transporter.sendMail({ from, to, subject, html, text: opts.text, replyTo: opts.replyTo });
    if (process.env.NODE_ENV !== 'production') {
      console.log('Mail sent:', { messageId: info.messageId, to });
    }
    return true;
  } catch (err) {
    console.error('sendEmail error:', err?.message || err);
    return false;
  }
}

module.exports = { sendEmail };


