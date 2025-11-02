const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const ContactRoutes = require('./routes/contact');

dotenv.config();
const app = express();

connectDB();

// Configure CORS with optional allowlist from env
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser or same-origin requests (no Origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists and serve it statically
try {
  const uploadsDir = path.join(__dirname, 'uploads');
  const documentsDir = path.join(uploadsDir, 'documents');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(documentsDir)) {
    fs.mkdirSync(documentsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));
} catch (e) {
  console.warn('Failed to initialize uploads directory:', e);
}

app.get("/", (req, res) => {
  res.send("Backend is running successfully 🚀");
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/contact', ContactRoutes);
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/lawyer-feedback', require('./routes/lawyerFeedback'));
app.use('/api/lawyers', require('./routes/lawyer'));
app.use('/api/bookings', require('./routes/booking'));
app.use('/api/appointments', require('./routes/appointment'));
app.use('/api/clients', require('./routes/client'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/documents', require('./routes/document'));
app.use('/api/documentqa', require('./routes/documentqa'));
app.use('/api/payments', require('./routes/payment'));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 