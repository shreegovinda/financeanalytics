const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const { getUserDataExport, generateUserDataPdf } = require('../services/exportService');

const router = express.Router();

/**
 * GET /api/export/json
 * Returns complete machine-readable user data archive.
 */
router.get('/json', authenticateToken, async (req, res) => {
  try {
    const exportData = await getUserDataExport(pool, req.user.id);
    const filename = `finlytix-export-${req.user.id.slice(0, 8)}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    console.error('Error exporting user data as JSON:', err);
    res.status(500).json({ error: 'Failed to generate data export' });
  }
});

/**
 * GET /api/export/pdf
 * Returns readable PDF financial summary report.
 */
router.get('/pdf', authenticateToken, async (req, res) => {
  try {
    const exportData = await getUserDataExport(pool, req.user.id);
    const pdfBuffer = await generateUserDataPdf(exportData);
    const filename = `finlytix-summary-${req.user.id.slice(0, 8)}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error exporting user data as PDF:', err);
    res.status(500).json({ error: 'Failed to generate PDF summary' });
  }
});

module.exports = router;
