require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 1);

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
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'HRM API Docs',
}));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const keepAliveTimeout = parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || '65000', 10);
const headersTimeout = parseInt(process.env.SERVER_HEADERS_TIMEOUT_MS || '66000', 10);
if (!Number.isNaN(keepAliveTimeout)) server.keepAliveTimeout = keepAliveTimeout;
if (!Number.isNaN(headersTimeout)) server.headersTimeout = headersTimeout;

function shutdown(signal) {
  console.log(`Received ${signal}. Closing HTTP server...`);
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    process.exit(0);
  });

  // Force close if connections are stuck.
  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
