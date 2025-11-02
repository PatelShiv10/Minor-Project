const User = require('../models/User');
const Booking = require('../models/Booking');
const LawyerClient = require('../models/LawyerClient');

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

exports.getExpandedSlots = async (req, res) => {
  try {
    const { lawyerId } = req.params;
    const { start, end } = req.query; // YYYY-MM-DD
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end are required (YYYY-MM-DD)' });
    }

    const lawyer = await User.findById(lawyerId).select('availability role isVerified');
    if (!lawyer || lawyer.role !== 'lawyer' || !lawyer.isVerified) {
      return res.status(404).json({ success: false, message: 'Lawyer not found' });
    }

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    const results = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayName = dayNames[d.getDay()];
      const daySchedule = (lawyer.availability || []).find(x => x.day === dayName);
    let slots = expandDaySlots(daySchedule, 30);

    if (slots.length > 0) {
        // Exclude already booked slots
        const bookings = await Booking.find({ 
          lawyerId, 
          date: dateStr, 
          status: { $in: ['pending', 'confirmed'] } 
        }).select('start');
        const bookedSet = new Set(bookings.map(b => b.start));
      slots = slots.filter(s => !bookedSet.has(s));
      // If date is today, remove times already passed
      const todayStr = new Date().toISOString().split('T')[0];
      if (dateStr === todayStr) {
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        slots = slots.filter(t => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m >= nowMins;
        });
      }
      }

      results.push({ date: dateStr, slots });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error getting expanded slots:', error);
    res.status(500).json({ success: false, message: 'Failed to get slots' });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const { lawyerId, date, start, durationMins = 30 } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!lawyerId || !date || !start) {
      return res.status(400).json({ success: false, message: 'lawyerId, date, start are required' });
    }

    const lawyer = await User.findById(lawyerId).select('availability role isVerified');
    if (!lawyer || lawyer.role !== 'lawyer' || !lawyer.isVerified) {
      return res.status(404).json({ success: false, message: 'Lawyer not found' });
    }

    // Validate start is in expanded slots for the date
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const d = new Date(date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });
    // Reject past dates
    const today = new Date();
    today.setHours(0,0,0,0);
    const cmp = new Date(d);
    if (cmp < today) {
      return res.status(400).json({ success: false, message: 'Cannot book past dates' });
    }
    const dayName = dayNames[d.getDay()];
    const daySchedule = (lawyer.availability || []).find(x => x.day === dayName);
    const validSlots = new Set(expandDaySlots(daySchedule, 30));
    if (validSlots.size > 0 && !validSlots.has(start)) {
      return res.status(400).json({ success: false, message: 'Selected time is not available' });
    }
    // If lawyer has no published slots for the day, allow booking on 30-min boundary between 09:00-17:00
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

    // If booking is for today, ensure time is not in the past
    const todayStr = new Date().toISOString().split('T')[0];
    if (date === todayStr) {
      const [h, m] = start.split(':').map(Number);
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      if (h * 60 + m < nowMins) {
        return res.status(400).json({ success: false, message: 'Cannot book a past time' });
      }
    }

    // Calculate end time based on start and duration
    const [startHours, startMins] = start.split(':').map(Number);
    const startTotal = startHours * 60 + startMins;
    const endTotal = startTotal + durationMins;
    const endHours = Math.floor(endTotal / 60);
    const endMins = endTotal % 60;
    const end = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

    // Try to create booking (unique index prevents double-booking)
    const booking = await Booking.create({ 
      lawyerId, 
      userId, 
      date, 
      start, 
      end, // Explicitly set the calculated end time
      durationMins, 
      status: 'pending',
      appointmentType: req.body.appointmentType || 'consultation',
      meetingType: req.body.meetingType || 'video_call',
      clientNotes: req.body.notes || ''
    });

    // Ensure client appears in the lawyer's dashboard immediately
    try {
      await LawyerClient.addClientFromAppointment(lawyerId, userId, {
        appointmentType: req.body.appointmentType || 'consultation',
        date,
        start
      });
    } catch (e) {
      console.warn('addClientFromAppointment (pending booking) failed:', e?.message || e);
    }

    res.status(201).json({ success: true, message: 'Booking confirmed', data: booking });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This slot has just been booked by someone else' });
    }
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const booking = await Booking.findById(id)
      .populate('lawyerId', 'firstName lastName')
      .populate('userId', 'firstName lastName');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    // Ensure the authenticated user is either the client or the lawyer
    if (userId && booking.userId && booking.lawyerId) {
      const isClient = String(booking.userId._id) === String(userId);
      const isLawyer = String(booking.lawyerId._id) === String(userId);
      if (!isClient && !isLawyer) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }
    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch booking' });
  }
};