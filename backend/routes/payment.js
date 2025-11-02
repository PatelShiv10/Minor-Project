const express = require('express');
const router = express.Router();
const { createOrder, verifyAndCreateBooking, listPayments } = require('../controllers/paymentController');
const { protect, lawyer } = require('../middlewares/authMiddleware');

// POST /api/payments/create-order
router.post('/create-order', createOrder);
// POST /api/payments/verify
router.post('/verify', protect, verifyAndCreateBooking);
// GET /api/payments
router.get('/', protect, lawyer, listPayments);

module.exports = router;


