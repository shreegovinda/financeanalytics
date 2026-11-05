const pool = require('../config/db');
const { safeDecrypt } = require('./crypto');

/**
 * Keyword matchers to classify transactions into financial pillars:
 * - needs: Essential nondiscretionary survival expenses
 * - wants: Discretionary lifestyle spending
 * - debt: Loan EMIs, debt service, credit card payments
 * - investments: Wealth accumulation (SIPs, PPF, mutual funds, gold)
 */
const CATEGORY_RULES = {
  needs: [
    'rent',
    'grocer',
    'utilit',
    'electric',
    'water',
    'gas',
    'bill',
    'hospital',
    'medic',
    'pharm',
    'doctor',
    'health',
    'insur',
    'education',
    'school',
    'college',
    'tuition',
    'fee',
    'fuel',
    'petrol',
    'diesel',
    'cng',
    'transport',
    'commute',
    'metro',
    'toll',
  ],
  wants: [
    'entertainment',
    'shopping',
    'dining',
    'food',
    'restaurant',
    'cafe',
    'swiggy',
    'zomato',
    'eatery',
    'bar',
    'pub',
    'club',
    'alcohol',
    'travel',
    'hotel',
    'flight',
    'vacation',
    'trip',
    'uber',
    'ola',
    'subscription',
    'netflix',
    'spotify',
    'prime',
    'hotstar',
    'youtube',
    'game',
    'electronics',
    'fashion',
    'clothing',
    'apparel',
    'personal care',
    'salon',
    'spa',
    'beauty',
    'gift',
    'hobby',
  ],
  debt: [
    'emi',
    'loan',
    'credit card',
    'repayment',
    'interest',
    'mortgage',
    'overdraft',
    'hdfc cc',
    'sbi card',
    'icici card',
    'axis card',
    'rbl card',
  ],
  investments: [
    'investment',
    'invest',
    'mutual fund',
    'sip',
    'ppf',
    'epf',
    'nps',
    'zerodha',
    'groww',
    'kuvera',
    'etmoney',
    'upstox',
    'angel',
    'demat',
    'share',
    'stock',
    'equity',
    'gold',
    'fixed deposit',
    'recurring deposit',
    'fd',
    'rd',
  ],
};

function matchesRule(text, kw) {
  if (kw.length <= 3) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(text);
  }
  return text.includes(kw);
}

function classifyCategory(categoryName = '', description = '') {
  const text = `${categoryName} ${description}`.toLowerCase();

  // 1. Debt check first (e.g. 'Credit Card Payment' or 'Personal Loan EMI')
  for (const kw of CATEGORY_RULES.debt) {
    if (matchesRule(text, kw)) return 'debt';
  }

  // 2. Investment check (should not be counted as expense burn!)
  for (const kw of CATEGORY_RULES.investments) {
    if (matchesRule(text, kw)) return 'investments';
  }

  // 3. Needs check
  for (const kw of CATEGORY_RULES.needs) {
    if (matchesRule(text, kw)) return 'needs';
  }

  // 4. Wants check
  for (const kw of CATEGORY_RULES.wants) {
    if (matchesRule(text, kw)) return 'wants';
  }

  // Default fallback for general debits
  return 'wants';
}

/**
 * Pillar 1: Savings Rate (Weight: 30%)
 * Target: >= 20% savings rate for strong health, >= 35% for optimal.
 */
function scoreSavingsRate(savingsRate) {
  if (savingsRate >= 0.35) return 100;
  if (savingsRate >= 0.2) {
    return Math.round(80 + ((savingsRate - 0.2) / 0.15) * 19);
  }
  if (savingsRate >= 0.1) {
    return Math.round(60 + ((savingsRate - 0.1) / 0.1) * 19);
  }
  if (savingsRate >= 0.0) {
    return Math.round(40 + (savingsRate / 0.1) * 19);
  }
  // Deficit (spending more than earning)
  return Math.max(0, Math.round(40 + savingsRate * 60));
}

/**
 * Pillar 2: Discretionary Spending / Wants Discipline (Weight: 25%)
 * Target: Under 50/30/20, wants should be <= 30% of expenses.
 */
function scoreDiscretionary(wantsRatio) {
  if (wantsRatio <= 0.25) return 100;
  if (wantsRatio <= 0.35) {
    return Math.round(99 - ((wantsRatio - 0.25) / 0.1) * 19);
  }
  if (wantsRatio <= 0.5) {
    return Math.round(79 - ((wantsRatio - 0.35) / 0.15) * 24);
  }
  if (wantsRatio <= 0.7) {
    return Math.round(54 - ((wantsRatio - 0.5) / 0.2) * 24);
  }
  return Math.max(10, Math.round(30 - ((wantsRatio - 0.7) / 0.3) * 20));
}

/**
 * Pillar 3: Emergency Runway & Buffer (Weight: 20%)
 * Target: 3 to 6 months of essential living expenses.
 */
function scoreRunway(runwayMonths) {
  if (runwayMonths >= 6.0) return 100;
  if (runwayMonths >= 3.0) {
    return Math.round(80 + ((runwayMonths - 3.0) / 3.0) * 19);
  }
  if (runwayMonths >= 1.0) {
    return Math.round(50 + ((runwayMonths - 1.0) / 2.0) * 29);
  }
  if (runwayMonths >= 0.0) {
    return Math.round(15 + (runwayMonths / 1.0) * 34);
  }
  return 10;
}

/**
 * Pillar 4: Debt & Fixed Commitments (Weight: 15%)
 * Target: Debt-to-Income (DTI) <= 15% is optimal, <= 30% is manageable.
 */
function scoreDebt(dtiRatio) {
  if (dtiRatio === 0) return 100;
  if (dtiRatio <= 0.15) {
    return Math.round(99 - (dtiRatio / 0.15) * 9);
  }
  if (dtiRatio <= 0.3) {
    return Math.round(89 - ((dtiRatio - 0.15) / 0.15) * 19);
  }
  if (dtiRatio <= 0.5) {
    return Math.round(69 - ((dtiRatio - 0.3) / 0.2) * 29);
  }
  return Math.max(10, Math.round(40 - ((dtiRatio - 0.5) / 0.5) * 30));
}

/**
 * Pillar 5: Spending Stability & Volatility (Weight: 10%)
 * Measures standard deviation / mean of monthly outlays.
 */
function scoreStability(cv, monthCount) {
  if (monthCount < 2) return 80; // Baseline neutral for new users with 1 month
  if (cv <= 0.15) return 100;
  if (cv <= 0.35) {
    return Math.round(90 - ((cv - 0.15) / 0.2) * 20);
  }
  if (cv <= 0.6) {
    return Math.round(70 - ((cv - 0.35) / 0.25) * 25);
  }
  return Math.max(20, Math.round(45 - ((cv - 0.6) / 0.4) * 25));
}

function getRatingTier(score) {
  if (score >= 85) return { tier: 'Optimal', label: 'Optimal', color: 'emerald' };
  if (score >= 70) return { tier: 'Strong', label: 'Strong', color: 'blue' };
  if (score >= 50) return { tier: 'Moderate', label: 'Moderate', color: 'amber' };
  return { tier: 'Vulnerable', label: 'Vulnerable', color: 'rose' };
}

/**
 * Calculate the 5-pillar Finlytix Health Score for a user.
 */
async function calculateFinancialHealth(userId) {
  // 1. Fetch transactions with categories from the trailing 6 months
  const txQuery = `
    SELECT
      t.id,
      t.date,
      t.amount::numeric,
      t.type,
      t.description,
      COALESCE(c.name, NULLIF(t.ai_suggested_category, ''), 'Other') as category_name,
      TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') as month_key
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = $1
      AND t.date >= (
        SELECT COALESCE(MAX(date) - INTERVAL '6 months', '1970-01-01'::date)
        FROM transactions
        WHERE user_id = $1
      )
    ORDER BY t.date ASC
  `;

  const { rows: transactions } = await pool.query(txQuery, [userId]);

  if (!transactions || transactions.length === 0) {
    return {
      hasData: false,
      overallScore: 50,
      tier: 'Moderate',
      color: 'amber',
      trend: null,
      message: 'Upload your bank statement to unlock your comprehensive Finlytix Health Score.',
      summary: {
        totalIncome: 0,
        totalExpenses: 0,
        netSavings: 0,
        monthsAnalyzed: 0,
      },
      pillars: {
        savingsRate: { score: 50, weight: 30, displayValue: '0%', benchmark: 'Target > 20%' },
        discretionaryDiscipline: {
          score: 50,
          weight: 25,
          displayValue: '0%',
          benchmark: 'Target < 30%',
        },
        emergencyRunway: {
          score: 50,
          weight: 20,
          displayValue: '0 mos',
          benchmark: 'Target 3-6 mos',
        },
        debtBurden: { score: 100, weight: 15, displayValue: '0%', benchmark: 'Target < 15%' },
        spendingStability: {
          score: 50,
          weight: 10,
          displayValue: 'N/A',
          benchmark: 'Stable monthly',
        },
      },
      actionableWins: [
        {
          title: 'Import your first bank statement',
          impact: '+25 FinScore',
          description:
            'Upload an e-statement PDF to calculate your personalized financial metrics.',
        },
      ],
    };
  }

  // Group by month and classification
  const monthlyData = {};
  let totalIncome = 0;
  let totalNeeds = 0;
  let totalWants = 0;
  let totalDebt = 0;
  let totalInvestments = 0;

  for (const tx of transactions) {
    const month = tx.month_key;
    if (!monthlyData[month]) {
      monthlyData[month] = {
        income: 0,
        needs: 0,
        wants: 0,
        debt: 0,
        investments: 0,
        expenseTotal: 0,
      };
    }

    const amt = Math.abs(parseFloat(tx.amount) || 0);

    if (tx.type === 'credit') {
      totalIncome += amt;
      monthlyData[month].income += amt;
    } else {
      const desc = safeDecrypt(tx.description);
      const bucket = classifyCategory(tx.category_name, desc);
      if (bucket === 'investments') {
        totalInvestments += amt;
        monthlyData[month].investments += amt;
      } else if (bucket === 'debt') {
        totalDebt += amt;
        monthlyData[month].debt += amt;
        monthlyData[month].expenseTotal += amt;
      } else if (bucket === 'needs') {
        totalNeeds += amt;
        monthlyData[month].needs += amt;
        monthlyData[month].expenseTotal += amt;
      } else {
        totalWants += amt;
        monthlyData[month].wants += amt;
        monthlyData[month].expenseTotal += amt;
      }
    }
  }

  const months = Object.keys(monthlyData).sort();
  const numMonths = Math.max(1, months.length);

  // Pure expense outflows exclude investments (investments are asset-building)
  const totalPureExpenses = totalNeeds + totalWants + totalDebt;
  const netSavings = totalIncome - totalPureExpenses;
  const savingsRate = totalIncome > 0 ? netSavings / totalIncome : netSavings > 0 ? 0.3 : -0.2;

  // 1. Savings Score
  const savingsScore = scoreSavingsRate(savingsRate);

  // 2. Discretionary (Wants) Score
  const wantsRatio = totalPureExpenses > 0 ? totalWants / totalPureExpenses : 0;
  const discretionaryScore = scoreDiscretionary(wantsRatio);

  // 3. Emergency Runway Score
  const avgMonthlyEssential = (totalNeeds + totalDebt) / numMonths;
  const cumulativeSurplus = Math.max(0, netSavings);
  const runwayMonths =
    avgMonthlyEssential > 0
      ? cumulativeSurplus / avgMonthlyEssential
      : totalPureExpenses === 0
        ? 6.0
        : 1.0;
  const runwayScore = scoreRunway(runwayMonths);

  // 4. Debt-to-Income Score
  const dtiRatio = totalIncome > 0 ? totalDebt / totalIncome : totalDebt > 0 ? 0.5 : 0;
  const debtScore = scoreDebt(dtiRatio);

  // 5. Stability Score
  const monthlyExpensesList = months.map((m) => monthlyData[m].expenseTotal);
  let cv = 0;
  if (monthlyExpensesList.length >= 2) {
    const mean = monthlyExpensesList.reduce((a, b) => a + b, 0) / monthlyExpensesList.length;
    if (mean > 0) {
      const variance =
        monthlyExpensesList.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
        monthlyExpensesList.length;
      const stdDev = Math.sqrt(variance);
      cv = stdDev / mean;
    }
  }
  const stabilityScore = scoreStability(cv, monthlyExpensesList.length);

  // Overall Weighted Score (0 - 100)
  const rawScore =
    savingsScore * 0.3 +
    discretionaryScore * 0.25 +
    runwayScore * 0.2 +
    debtScore * 0.15 +
    stabilityScore * 0.1;
  const overallScore = Math.min(100, Math.max(0, Math.round(rawScore)));
  const { tier, label, color } = getRatingTier(overallScore);

  // Month-over-month trend
  let trend = null;
  if (months.length >= 2) {
    const prevMonth = months[months.length - 2];
    const currMonth = months[months.length - 1];
    const prevData = monthlyData[prevMonth];
    const currData = monthlyData[currMonth];

    const prevSavRate =
      prevData.income > 0 ? (prevData.income - prevData.expenseTotal) / prevData.income : 0;
    const currSavRate =
      currData.income > 0 ? (currData.income - currData.expenseTotal) / currData.income : 0;
    const prevScore = Math.round(
      scoreSavingsRate(prevSavRate) * 0.4 +
        scoreDiscretionary(prevData.expenseTotal > 0 ? prevData.wants / prevData.expenseTotal : 0) *
          0.3 +
        scoreDebt(prevData.income > 0 ? prevData.debt / prevData.income : 0) * 0.3,
    );
    const currScore = Math.round(
      scoreSavingsRate(currSavRate) * 0.4 +
        scoreDiscretionary(currData.expenseTotal > 0 ? currData.wants / currData.expenseTotal : 0) *
          0.3 +
        scoreDebt(currData.income > 0 ? currData.debt / currData.income : 0) * 0.3,
    );
    const diff = currScore - prevScore;
    trend =
      diff > 0
        ? `+${diff} pts vs prior month`
        : diff < 0
          ? `${diff} pts vs prior month`
          : 'Steady vs prior month';
  }

  // Generate High-Value Actionable Wins
  const actionableWins = [];

  if (discretionaryScore < 85 && totalWants > 0) {
    const excessWants = Math.round(Math.max(2000, totalWants * 0.15));
    actionableWins.push({
      title: `Optimize Discretionary Spending by ₹${excessWants.toLocaleString('en-IN')}`,
      impact: '+5 to +8 FinScore',
      description: `Wants represent ${(wantsRatio * 100).toFixed(1)}% of your expenses (ideal is under 30%). Trimming takeout, entertainment, or impulse shopping will directly bolster your score.`,
    });
  }

  if (runwayScore < 80) {
    actionableWins.push({
      title: 'Strengthen Emergency Cushion',
      impact: '+6 to +10 FinScore',
      description: `Your liquid buffer covers approximately ${runwayMonths.toFixed(1)} months of essential outflows. Expanding reserves toward 3–6 months creates financial resilience.`,
    });
  }

  if (savingsScore < 75 && totalIncome > 0) {
    const targetSavingsBoost = Math.round(totalIncome * 0.05);
    actionableWins.push({
      title: `Increase Monthly Savings by ₹${targetSavingsBoost.toLocaleString('en-IN')}`,
      impact: '+7 FinScore',
      description: `Your savings rate is currently ${(savingsRate * 100).toFixed(1)}%. Allocating an extra 5% into a liquid FD or recurring deposit elevates your savings pillar above the 20% benchmark.`,
    });
  }

  if (debtScore < 75) {
    actionableWins.push({
      title: 'Prioritize Debt Paydown',
      impact: '+8 FinScore',
      description: `Debt obligations take up ${(dtiRatio * 100).toFixed(1)}% of your inflow. Lowering high-interest card or personal loans reduces your debt burden pillar.`,
    });
  }

  if (actionableWins.length === 0) {
    actionableWins.push({
      title: 'Maintain Current Disciplined Flow',
      impact: 'Maintain 85+ FinScore',
      description:
        'Your savings rate, low debt ratio, and emergency buffer are in the optimal bracket. Keep recurring investments on autopilot.',
    });
  }

  return {
    hasData: true,
    overallScore,
    tier,
    label,
    color,
    trend,
    summary: {
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalPureExpenses),
      totalInvestments: Math.round(totalInvestments),
      netSavings: Math.round(netSavings),
      monthsAnalyzed: numMonths,
    },
    pillars: {
      savingsRate: {
        name: 'Savings Rate',
        score: savingsScore,
        weight: 30,
        displayValue: `${(savingsRate * 100).toFixed(1)}%`,
        status: savingsScore >= 80 ? 'good' : savingsScore >= 60 ? 'fair' : 'warning',
        benchmark: 'Target ≥ 20%',
        description: 'Proportion of net earnings retained rather than spent.',
      },
      discretionaryDiscipline: {
        name: 'Discretionary Discipline',
        score: discretionaryScore,
        weight: 25,
        displayValue: `${(wantsRatio * 100).toFixed(1)}% wants`,
        status: discretionaryScore >= 80 ? 'good' : discretionaryScore >= 60 ? 'fair' : 'warning',
        benchmark: 'Target ≤ 30%',
        description: 'Control over non-essential lifestyle and entertainment spending.',
      },
      emergencyRunway: {
        name: 'Emergency Runway',
        score: runwayScore,
        weight: 20,
        displayValue: `${runwayMonths.toFixed(1)} mos`,
        status: runwayScore >= 80 ? 'good' : runwayScore >= 50 ? 'fair' : 'warning',
        benchmark: 'Target 3–6 mos',
        description: 'Months of essential fixed expenses covered by available reserves.',
      },
      debtBurden: {
        name: 'Debt & Commitments',
        score: debtScore,
        weight: 15,
        displayValue: `${(dtiRatio * 100).toFixed(1)}% DTI`,
        status: debtScore >= 80 ? 'good' : debtScore >= 60 ? 'fair' : 'warning',
        benchmark: 'Target ≤ 15%',
        description: 'Fixed debt service and EMI load relative to monthly income.',
      },
      spendingStability: {
        name: 'Spending Stability',
        score: stabilityScore,
        weight: 10,
        displayValue:
          numMonths >= 2
            ? cv <= 0.2
              ? 'High'
              : cv <= 0.4
                ? 'Moderate'
                : 'Volatile'
            : 'Establishing',
        status: stabilityScore >= 75 ? 'good' : 'fair',
        benchmark: 'Consistent MoM',
        description: 'Month-over-month predictability and expense consistency.',
      },
    },
    actionableWins: actionableWins.slice(0, 3),
  };
}

module.exports = {
  calculateFinancialHealth,
  classifyCategory,
  scoreSavingsRate,
  scoreDiscretionary,
  scoreRunway,
  scoreDebt,
  scoreStability,
};
