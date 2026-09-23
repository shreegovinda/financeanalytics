const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const { initializeDatabase } = require('./db/init');
const { assertEmailConfigured, getProvider } = require('./services/email');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const transactionRoutes = require('./routes/transactions');
const categoryRoutes = require('./routes/categories');
const analyticsRoutes = require('./routes/analytics');
const paymentRoutes = require('./routes/payments');
const aiRoutes = require('./routes/ai');
const billRoutes = require('./routes/bills');
const bankRoutes = require('./routes/banks');
const exportRoutes = require('./routes/export');
const accountClosureRoutes = require('./routes/accountClosure');
const supportRoutes = require('./routes/support');
const adminRoutes = require('./routes/admin');
const whatsappWebhookRoutes = require('./routes/whatsappWebhook');

const app = express();
const PORT = process.env.PORT || 3001;

const configuredOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(
  express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', require('./routes/chat'));
app.use('/api/banks', bankRoutes);
// Nested under a transaction: a bill only has meaning attached to one.
app.use('/api/transactions/:transactionId/bills', billRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/account', accountClosureRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/whatsapp', whatsappWebhookRoutes);
app.use('/api/activity-logs', require('./routes/activityLogs'));

async function startServer() {
  await initializeDatabase();

  // Fail at boot rather than at the moment a user tries to sign up.
  assertEmailConfigured();
  const emailProvider = getProvider();
  console.log(`📧 Email provider: ${emailProvider.label}`);
  if (emailProvider.id === 'console') {
    console.log('   Verification links and OTP codes will be printed below, not emailed.');
  }
  await uploadRoutes.resumeProcessingStatements?.();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
