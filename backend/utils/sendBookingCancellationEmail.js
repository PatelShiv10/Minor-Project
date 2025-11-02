const { sendEmail } = require('./sendEmail');

function formatInr(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount || 0));
  } catch (_) {
    return `₹${Number(amount || 0).toFixed(2)}`;
  }
}

function formatDate(isoOrYmd) {
  try {
    const d = typeof isoOrYmd === 'string' && isoOrYmd.length === 10
      ? new Date(`${isoOrYmd}T00:00:00Z`)
      : new Date(isoOrYmd);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  } catch (_) {
    return isoOrYmd || '';
  }
}

/**
 * Send a professional cancellation email to the client including reason.
 * This mirrors the confirmation email style used elsewhere.
 * @param {{ firstName?: string, lastName?: string, email?: string }} user
 * @param {any} booking - booking document or plain object
 * @param {string} reason - reason provided by the lawyer
 */
async function sendBookingCancellationEmail(user, booking, reason) {
  const appName = process.env.APP_NAME || 'LawMate';
  const subject = `Your Appointment Was Cancelled – ${appName}`;

  const clientName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Customer';
  const serviceName = booking?.appointmentType || booking?.serviceName || 'Consultation';
  const bookingDate = formatDate(booking?.date);
  const bookingTime = `${booking?.start || '--:--'} – ${booking?.end || '--:--'}`;
  const displayAmount = (() => {
    if (typeof booking?.paymentAmountPaise === 'number') return formatInr(booking.paymentAmountPaise / 100);
    if (typeof booking?.amount === 'number') return formatInr(booking.amount);
    return '—';
  })();

  const reasonHtml = reason
    ? `<div style="margin-top:8px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#7c2d12;">
         <div style="font-weight:600;margin-bottom:4px;">Reason from the lawyer</div>
         <div style="white-space:pre-wrap;">${String(reason).slice(0,500)}</div>
       </div>`
    : '';

  const html = `
    <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f7fa;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #eceff3;">
        <div style="background:#0ea5a4;color:#ffffff;padding:16px 20px;">
          <h1 style="margin:0;font-size:20px;">${appName}</h1>
        </div>
        <div style="padding:20px 20px 8px;color:#111827;">
          <h2 style="margin:0 0 8px;font-size:18px;">Your Appointment Was Cancelled</h2>
          <p style="margin:0 0 16px;color:#374151;">Hi ${clientName}, your appointment has been cancelled by the lawyer.</p>

          ${reasonHtml}

          <div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <div style="background:#f9fafb;padding:12px 16px;font-weight:600;color:#111827;">Booking Summary</div>
            <div style="padding:12px 16px;">
              <table style="width:100%;border-collapse:collapse;">
                <tbody>
                  <tr>
                    <td style="padding:8px 0;color:#374151;"><b>Service</b></td>
                    <td style="padding:8px 0;text-align:right;color:#111827;">${serviceName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#374151;"><b>Date</b></td>
                    <td style="padding:8px 0;text-align:right;color:#111827;">${bookingDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#374151;"><b>Time</b></td>
                    <td style="padding:8px 0;text-align:right;color:#111827;">${bookingTime}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#374151;"><b>Amount</b></td>
                    <td style="padding:8px 0;text-align:right;color:#111827;">${displayAmount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p style="margin:16px 0;color:#374151;">Any payment, if captured, will be refunded as per policy. If you have questions, just reply to this email.</p>
          <p style="margin:0 0 8px;"><b>Regards,<br>${appName} Team</b></p>
        </div>
        <div style="background:#f9fafb;color:#6b7280;font-size:12px;padding:12px 20px;text-align:center;border-top:1px solid #eceff3;">
          © ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </div>
  `;

  if (!user?.email) return false;
  return await sendEmail(user.email, subject, html);
}

module.exports = { sendBookingCancellationEmail };


