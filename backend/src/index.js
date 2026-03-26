require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

function normalizeOrigin(origin) {
  return origin ? origin.replace(/\/$/, '') : origin;
}

const envOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URLS]
  .filter(Boolean)
  .flatMap((value) => value.split(','))
  .map((origin) => normalizeOrigin(origin.trim()))
  .filter(Boolean);

const allowedOrigins = new Set([
  ...envOrigins,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3002',
]);

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/shift-assignments', require('./routes/shiftAssignments'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/overtime', require('./routes/overtime'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/penalties', require('./routes/penalties'));
app.use('/api/penalty-templates', require('./routes/penaltyTemplates'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/timesheets', require('./routes/timesheets'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/time-corrections', require('./routes/timeCorrections'));
app.use('/api/shift-swaps', require('./routes/shiftSwaps'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/export-payroll', require('./routes/exportPayroll'));
app.use('/api/export-templates', require('./routes/exportTemplates'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/chat'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
