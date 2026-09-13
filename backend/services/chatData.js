const guide = require('./productGuide');
const { safeDecrypt } = require('./crypto');
const tools = new Set([
  'finance',
  'statements',
  'profile',
  'categories',
  'bills',
  'payments',
  'product',
]);
const groups = {
  month: "to_char(t.date,'YYYY-MM')",
  category: "COALESCE(c.name,'Uncategorized')",
  bank: 's.bank_name',
  merchant: "COALESCE(t.description,'Unknown')",
};
function validateRequest(input) {
  if (!input || !tools.has(input.tool)) throw new Error('Unsupported data request');
  const args = input.args || {};
  const allowed = new Set([
    'startDate',
    'endDate',
    'bank',
    'search',
    'category',
    'type',
    'groupBy',
    'sort',
    'offset',
  ]);
  if (
    typeof args !== 'object' ||
    Array.isArray(args) ||
    Object.keys(args).some((k) => !allowed.has(k))
  )
    throw new Error('Invalid query filters');
  for (const key of ['startDate', 'endDate']) {
    if (
      args[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(args[key]) ||
        new Date(args[key] + 'T00:00:00Z').toISOString().slice(0, 10) !== args[key])
    )
      throw new Error('Invalid date filter');
  }
  if (args.startDate && args.endDate && args.startDate > args.endDate)
    throw new Error('Invalid date range');
  for (const key of ['bank', 'search', 'category'])
    if (args[key] !== undefined && (typeof args[key] !== 'string' || args[key].length > 120))
      throw new Error('Invalid search filter');
  if (args.type && !['debit', 'credit'].includes(args.type))
    throw new Error('Invalid transaction type');
  if (args.groupBy && !Object.hasOwn(groups, args.groupBy)) throw new Error('Invalid grouping');
  if (args.sort && !['newest', 'oldest', 'largest'].includes(args.sort))
    throw new Error('Invalid ordering');
  if (
    args.offset !== undefined &&
    (!Number.isInteger(args.offset) || args.offset < 0 || args.offset > 100000)
  )
    throw new Error('Invalid page');
  return { tool: input.tool, args };
}
const literal = (value) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
async function runTool(client, userId, input) {
  const { tool, args } = validateRequest(input);
  const query = async (sql, params = [userId]) => (await client.query(sql, params)).rows;
  if (tool === 'product') return { tool, data: guide };
  if (tool === 'profile')
    return {
      tool,
      data: (
        await query(
          "SELECT name,email,phone,email_verified,to_char(created_at,'YYYY-MM-DD') AS joined FROM users WHERE id=$1",
        )
      ).map((u) => ({
        ...u,
        name: safeDecrypt(u.name),
        phone: safeDecrypt(u.phone),
      })),
    };
  if (tool === 'categories')
    return {
      tool,
      data: await query(
        'SELECT id,name,parent_id FROM categories WHERE user_id=$1 ORDER BY name LIMIT 200',
      ),
      limit: 200,
    };
  if (tool === 'statements')
    return {
      tool,
      data: await query(`SELECT s.id,s.bank_name,to_char(s.statement_month,'YYYY-MM') AS month,s.file_name,s.file_format,s.status,s.processing_stage,s.processing_error,
    count(*) OVER() AS total_records FROM statements s WHERE s.user_id=$1 ORDER BY s.statement_month DESC NULLS LAST,s.id LIMIT 200`),
      banks: await query(
        'SELECT b.bank_code,COALESCE(c.name,b.bank_code) AS name,b.active FROM user_bank_accounts b LEFT JOIN bank_catalogue c ON c.id=b.catalogue_id WHERE b.user_id=$1 ORDER BY name',
      ),
      limit: 200,
    };
  if (tool === 'bills')
    return {
      tool,
      data: (
        await query(`SELECT b.id,b.transaction_id,t.statement_id,b.file_name,b.merchant_name,b.bill_total,to_char(b.bill_date,'YYYY-MM-DD') AS date,b.status,
    (SELECT json_agg(json_build_object('description',l.description,'quantity',l.quantity,'amount',l.amount)) FROM transaction_line_items l WHERE l.transaction_bill_id=b.id) AS items,
    count(*) OVER() AS total_records FROM transaction_bills b JOIN transactions t ON t.id=b.transaction_id AND t.user_id=b.user_id
    WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 50`)
      ).map((b) => ({
        ...b,
        file_name: safeDecrypt(b.file_name),
        merchant_name: safeDecrypt(b.merchant_name),
        items: (b.items || []).map((item) => ({
          ...item,
          description: safeDecrypt(item.description),
        })),
      })),
      limit: 50,
    };
  if (tool === 'payments')
    return {
      tool,
      data: await query(
        "SELECT amount,currency,description,feature,status,to_char(created_at,'YYYY-MM-DD') AS date,count(*) OVER() AS total_records FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      ),
      limit: 50,
    };
  const values = [userId],
    where = ['t.user_id=$1'];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', '$' + values.length));
  };
  if (args.startDate) add('t.date >= ?::date', args.startDate);
  if (args.endDate) add('t.date <= ?::date', args.endDate);
  if (args.type) add('t.type = ?', args.type);
  if (args.bank) add('COALESCE(bc.name,s.bank_name) ILIKE ?', literal(args.bank));
  if (args.search) add('t.description ILIKE ?', literal(args.search));
  if (args.category) add("COALESCE(c.name,'Uncategorized') ILIKE ?", literal(args.category));
  const from = `FROM transactions t JOIN statements s ON s.id=t.statement_id AND s.user_id=t.user_id
    LEFT JOIN user_bank_accounts b ON b.id=s.bank_account_id AND b.user_id=t.user_id
    LEFT JOIN bank_catalogue bc ON bc.id=b.catalogue_id
    LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id WHERE ${where.join(' AND ')}`;
  const sums =
    "COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount ELSE 0 END),0) AS income, COALESCE(SUM(CASE WHEN t.type='debit' THEN ABS(t.amount) ELSE 0 END),0) AS expenses";
  let summary = (
    await query(
      `SELECT count(*) AS transaction_count,${sums}, COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -ABS(t.amount) END),0) AS net_cash_flow,to_char(min(t.date),'YYYY-MM-DD') AS first_date,to_char(max(t.date),'YYYY-MM-DD') AS last_date ${from}`,
      values,
    )
  )[0];
  let grouped = await query(
    `SELECT ${groups[args.groupBy || 'month']} AS label,count(*) AS count,${sums} ${from} GROUP BY 1 ORDER BY ${!args.groupBy || args.groupBy === 'month' ? '1 DESC' : 'expenses DESC,1'} LIMIT 100`,
    values,
  );
  const order =
    args.sort === 'largest'
      ? 'ABS(t.amount) DESC,t.id'
      : args.sort === 'oldest'
        ? 't.date ASC,t.id'
        : 't.date DESC,t.id';
  let rows = (
    await query(
      `SELECT t.id,t.statement_id,to_char(t.date,'YYYY-MM-DD') AS date,t.description,t.amount,t.type,COALESCE(c.name,'Uncategorized') AS category,COALESCE(bc.name,s.bank_name) AS bank ${from} ORDER BY ${order} LIMIT 50 OFFSET ${args.offset || 0}`,
      values,
    )
  ).map((r) => ({
    ...r,
    description: safeDecrypt(r.description),
  }));

  // When searching with live DB and rows are empty due to encryption, search decrypted records in memory
  if (args.search && rows.length === 0 && client.release) {
    const searchLower = args.search.toLowerCase();
    const candidateWhere = ['t.user_id=$1'];
    const candidateValues = [userId];
    const addCandidate = (sql, value) => {
      candidateValues.push(value);
      candidateWhere.push(sql.replace('?', '$' + candidateValues.length));
    };
    if (args.startDate) addCandidate('t.date >= ?::date', args.startDate);
    if (args.endDate) addCandidate('t.date <= ?::date', args.endDate);
    if (args.type) addCandidate('t.type = ?', args.type);
    if (args.bank) addCandidate('COALESCE(bc.name,s.bank_name) ILIKE ?', literal(args.bank));
    if (args.category)
      addCandidate("COALESCE(c.name,'Uncategorized') ILIKE ?", literal(args.category));

    const candidateFrom = `FROM transactions t JOIN statements s ON s.id=t.statement_id AND s.user_id=t.user_id
      LEFT JOIN user_bank_accounts b ON b.id=s.bank_account_id AND b.user_id=t.user_id
      LEFT JOIN bank_catalogue bc ON bc.id=b.catalogue_id
      LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id WHERE ${candidateWhere.join(' AND ')}`;

    const candidateRows = await query(
      `SELECT t.id,t.statement_id,to_char(t.date,'YYYY-MM-DD') AS date,t.description,t.amount,t.type,COALESCE(c.name,'Uncategorized') AS category,COALESCE(bc.name,s.bank_name) AS bank ${candidateFrom} ORDER BY ${order} LIMIT 500`,
      candidateValues,
    );

    const decryptedMatches = candidateRows
      .map((r) => ({ ...r, description: safeDecrypt(r.description) }))
      .filter((r) => r.description && r.description.toLowerCase().includes(searchLower));

    if (decryptedMatches.length > 0) {
      rows = decryptedMatches.slice(args.offset || 0, (args.offset || 0) + 50);
      const inc = decryptedMatches.reduce(
        (acc, t) => acc + (t.type === 'credit' ? Number(t.amount) : 0),
        0,
      );
      const exp = decryptedMatches.reduce(
        (acc, t) => acc + (t.type === 'debit' ? Math.abs(Number(t.amount)) : 0),
        0,
      );
      summary = {
        transaction_count: String(decryptedMatches.length),
        income: inc,
        expenses: exp,
        net_cash_flow: inc - exp,
        first_date: decryptedMatches[0]?.date || null,
        last_date: decryptedMatches[decryptedMatches.length - 1]?.date || null,
      };
    }
  }

  return {
    tool,
    filters: args,
    summary,
    grouped,
    data: rows,
    limit: 50,
    groupLimit: 100,
    notice:
      'Summary covers all matching confirmed transactions; detail rows and groups are limited. Net cash flow is not account balance. Statements may be missing.',
  };
}
async function collectData(pool, userId, requests) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='5000ms'");
    const result = [];
    for (const request of requests) result.push(await runTool(client, userId, request));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { validateRequest, runTool, collectData };
