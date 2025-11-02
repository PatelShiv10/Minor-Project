const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Booking = require('../models/Booking');
const LawyerClient = require('../models/LawyerClient');
const { sendBookingConfirmationEmail } = require('../utils/sendBookingConfirmationEmail');
const mongoose = require('mongoose');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHmm(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function expandDaySlots(daySchedule, stepMins = 30) {
  if (!daySchedule?.isActive) return [];
  const slots = [];
  for (const s of daySchedule.timeSlots || []) {
    if (!s.isActive) continue;
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    for (let t = start; t + stepMins <= end; t += stepMins) {
      slots.push(toHHmm(t));
    }
  }
  return slots;
}

const createRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body || {};

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const instance = createRazorpayInstance();

    const options = {
      amount: Math.round(Number(amount)),
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    };

    const order = await instance.orders.create(options);

    return res.status(201).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    const description = (error && (error.description || error.message)) || (error?.error && error.error.description) || 'Failed to create order';
    console.error('Error creating Razorpay order:', description, error?.error || error);
    return res.status(status).json({ message: description });
  }
};

exports.verifyAndCreateBooking = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(500).json({ success: false, message: 'Payment secret not configured' });

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    // Optionally fetch order to retrieve notes (fallback details)
    const instance = createRazorpayInstance();
    let orderDetails = null;
    try {
      orderDetails = await instance.orders.fetch(razorpay_order_id);
    } catch (e) {
      // ignore fetch errors; proceed with client-provided booking payload
    }

    // Minimal booking payload validation (merge client payload with order notes fallback)
    const mergedBooking = Object.assign(
      {},
      orderDetails?.notes || {},
      booking || {}
    );

    const { lawyerId, date, start, durationMins = 30, notes, appointmentType, meetingType } = mergedBooking;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!lawyerId || !date || !start) {
      return res.status(400).json({ success: false, message: 'lawyerId, date, start are required' });
    }

    // Validate lawyer and slot similar to bookingController
    const lawyer = await User.findById(lawyerId).select('availability role isVerified');
    if (!lawyer || lawyer.role !== 'lawyer' || !lawyer.isVerified) {
      return res.status(404).json({ success: false, message: 'Lawyer not found' });
    }

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const d = new Date(date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });
    const dayName = dayNames[d.getDay()];
    const daySchedule = (lawyer.availability || []).find(x => x.day === dayName);
    const validSlots = new Set(expandDaySlots(daySchedule, 30));

    if (validSlots.size > 0 && !validSlots.has(start)) {
      return res.status(400).json({ success: false, message: 'Selected time is not available' });
    }
    if (validSlots.size === 0) {
      const match = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(start);
      if (!match) return res.status(400).json({ success: false, message: 'Invalid time format' });
      const [hh, mm] = start.split(':').map(Number);
      const isBoundary = mm === 0 || mm === 30;
      const inWindow = hh >= 9 && hh < 17;
      if (!isBoundary || !inWindow) {
        return res.status(400).json({ success: false, message: 'Please pick a time on 30-min boundary between 09:00 and 17:00' });
      }
    }

    // Compute end time from start and durationMins (explicitly set to satisfy schema requirement)
    const [startHours, startMins] = String(start).split(':').map(Number);
    const startTotal = startHours * 60 + startMins;
    const endTotal = startTotal + Number(durationMins || 30);
    const endHours = Math.floor(endTotal / 60);
    const endMins = endTotal % 60;
    const end = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    // Create booking now that payment is verified
    const created = await Booking.create({
      lawyerId,
      userId,
      date,
      start,
      end,
      durationMins,
      status: 'confirmed',
      appointmentType: appointmentType || 'consultation',
      meetingType: meetingType || 'video_call',
      clientNotes: notes || '',
      // Persist payment details for payments listing
      paymentProvider: 'razorpay',
      paymentOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentSignature: razorpay_signature,
      paymentAmountPaise: Number(orderDetails?.amount || 0),
      paymentCurrency: orderDetails?.currency || 'INR',
      paymentStatus: 'paid'
    });

    // Ensure client appears in the lawyer's dashboard immediately (for paid bookings)
    try {
      await LawyerClient.addClientFromAppointment(lawyerId, userId, {
        appointmentType: appointmentType || 'consultation',
        date,
        start
      });
    } catch (relErr) {
      console.warn('addClientFromAppointment (paid booking) failed:', relErr?.message || relErr);
    }

    // Send confirmation email to the client (production-ready helper)
    try {
      const client = await User.findById(userId).select('firstName lastName email');
      await sendBookingConfirmationEmail(client, created);
    } catch (mailErr) {
      console.warn('Booking confirmation email failed:', mailErr);
    }

    return res.status(201).json({ success: true, message: 'Payment verified, booking created', data: created });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slot has just been booked by someone else' });
    }
    console.error('Payment verification/booking error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify payment or create booking' });
  }
};

// GET /api/payments
// Returns normalized list of payments derived from bookings for the authenticated lawyer
exports.listPayments = async (req, res) => {
  try {
    const authUserId = req.user?.id;
    if (!authUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Only show payments for the current lawyer
    const lawyerId = authUserId;

    const bookings = await Booking.find({
      lawyerId: new mongoose.Types.ObjectId(lawyerId),
      status: { $in: ['confirmed', 'completed'] }
    })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    const data = bookings.map(b => ({
      id: String(b._id),
      clientName: [b.userId?.firstName, b.userId?.lastName].filter(Boolean).join(' ') || 'Unknown',
      amount: typeof b.paymentAmountPaise === 'number' ? Number(b.paymentAmountPaise) / 100 : 0,
      date: b.confirmedAt || b.createdAt,
      status: b.paymentStatus || b.status,
      transactionId: b.paymentId || '-'
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('listPayments error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch payments' });
  }
};

