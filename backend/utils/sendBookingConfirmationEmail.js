const { sendEmail } = require('./sendEmail');

function formatInr(amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(isoOrYmd) {
  // booking.date is YYYY-MM-DD; accept ISO too
  const d = isoOrYmd?.includes('T') ? new Date(isoOrYmd) : new Date(`${isoOrYmd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoOrYmd || '';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

/**
 * Build and send a professional booking confirmation email.
 * @param {{ firstName?: string, lastName?: string, email?: string }} user
 * @param {any} booking
 */
async function sendBookingConfirmationEmail(user, booking) {
  const appName = process.env.APP_NAME || 'LawMate';
  const subject = `Your Booking Confirmation – ${appName}`;

  const serviceName = booking?.serviceName
    || booking?.appointmentType
    || 'Consultation';

  const displayAmount = (() => {
    if (typeof booking?.paymentAmountPaise === 'number') return formatInr(booking.paymentAmountPaise / 100);
    if (typeof booking?.amount === 'number') return formatInr(booking.amount);
    return '—';
  })();

  const bookingDate = formatDate(booking?.date);
  const bookingTime = `${booking?.start || '--:--'} – ${booking?.end || '--:--'}`;
  const clientName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Customer';

  const html = `
    <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f7fa;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #eceff3;">
        <div style="background:#0ea5a4;color:#ffffff;padding:16px 20px;">
          <h1 style="margin:0;font-size:20px;">${appName}</h1>
        </div>
        <div style="padding:20px;">
          <h2 style="margin:0 0 12px;font-size:18px;">Your Appointment is Confirmed ✅</h2>
          <p style="margin:0 0 12px;">Hi ${clientName},</p>
          <p style="margin:0 0 16px;">Thank you for your booking. Your appointment has been <b>confirmed</b>.</p>

          <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0;">
            <div style="background:#f9fafb;padding:12px 16px;font-weight:600;">Booking Summary</div>
            <div style="padding:16px;">
              <table style="width:100%;border-collapse:collapse;">
                <tbody>
                  <tr>
                    <td style="padding:8px 0;color:#374151;"><b>Booking ID</b></td>
                    <td style="padding:8px 0;text-align:right;color:#111827;">${booking?._id}</td>
                  </tr>
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

          <p style="margin:16px 0;">We look forward to assisting you. If you have any questions, reply to this email.</p>
          <p style="margin:0 0 4px;"><b>Thank you for booking with ${appName}!</b></p>
        </div>
        <div style="background:#f9fafb;color:#6b7280;font-size:12px;padding:12px 20px;text-align:center;border-top:1px solid #eceff3;">
          © ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </div>
  `;

  if (!user?.email) return false;
  const ok = await sendEmail(user.email, subject, html);
  if (ok) console.log(`✅ Booking confirmation email sent to ${user.email}`);
  return ok;
}

module.exports = { sendBookingConfirmationEmail };


