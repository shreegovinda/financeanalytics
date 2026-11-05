const test = require('node:test');
const assert = require('node:assert');
const {
  classifyCategory,
  scoreSavingsRate,
  scoreDiscretionary,
  scoreRunway,
  scoreDebt,
  scoreStability,
} = require('../services/financialHealthService');

test('classifyCategory categorizes correctly based on keywords', () => {
  assert.strictEqual(classifyCategory('Rent', 'Monthly apartment rent'), 'needs');
  assert.strictEqual(classifyCategory('Utilities', 'Electricity BESCOM'), 'needs');
  assert.strictEqual(classifyCategory('Food', 'Groceries Blinkit supermart'), 'needs');
  assert.strictEqual(classifyCategory('Other', 'Apollo Pharmacy medicines'), 'needs');

  assert.strictEqual(classifyCategory('Dining', 'Swiggy dinner order'), 'wants');
  assert.strictEqual(classifyCategory('Entertainment', 'Netflix monthly sub'), 'wants');
  assert.strictEqual(classifyCategory('Shopping', 'Amazon fashion t-shirt'), 'wants');

  assert.strictEqual(classifyCategory('Other', 'HDFC Bank Home Loan EMI'), 'debt');
  assert.strictEqual(classifyCategory('Other', 'SBI Credit Card Payment'), 'debt');

  assert.strictEqual(classifyCategory('Investment', 'Zerodha Coin SIP'), 'investments');
  assert.strictEqual(classifyCategory('Other', 'PPF annual contribution'), 'investments');
});

test('scoreSavingsRate calculates deterministic 0-100 score', () => {
  // >= 35% savings rate
  assert.strictEqual(scoreSavingsRate(0.4), 100);
  assert.strictEqual(scoreSavingsRate(0.35), 100);

  // 20% - 35% savings rate
  const s25 = scoreSavingsRate(0.25);
  assert.ok(s25 >= 80 && s25 <= 99, `Score ${s25} should be between 80 and 99`);

  // 10% - 20% savings rate
  const s15 = scoreSavingsRate(0.15);
  assert.ok(s15 >= 60 && s15 <= 79, `Score ${s15} should be between 60 and 79`);

  // 0% - 10% savings rate
  const s5 = scoreSavingsRate(0.05);
  assert.ok(s5 >= 40 && s5 <= 59, `Score ${s5} should be between 40 and 59`);

  // Deficit
  const sDeficit = scoreSavingsRate(-0.2);
  assert.ok(sDeficit < 40, `Deficit score ${sDeficit} should be < 40`);
});

test('scoreDiscretionary measures wants discipline (<= 30% target)', () => {
  assert.strictEqual(scoreDiscretionary(0.2), 100);
  assert.strictEqual(scoreDiscretionary(0.25), 100);

  const s30 = scoreDiscretionary(0.3);
  assert.ok(s30 >= 80 && s30 <= 99, `Score ${s30} should be between 80 and 99`);

  const s45 = scoreDiscretionary(0.45);
  assert.ok(s45 >= 55 && s45 <= 79, `Score ${s45} should be between 55 and 79`);

  const s80 = scoreDiscretionary(0.8);
  assert.ok(s80 <= 30, `High wants ratio score ${s80} should be <= 30`);
});

test('scoreRunway measures emergency buffer in months', () => {
  assert.strictEqual(scoreRunway(6.0), 100);
  assert.strictEqual(scoreRunway(7.5), 100);

  const r4 = scoreRunway(4.0);
  assert.ok(r4 >= 80 && r4 <= 99, `Score ${r4} should be between 80 and 99`);

  const r2 = scoreRunway(2.0);
  assert.ok(r2 >= 50 && r2 <= 79, `Score ${r2} should be between 50 and 79`);

  const r0_5 = scoreRunway(0.5);
  assert.ok(r0_5 >= 15 && r0_5 <= 49, `Score ${r0_5} should be between 15 and 49`);
});

test('scoreDebt measures debt-to-income (DTI)', () => {
  assert.strictEqual(scoreDebt(0), 100);

  const d10 = scoreDebt(0.1);
  assert.ok(d10 >= 90 && d10 <= 99, `Score ${d10} should be between 90 and 99`);

  const d25 = scoreDebt(0.25);
  assert.ok(d25 >= 70 && d25 <= 89, `Score ${d25} should be between 70 and 89`);

  const d60 = scoreDebt(0.6);
  assert.ok(d60 <= 40, `High DTI score ${d60} should be <= 40`);
});

test('scoreStability rewards consistent monthly spend', () => {
  assert.strictEqual(scoreStability(0.1, 1), 80); // single month baseline
  assert.strictEqual(scoreStability(0.1, 3), 100); // very stable

  const s25 = scoreStability(0.25, 3);
  assert.ok(s25 >= 70 && s25 <= 90, `Score ${s25} should be between 70 and 90`);

  const s70 = scoreStability(0.7, 3);
  assert.ok(s70 <= 45, `Volatile spend score ${s70} should be <= 45`);
});

const pool = require('../config/db');
const { calculateFinancialHealth } = require('../services/financialHealthService');

test('calculateFinancialHealth handles empty user with no transactions gracefully', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });

  try {
    const result = await calculateFinancialHealth('user-without-tx');
    assert.strictEqual(result.hasData, false);
    assert.strictEqual(result.overallScore, 50);
    assert.ok(result.pillars.savingsRate);
    assert.ok(result.actionableWins.length > 0);
  } finally {
    pool.query = originalQuery;
  }
});

test('calculateFinancialHealth computes healthy profile with high savings and low debt', async () => {
  const originalQuery = pool.query;
  const mockTransactions = [
    // Month 1
    {
      date: '2026-08-01',
      amount: '100000',
      type: 'credit',
      description: 'Salary',
      category_name: 'Salary',
      month_key: '2026-08',
    },
    {
      date: '2026-08-02',
      amount: '25000',
      type: 'debit',
      description: 'Rent',
      category_name: 'Rent',
      month_key: '2026-08',
    },
    {
      date: '2026-08-05',
      amount: '8000',
      type: 'debit',
      description: 'Groceries Blinkit',
      category_name: 'Food',
      month_key: '2026-08',
    },
    {
      date: '2026-08-10',
      amount: '6000',
      type: 'debit',
      description: 'Dining Swiggy',
      category_name: 'Dining',
      month_key: '2026-08',
    },
    {
      date: '2026-08-15',
      amount: '15000',
      type: 'debit',
      description: 'Zerodha Mutual Fund SIP',
      category_name: 'Investment',
      month_key: '2026-08',
    },
    // Month 2
    {
      date: '2026-09-01',
      amount: '100000',
      type: 'credit',
      description: 'Salary',
      category_name: 'Salary',
      month_key: '2026-09',
    },
    {
      date: '2026-09-02',
      amount: '25000',
      type: 'debit',
      description: 'Rent',
      category_name: 'Rent',
      month_key: '2026-09',
    },
    {
      date: '2026-09-06',
      amount: '7500',
      type: 'debit',
      description: 'Groceries',
      category_name: 'Food',
      month_key: '2026-09',
    },
    {
      date: '2026-09-12',
      amount: '5000',
      type: 'debit',
      description: 'Movie & Shopping',
      category_name: 'Entertainment',
      month_key: '2026-09',
    },
    {
      date: '2026-09-15',
      amount: '15000',
      type: 'debit',
      description: 'Mutual Fund SIP',
      category_name: 'Investment',
      month_key: '2026-09',
    },
  ];

  pool.query = async () => ({ rows: mockTransactions });

  try {
    const result = await calculateFinancialHealth('user-healthy-id');
    assert.strictEqual(result.hasData, true);
    assert.ok(result.overallScore >= 75, `Expected high score, got ${result.overallScore}`);
    assert.strictEqual(result.pillars.debtBurden.score, 100); // 0 debt
    assert.ok(result.pillars.savingsRate.score >= 80);
    assert.ok(result.summary.totalInvestments === 30000);
    assert.ok(result.actionableWins.length > 0);
  } finally {
    pool.query = originalQuery;
  }
});
