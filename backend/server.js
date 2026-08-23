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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));
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
