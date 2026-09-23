/**
 * Activity & Audit Log Service
 * Tracks user account operations, security events, preference shifts, and statements.
 * Enforces strict privacy: passwords, hashes, and auth tokens are NEVER stored.
 */

// Keys that must NEVER be persisted in activity log details
const SENSITIVE_KEY_PATTERN = /(password|hash|token|secret|credential|auth_token)/i;

/**
 * Sanitizes metadata to guarantee non-sensitive storage.
 */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }
  const clean = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeDetails(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Record a user activity or audit event.
 * Fail-safe: will not throw if logging fails, so primary business flows remain uninterrupted.
 */
async function logActivity(
  pool,
  { userId, action, category = 'security', description, details = {}, ip = null },
) {
  if (!userId || !action || !description) return null;
  try {
    const cleanDetails = sanitizeDetails(details);
    const result = await pool.query(
      `INSERT INTO activity_logs (user_id, action, category, description, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, action, category, description, details, ip_address, created_at`,
      [userId, action, category, description, JSON.stringify(cleanDetails), ip || null],
    );
    return result.rows[0];
  } catch (err) {
    console.error('Failed to log activity event:', err.message);
    return null;
  }
}

/**
 * Retrieve paginated activity logs for a user with optional filters.
 */
async function getActivityLogs(pool, userId, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 15));
  const offset = (page - 1) * limit;

  const conditions = ['user_id = $1'];
  const values = [userId];

  if (options.category && options.category !== 'all') {
    values.push(options.category);
    conditions.push(`category = $${values.length}`);
  }

  if (options.action && options.action !== 'all') {
    values.push(options.action);
    conditions.push(`action = $${values.length}`);
  }

  if (options.startDate && /^\d{4}-\d{2}-\d{2}$/.test(options.startDate)) {
    values.push(options.startDate);
    conditions.push(`created_at >= $${values.length}::date`);
  }

  if (options.endDate && /^\d{4}-\d{2}-\d{2}$/.test(options.endDate)) {
    values.push(options.endDate);
    conditions.push(`created_at < ($${values.length}::date + interval '1 day')`);
  }

  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    values.push(`%${options.search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`(description ILIKE $${values.length} OR action ILIKE $${values.length})`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT count(*) AS total FROM activity_logs WHERE ${whereClause}`,
    values,
  );
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const queryValues = [...values, limit, offset];
  const dataResult = await pool.query(
    `SELECT id, action, category, description, details, ip_address, created_at
     FROM activity_logs
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
    queryValues,
  );

  return {
    logs: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/**
 * Retrieve summary metrics and recent history for the AI assistant and summary cards.
 */
async function getActivitySummary(pool, userId) {
  const client = pool;

  // Password changes history and count
  const passwordLogs = await client.query(
    `SELECT action, created_at, details
     FROM activity_logs
     WHERE user_id = $1 AND action IN ('PASSWORD_CHANGE', 'PASSWORD_RESET')
     ORDER BY created_at DESC`,
    [userId],
  );

  // Email changes
  const emailLogs = await client.query(
    `SELECT action, created_at, details
     FROM activity_logs
     WHERE user_id = $1 AND action = 'EMAIL_CHANGE'
     ORDER BY created_at DESC`,
    [userId],
  );

  // Phone changes
  const phoneLogs = await client.query(
    `SELECT action, created_at, details
     FROM activity_logs
     WHERE user_id = $1 AND action = 'PHONE_CHANGE'
     ORDER BY created_at DESC`,
    [userId],
  );

  // Preferences changes
  const preferencesLogs = await client.query(
    `SELECT action, created_at, details
     FROM activity_logs
     WHERE user_id = $1 AND action = 'PREFERENCES_UPDATE'
     ORDER BY created_at DESC`,
    [userId],
  );

  // Recent 50 logs
  const recentLogs = await client.query(
    `SELECT id, action, category, description, details, created_at
     FROM activity_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );

  // Total count
  const totalResult = await client.query(
    `SELECT count(*) AS total FROM activity_logs WHERE user_id = $1`,
    [userId],
  );

  return {
    total_logs: parseInt(totalResult.rows[0]?.total || '0', 10),
    password_changes_count: passwordLogs.rows.length,
    last_password_change: passwordLogs.rows[0]?.created_at || null,
    password_change_timestamps: passwordLogs.rows.map((r) => r.created_at),
    password_changes: passwordLogs.rows.map((r) => ({
      action: r.action,
      created_at: r.created_at,
      method: r.details?.method || 'settings',
    })),
    email_changes_count: emailLogs.rows.length,
    last_email_change: emailLogs.rows[0]?.created_at || null,
    email_changes: emailLogs.rows.map((r) => ({
      created_at: r.created_at,
      details: r.details,
    })),
    phone_changes_count: phoneLogs.rows.length,
    last_phone_change: phoneLogs.rows[0]?.created_at || null,
    phone_changes: phoneLogs.rows.map((r) => ({
      created_at: r.created_at,
      details: r.details,
    })),
    preferences_changes_count: preferencesLogs.rows.length,
    last_preferences_change: preferencesLogs.rows[0]?.created_at || null,
    preferences_changes: preferencesLogs.rows.map((r) => ({
      created_at: r.created_at,
      details: r.details,
    })),
    recent_logs: recentLogs.rows,
  };
}

module.exports = {
  logActivity,
  getActivityLogs,
  getActivitySummary,
  sanitizeDetails,
};
