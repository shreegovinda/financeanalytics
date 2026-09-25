const PDFDocument = require('pdfkit');
const {
  formatCurrency,
  formatDate,
  formatReportDate,
  formatReportMonth,
  formatReportDateTime,
  formatReportCurrency,
} = require('../utils/formatters');
const { safeDecrypt, decryptJson } = require('./crypto');

/**
 * Gathers complete machine-readable user data export.
 * Strictly excludes password_hashes, verification tokens, session tokens, and raw secrets.
 */
async function getUserDataExport(pool, userId) {
  // 1. Profile
  const profileRes = await pool.query(
    `SELECT id, email, name, phone, locale, timezone, currency, language,
            selected_ai_provider, selected_ai_model, ai_key_mode,
            email_verified, email_verified_at, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  if (profileRes.rows.length === 0) {
    throw new Error('User not found');
  }
  const rawUser = profileRes.rows[0];
  const user = {
    ...rawUser,
    name: safeDecrypt(rawUser.name),
    phone: safeDecrypt(rawUser.phone),
  };

  // 2. Bank accounts
  const bankAccountsRes = await pool.query(
    `SELECT b.id, b.bank_code, b.catalogue_id, b.active, b.created_at,
            c.name AS catalogue_bank_name
     FROM user_bank_accounts b
     LEFT JOIN bank_catalogue c ON b.catalogue_id = c.id
     WHERE b.user_id = $1 ORDER BY b.created_at ASC`,
    [userId],
  );

  // 3. Statements & Drafts with actual transaction counts and debit/credit totals
  const statementsRes = await pool.query(
    `SELECT s.id, s.bank_name, s.file_name,
            to_char(s.statement_month, 'YYYY-MM') AS statement_month,
            s.status, s.processing_stage, s.file_format, s.detected_bank_name, s.currency,
            s.uploaded_at, s.processed_at,
            COALESCE(
              d.transaction_count,
              (SELECT count(*)::int FROM transactions t WHERE t.statement_id = s.id)
            ) AS transaction_count,
            COALESCE(
              d.total_debit,
              (SELECT COALESCE(sum(amount), 0)::numeric FROM transactions t WHERE t.statement_id = s.id AND t.type = 'debit')
            ) AS total_debit,
            COALESCE(
              d.total_credit,
              (SELECT COALESCE(sum(amount), 0)::numeric FROM transactions t WHERE t.statement_id = s.id AND t.type = 'credit')
            ) AS total_credit
     FROM statements s
     LEFT JOIN statement_drafts d ON s.id = d.statement_id
     WHERE s.user_id = $1
     ORDER BY s.statement_month DESC NULLS LAST, s.uploaded_at DESC`,
    [userId],
  );

  // 4. Transactions with clean calendar date and associated statement bank name
  const transactionsRes = await pool.query(
    `SELECT t.id, t.statement_id,
            to_char(t.date, 'YYYY-MM-DD') AS date,
            t.amount, t.description, t.type, t.currency,
            COALESCE(c.name, t.ai_suggested_category, 'Uncategorized') AS category_name,
            s.bank_name,
            t.has_bill, t.created_at
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN statements s ON t.statement_id = s.id
     WHERE t.user_id = $1
     ORDER BY t.date DESC, t.created_at DESC, t.id DESC`,
    [userId],
  );
  const transactions = transactionsRes.rows.map((t) => ({
    ...t,
    description: safeDecrypt(t.description),
  }));

  // 5. Categories
  const categoriesRes = await pool.query(
    `SELECT id, name, color, is_default, parent_id, created_at
     FROM categories WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );

  // 6. Bills & Line items
  const billsRes = await pool.query(
    `SELECT b.id, b.transaction_id, b.file_name, b.merchant_name,
            b.bill_total,
            to_char(b.bill_date, 'YYYY-MM-DD') AS bill_date,
            b.status, b.created_at, b.confirmed_at,
            COALESCE(json_agg(
              json_build_object(
                'id', li.id,
                'description', li.description,
                'quantity', li.quantity,
                'unit_price', li.unit_price,
                'amount', li.amount
              )
            ) FILTER (WHERE li.id IS NOT NULL), '[]'::json) AS line_items
     FROM transaction_bills b
     LEFT JOIN transaction_line_items li ON b.id = li.transaction_bill_id
     WHERE b.user_id = $1
     GROUP BY b.id
     ORDER BY b.bill_date DESC NULLS LAST, b.created_at DESC`,
    [userId],
  );
  const bills = billsRes.rows.map((b) => ({
    ...b,
    file_name: safeDecrypt(b.file_name),
    merchant_name: safeDecrypt(b.merchant_name),
    line_items: (b.line_items || []).map((li) => ({
      ...li,
      description: safeDecrypt(li.description),
    })),
  }));

  // 7. Payments
  const paymentsRes = await pool.query(
    `SELECT id, razorpay_order_id, razorpay_payment_id, amount, currency,
            description, feature, status, payment_method, created_at, paid_at
     FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );

  // 8. Chat History
  const chatRes = await pool.query(
    `SELECT m.id, m.role, m.content, m.result, m.created_at, m.conversation_id, c.title AS conversation_title
     FROM chat_messages m LEFT JOIN chat_conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id
     WHERE m.user_id = $1 ORDER BY m.created_at ASC`,
    [userId],
  );
  const chatMessages = chatRes.rows.map((m) => {
    let res = m.result;
    if (res && res.encrypted) {
      try {
        res = decryptJson(res.encrypted);
      } catch (e) {
        console.error('Failed to decrypt chat result during export:', e);
      }
    }
    return {
      ...m,
      content: safeDecrypt(m.content),
      conversation_title: m.conversation_title ? safeDecrypt(m.conversation_title) : null,
      result: res,
    };
  });

  // 9. Consents
  const consentsRes = await pool.query(
    `SELECT id, policy_version, ip_address, user_agent, consented_at
     FROM user_consents WHERE user_id = $1 ORDER BY consented_at ASC`,
    [userId],
  );

  // Export preferences only, never the encrypted or plaintext credentials.
  const aiUseCasesRes = await pool.query(
    'SELECT use_case, provider, model, key_mode, updated_at FROM user_ai_use_cases WHERE user_id=$1 ORDER BY use_case',
    [userId],
  );

  // Summary & Provenance
  const summary = {
    exportDate: new Date().toISOString(),
    schemaVersion: '1.0.0',
    platform: 'Finlytix Personal Finance Platform',
    recordCounts: {
      bankAccounts: bankAccountsRes.rows.length,
      statements: statementsRes.rows.length,
      transactions: transactions.length,
      categories: categoriesRes.rows.length,
      bills: bills.length,
      payments: paymentsRes.rows.length,
      chatMessages: chatMessages.length,
      consentRecords: consentsRes.rows.length,
    },
  };

  return {
    metadata: summary,
    profile: user,
    aiUseCases: aiUseCasesRes.rows,
    bankAccounts: bankAccountsRes.rows,
    statements: statementsRes.rows,
    transactions,
    categories: categoriesRes.rows,
    bills,
    payments: paymentsRes.rows,
    chatMessages,
    consents: consentsRes.rows,
  };
}

/**
 * Generates a comprehensive, highly presentable PDF financial report from user export data.
 * Presents executive summaries, linked banks, spending breakdown, statement archives,
 * and the complete detailed transaction ledger across multi-page paginated tables.
 */
function generateUserDataPdf(exportData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const {
        profile = {},
        transactions = [],
        statements = [],
        bankAccounts = [],
        bills = [],
        metadata = {},
      } = exportData;

      const currency = profile.currency || 'INR';
      const locale = profile.locale || 'en-IN';
      const tz = profile.timezone || 'Asia/Kolkata';

      const contentWidth = 515;
      const leftMargin = 40;
      const maxY = 765;

      // Helper to check page break and optionally redraw table header
      function ensureSpace(heightNeeded, onNewPage) {
        if (doc.y + heightNeeded > maxY) {
          doc.addPage();
          if (onNewPage) onNewPage();
          return true;
        }
        return false;
      }

      function drawSectionTitle(title, subtitle) {
        ensureSpace(45);
        doc.moveDown(0.7);
        const y = doc.y;
        doc.rect(leftMargin, y + 2, 4, 13).fill('#2563eb');
        doc
          .fillColor('#0f172a')
          .fontSize(11.5)
          .font('Helvetica-Bold')
          .text(title, leftMargin + 10, y);
        if (subtitle) {
          doc
            .fillColor('#64748b')
            .fontSize(8)
            .font('Helvetica')
            .text(subtitle, leftMargin + 10, y + 14);
          doc.y = y + 26;
        } else {
          doc.y = y + 18;
        }
        doc.moveDown(0.25);
      }

      // 1. Top Cover Banner
      doc.rect(leftMargin, 40, contentWidth, 68).fill('#0f172a');
      doc
        .fillColor('#ffffff')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Finlytix Personal Financial Report', leftMargin + 15, 52);
      doc
        .fillColor('#94a3b8')
        .fontSize(8.5)
        .font('Helvetica')
        .text('Comprehensive Financial Ledger, Statements & Account Archive', leftMargin + 15, 74);
      doc
        .fillColor('#38bdf8')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(
          `Generated: ${formatReportDateTime(metadata.exportDate, tz)} • User: ${profile.email}`,
          leftMargin + 15,
          89,
        );

      doc.y = 118;

      // 2. Account Profile & Regional Settings Box
      drawSectionTitle(
        'Account Profile & Regional Settings',
        'Registered personal details and localization preferences',
      );
      const profileBoxY = doc.y;
      doc.rect(leftMargin, profileBoxY, contentWidth, 54).fillAndStroke('#f8fafc', '#e2e8f0');

      doc.fillColor('#334155').fontSize(8).font('Helvetica');
      // Left Column
      doc
        .font('Helvetica-Bold')
        .text('Name: ', leftMargin + 12, profileBoxY + 8, { continued: true })
        .font('Helvetica')
        .text(profile.name || 'Not provided');
      doc
        .font('Helvetica-Bold')
        .text('Email: ', leftMargin + 12, profileBoxY + 22, { continued: true })
        .font('Helvetica')
        .text(profile.email || 'N/A');
      doc
        .font('Helvetica-Bold')
        .text('Mobile: ', leftMargin + 12, profileBoxY + 36, { continued: true })
        .font('Helvetica')
        .text(profile.phone || 'Not provided');

      // Right Column
      const rightColX = leftMargin + 270;
      doc
        .font('Helvetica-Bold')
        .text('Currency: ', rightColX, profileBoxY + 8, { continued: true })
        .font('Helvetica')
        .text(`${currency} (${profile.currency || 'Default'})`);
      doc
        .font('Helvetica-Bold')
        .text('Timezone: ', rightColX, profileBoxY + 22, { continued: true })
        .font('Helvetica')
        .text(tz);
      doc
        .font('Helvetica-Bold')
        .text('Member Since: ', rightColX, profileBoxY + 36, { continued: true })
        .font('Helvetica')
        .text(formatReportDate(profile.created_at));

      doc.y = profileBoxY + 62;

      // 3. Financial Overview KPI Cards
      let totalIncome = 0;
      let totalExpenses = 0;
      let debitCount = 0;
      let creditCount = 0;

      for (const t of transactions) {
        const amt = Number(t.amount || 0);
        if (t.type === 'credit') {
          totalIncome += amt;
          creditCount++;
        } else {
          totalExpenses += Math.abs(amt);
          debitCount++;
        }
      }
      const netCashFlow = totalIncome - totalExpenses;

      drawSectionTitle(
        'Financial Overview Summary',
        'Aggregate transaction volume and net cash position',
      );
      const kpiY = doc.y;
      const kpiWidth = 162;
      const kpiHeight = 50;

      // Box 1: Credits / Income
      doc.rect(leftMargin, kpiY, kpiWidth, kpiHeight).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc
        .fillColor('#166534')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(`TOTAL CREDITS (${creditCount} TXNS)`, leftMargin + 10, kpiY + 8);
      doc
        .fillColor('#15803d')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(
          formatReportCurrency(totalIncome, currency, locale, false),
          leftMargin + 10,
          kpiY + 24,
        );

      // Box 2: Debits / Expenses
      const kpi2X = leftMargin + 176;
      doc.rect(kpi2X, kpiY, kpiWidth, kpiHeight).fillAndStroke('#fef2f2', '#fecaca');
      doc
        .fillColor('#991b1b')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(`TOTAL DEBITS (${debitCount} TXNS)`, kpi2X + 10, kpiY + 8);
      doc
        .fillColor('#b91c1c')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(formatReportCurrency(totalExpenses, currency, locale, false), kpi2X + 10, kpiY + 24);

      // Box 3: Net Cash Flow
      const kpi3X = leftMargin + 352;
      doc.rect(kpi3X, kpiY, kpiWidth, kpiHeight).fillAndStroke('#f8fafc', '#cbd5e1');
      doc
        .fillColor('#1e293b')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('NET CASH FLOW', kpi3X + 10, kpiY + 8);
      doc
        .fillColor(netCashFlow >= 0 ? '#15803d' : '#b91c1c')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(formatReportCurrency(netCashFlow, currency, locale, true), kpi3X + 10, kpiY + 24);

      doc.y = kpiY + 58;

      // 4. Linked Bank Accounts
      drawSectionTitle(
        'Linked Bank Accounts',
        `${bankAccounts.length} bank account(s) registered with platform`,
      );
      if (bankAccounts.length === 0) {
        doc.rect(leftMargin, doc.y, contentWidth, 22).fillAndStroke('#f8fafc', '#e2e8f0');
        doc
          .fillColor('#64748b')
          .fontSize(8)
          .font('Helvetica')
          .text('No bank accounts currently linked.', leftMargin + 10, doc.y + 6);
        doc.y += 26;
      } else {
        const tableY = doc.y;
        doc.rect(leftMargin, tableY, contentWidth, 16).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Bank Name', leftMargin + 8, tableY + 4, { width: 180 });
        doc.text('Bank Code', leftMargin + 195, tableY + 4, { width: 80 });
        doc.text('Status', leftMargin + 285, tableY + 4, { width: 80 });
        doc.text('Linked Date', leftMargin + 375, tableY + 4, { width: 130 });

        let currentY = tableY + 16;
        bankAccounts.forEach((acc, idx) => {
          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(leftMargin, currentY, contentWidth, 16).fillAndStroke(rowBg, '#f1f5f9');
          doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
          doc.text(
            acc.catalogue_bank_name || acc.bank_code || 'Bank',
            leftMargin + 8,
            currentY + 4,
            { width: 180, lineBreak: false },
          );
          doc.text(acc.bank_code || 'N/A', leftMargin + 195, currentY + 4, {
            width: 80,
            lineBreak: false,
          });

          if (acc.active) {
            doc
              .fillColor('#166534')
              .font('Helvetica-Bold')
              .text('ACTIVE', leftMargin + 285, currentY + 4, { width: 80 });
          } else {
            doc
              .fillColor('#94a3b8')
              .font('Helvetica')
              .text('INACTIVE', leftMargin + 285, currentY + 4, { width: 80 });
          }

          doc
            .fillColor('#475569')
            .font('Helvetica')
            .text(formatReportDate(acc.created_at), leftMargin + 375, currentY + 4, {
              width: 130,
            });
          currentY += 16;
        });
        doc.y = currentY + 4;
      }

      // 5. Category Breakdown Table
      const catMap = new Map();
      for (const t of transactions) {
        if (t.type === 'debit') {
          const cat = t.category_name || 'Uncategorized';
          const prev = catMap.get(cat) || { count: 0, amount: 0 };
          prev.count += 1;
          prev.amount += Number(t.amount || 0);
          catMap.set(cat, prev);
        }
      }
      const categoryRows = Array.from(catMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.amount - a.amount);

      if (categoryRows.length > 0) {
        drawSectionTitle(
          'Expense Category Breakdown',
          `Spending grouped across ${categoryRows.length} active category/categories`,
        );

        function drawCatTableHeader(y) {
          doc.rect(leftMargin, y, contentWidth, 16).fill('#1e293b');
          doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
          doc.text('Category', leftMargin + 8, y + 4, { width: 170 });
          doc.text('Transactions', leftMargin + 185, y + 4, { width: 80, align: 'right' });
          doc.text('Total Spent', leftMargin + 280, y + 4, { width: 110, align: 'right' });
          doc.text('Share of Total', leftMargin + 405, y + 4, { width: 100, align: 'right' });
        }

        drawCatTableHeader(doc.y);
        let currentY = doc.y + 16;

        categoryRows.forEach((cat, idx) => {
          ensureSpace(16, () => {
            drawCatTableHeader(doc.y);
            currentY = doc.y + 16;
          });

          const share = totalExpenses > 0 ? ((cat.amount / totalExpenses) * 100).toFixed(1) : '0.0';
          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(leftMargin, currentY, contentWidth, 16).fillAndStroke(rowBg, '#f1f5f9');
          doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
          doc.text(cat.name, leftMargin + 8, currentY + 4, { width: 170, lineBreak: false });
          doc.text(String(cat.count), leftMargin + 185, currentY + 4, {
            width: 80,
            align: 'right',
          });
          doc.text(
            formatReportCurrency(cat.amount, currency, locale, false),
            leftMargin + 280,
            currentY + 4,
            { width: 110, align: 'right' },
          );
          doc.text(`${share}%`, leftMargin + 405, currentY + 4, {
            width: 100,
            align: 'right',
          });
          currentY += 16;
        });
        doc.y = currentY + 4;
      }

      // 6. Uploaded Statements Registry
      drawSectionTitle(
        'Bank Statements Registry',
        `All statement files uploaded and processed (${statements.length} statement records)`,
      );
      if (statements.length === 0) {
        doc.rect(leftMargin, doc.y, contentWidth, 22).fillAndStroke('#f8fafc', '#e2e8f0');
        doc
          .fillColor('#64748b')
          .fontSize(8)
          .font('Helvetica')
          .text('No bank statements currently uploaded.', leftMargin + 10, doc.y + 6);
        doc.y += 26;
      } else {
        function drawStatementTableHeader(y) {
          doc.rect(leftMargin, y, contentWidth, 16).fill('#1e293b');
          doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
          doc.text('Bank Name', leftMargin + 8, y + 4, { width: 110 });
          doc.text('Period', leftMargin + 125, y + 4, { width: 60 });
          doc.text('Format', leftMargin + 190, y + 4, { width: 45 });
          doc.text('Status', leftMargin + 240, y + 4, { width: 75 });
          doc.text('Txns', leftMargin + 320, y + 4, { width: 35, align: 'right' });
          doc.text('Total Debits', leftMargin + 360, y + 4, { width: 75, align: 'right' });
          doc.text('Uploaded', leftMargin + 440, y + 4, { width: 68, align: 'right' });
        }

        drawStatementTableHeader(doc.y);
        let currentY = doc.y + 16;

        statements.forEach((s, idx) => {
          ensureSpace(16, () => {
            drawStatementTableHeader(doc.y);
            currentY = doc.y + 16;
          });

          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(leftMargin, currentY, contentWidth, 16).fillAndStroke(rowBg, '#f1f5f9');
          doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
          doc.text(s.bank_name || 'Bank', leftMargin + 8, currentY + 4, {
            width: 110,
            lineBreak: false,
          });
          doc.text(formatReportMonth(s.statement_month), leftMargin + 125, currentY + 4, {
            width: 60,
            lineBreak: false,
          });
          doc.text(s.file_format || 'PDF', leftMargin + 190, currentY + 4, {
            width: 45,
            lineBreak: false,
          });

          const statusColor =
            s.status === 'completed' ? '#166534' : s.status === 'failed' ? '#991b1b' : '#d97706';
          doc
            .fillColor(statusColor)
            .font('Helvetica-Bold')
            .text((s.status || 'pending').toUpperCase(), leftMargin + 240, currentY + 4, {
              width: 75,
              lineBreak: false,
            });

          doc.fillColor('#1e293b').font('Helvetica');
          doc.text(String(s.transaction_count || 0), leftMargin + 320, currentY + 4, {
            width: 35,
            align: 'right',
          });
          doc.text(
            formatReportCurrency(s.total_debit || 0, currency, locale, false),
            leftMargin + 360,
            currentY + 4,
            { width: 75, align: 'right' },
          );
          doc.text(formatReportDate(s.uploaded_at), leftMargin + 440, currentY + 4, {
            width: 68,
            align: 'right',
          });
          currentY += 16;
        });
        doc.y = currentY + 4;
      }

      // 7. Complete Transactions Ledger (ALL DATA)
      drawSectionTitle(
        'Detailed Transactions Ledger',
        `Complete chronological ledger of all imported transactions (${transactions.length} total rows)`,
      );

      if (transactions.length === 0) {
        doc.rect(leftMargin, doc.y, contentWidth, 30).fillAndStroke('#f8fafc', '#e2e8f0');
        doc
          .fillColor('#64748b')
          .fontSize(8)
          .font('Helvetica')
          .text(
            'No transactions currently found in your ledger. Upload your bank statements to populate.',
            leftMargin + 10,
            doc.y + 10,
          );
        doc.y += 36;
      } else {
        function drawTxnTableHeader(y) {
          doc.rect(leftMargin, y, contentWidth, 16).fill('#0f172a');
          doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
          doc.text('Date', leftMargin + 6, y + 4, { width: 68 });
          doc.text('Bank', leftMargin + 76, y + 4, { width: 75 });
          doc.text('Description', leftMargin + 154, y + 4, { width: 172 });
          doc.text('Category', leftMargin + 330, y + 4, { width: 75 });
          doc.text('Type', leftMargin + 408, y + 4, { width: 35 });
          doc.text('Amount', leftMargin + 445, y + 4, { width: 64, align: 'right' });
        }

        drawTxnTableHeader(doc.y);
        let currentY = doc.y + 16;

        transactions.forEach((txn, idx) => {
          ensureSpace(16, () => {
            drawTxnTableHeader(doc.y);
            currentY = doc.y + 16;
          });

          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(leftMargin, currentY, contentWidth, 16).fillAndStroke(rowBg, '#f1f5f9');
          doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');

          doc.text(formatReportDate(txn.date), leftMargin + 6, currentY + 4, {
            width: 68,
            lineBreak: false,
          });
          doc.text(txn.bank_name || 'Bank', leftMargin + 76, currentY + 4, {
            width: 75,
            lineBreak: false,
          });

          const desc = String(txn.description || 'Transaction').trim();
          doc.text(
            desc.length > 36 ? desc.slice(0, 34) + '...' : desc,
            leftMargin + 154,
            currentY + 4,
            { width: 172, lineBreak: false },
          );

          doc.text(txn.category_name || 'Other', leftMargin + 330, currentY + 4, {
            width: 75,
            lineBreak: false,
          });

          const isCredit = txn.type === 'credit';
          if (isCredit) {
            doc
              .fillColor('#166534')
              .font('Helvetica-Bold')
              .text('CREDIT', leftMargin + 408, currentY + 4, { width: 35 });
            doc
              .fillColor('#166534')
              .text(
                formatReportCurrency(Math.abs(Number(txn.amount || 0)), currency, locale, true),
                leftMargin + 445,
                currentY + 4,
                { width: 64, align: 'right', lineBreak: false },
              );
          } else {
            doc
              .fillColor('#991b1b')
              .font('Helvetica')
              .text('DEBIT', leftMargin + 408, currentY + 4, { width: 35 });
            doc
              .fillColor('#991b1b')
              .text(
                formatReportCurrency(-Math.abs(Number(txn.amount || 0)), currency, locale, true),
                leftMargin + 445,
                currentY + 4,
                { width: 64, align: 'right', lineBreak: false },
              );
          }

          currentY += 16;
        });
        doc.y = currentY + 4;
      }

      // 8. Attached Merchant Bills & Receipts
      if (bills.length > 0) {
        drawSectionTitle(
          'Attached Merchant Bills & Invoices',
          `${bills.length} merchant bill(s) verified`,
        );

        function drawBillsHeader(y) {
          doc.rect(leftMargin, y, contentWidth, 16).fill('#1e293b');
          doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
          doc.text('Merchant', leftMargin + 8, y + 4, { width: 180 });
          doc.text('Bill Date', leftMargin + 195, y + 4, { width: 90 });
          doc.text('Status', leftMargin + 295, y + 4, { width: 90 });
          doc.text('Total Charged', leftMargin + 395, y + 4, { width: 110, align: 'right' });
        }

        drawBillsHeader(doc.y);
        let currentY = doc.y + 16;

        bills.forEach((bill, idx) => {
          ensureSpace(16, () => {
            drawBillsHeader(doc.y);
            currentY = doc.y + 16;
          });

          const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(leftMargin, currentY, contentWidth, 16).fillAndStroke(rowBg, '#f1f5f9');
          doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
          doc.text(bill.merchant_name || 'Merchant', leftMargin + 8, currentY + 4, {
            width: 180,
            lineBreak: false,
          });
          doc.text(formatReportDate(bill.bill_date), leftMargin + 195, currentY + 4, {
            width: 90,
            lineBreak: false,
          });
          doc.text((bill.status || 'confirmed').toUpperCase(), leftMargin + 295, currentY + 4, {
            width: 90,
            lineBreak: false,
          });
          doc.text(
            formatReportCurrency(bill.bill_total, currency, locale, false),
            leftMargin + 395,
            currentY + 4,
            { width: 110, align: 'right' },
          );
          currentY += 16;
        });
        doc.y = currentY + 4;
      }

      // 9. Compliance, Consent & Security Provenance
      drawSectionTitle(
        'Data Protection & Security Certification',
        'Exported under user data subject rights',
      );
      ensureSpace(42);
      const provY = doc.y;
      doc.rect(leftMargin, provY, contentWidth, 38).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica');
      doc.text(
        'This report contains your official financial ledger and account archive exported pursuant to Finlytix privacy and data governance policies. ' +
          'In compliance with zero-trust application standards, all sensitive credentials—including password hashes, personal AI keys, and session tokens—are strictly withheld from exports.',
        leftMargin + 10,
        provY + 7,
        { width: contentWidth - 20, lineBreak: true },
      );
      doc.y = provY + 44;

      // Running Headers & Running Footers on all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const oldBottom = doc.page.margins.bottom;
        const oldTop = doc.page.margins.top;
        doc.page.margins.bottom = 0;
        doc.page.margins.top = 0;

        // Header on pages after the first
        if (i > range.start) {
          doc
            .strokeColor('#e2e8f0')
            .lineWidth(0.5)
            .moveTo(leftMargin, 28)
            .lineTo(leftMargin + contentWidth, 28)
            .stroke();
          doc
            .fillColor('#94a3b8')
            .fontSize(7.5)
            .font('Helvetica')
            .text('Finlytix Financial Archive • Confidential', leftMargin, 18, {
              width: contentWidth,
              align: 'left',
              lineBreak: false,
            })
            .text(`Export: ${profile.email || ''}`, leftMargin, 18, {
              width: contentWidth,
              align: 'right',
              lineBreak: false,
            });
        }

        // Footer on all pages
        const footerY = doc.page.height - 25;
        doc
          .strokeColor('#e2e8f0')
          .lineWidth(0.5)
          .moveTo(leftMargin, footerY - 4)
          .lineTo(leftMargin + contentWidth, footerY - 4)
          .stroke();
        doc
          .fillColor('#94a3b8')
          .fontSize(7.5)
          .font('Helvetica')
          .text(
            'Finlytix Personal Finance Platform • Confidential User Report',
            leftMargin,
            footerY,
            { width: 300, align: 'left', lineBreak: false },
          )
          .text(`Page ${i + 1} of ${range.count}`, leftMargin + 300, footerY, {
            width: contentWidth - 300,
            align: 'right',
            lineBreak: false,
          });

        doc.page.margins.bottom = oldBottom;
        doc.page.margins.top = oldTop;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  getUserDataExport,
  generateUserDataPdf,
};
