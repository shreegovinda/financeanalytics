const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/db');
const {
  logActivity,
  getActivityLogs,
  getActivitySummary,
  sanitizeDetails,
} = require('../services/activityLogService');

test('sanitizeDetails purges passwords, hashes, tokens and secrets', () => {
  const dirty = {
    method: 'settings',
    password: 'SuperSecretPassword123!',
    new_password: 'AnotherSecretPassword456!',
    password_hash: '$2a$10$abcdef...',
    token: 'jwt.token.here',
    auth_token: 'bearer.token',
    client_secret: 'secret-1234',
    nested: {
      safeField: 'hello',
      nestedPassword: 'forbidden',
    },
    safeDetails: 'non-sensitive-value',
  };

  const clean = sanitizeDetails(dirty);
  assert.equal(clean.method, 'settings');
  assert.equal(clean.safeDetails, 'non-sensitive-value');
  assert.equal(clean.nested.safeField, 'hello');
  assert.equal(clean.password, undefined);
  assert.equal(clean.new_password, undefined);
  assert.equal(clean.password_hash, undefined);
  assert.equal(clean.token, undefined);
  assert.equal(clean.auth_token, undefined);
  assert.equal(clean.client_secret, undefined);
  assert.equal(clean.nested.nestedPassword, undefined);
});

test('logActivity and getActivityLogs full lifecycle with pagination and isolation', async () => {
  // Create 2 test users
  const u1Res = await pool.query(
    "INSERT INTO users (email, name) VALUES ('activity-test-1-' || gen_random_uuid() || '@example.invalid', 'Activity Tester 1') RETURNING id",
  );
  const u2Res = await pool.query(
    "INSERT INTO users (email, name) VALUES ('activity-test-2-' || gen_random_uuid() || '@example.invalid', 'Activity Tester 2') RETURNING id",
  );
  const user1 = u1Res.rows[0].id;
  const user2 = u2Res.rows[0].id;

  try {
    // Log events for user 1
    await logActivity(pool, {
      userId: user1,
      action: 'PASSWORD_CHANGE',
      category: 'security',
      description: 'Password changed from settings',
      details: { method: 'settings' },
    });

    await logActivity(pool, {
      userId: user1,
      action: 'EMAIL_CHANGE',
      category: 'profile',
      description: 'Email changed to test@example.com',
      details: { old_email: 'old@example.com', new_email: 'test@example.com' },
    });

    await logActivity(pool, {
      userId: user1,
      action: 'PREFERENCES_UPDATE',
      category: 'preferences',
      description: 'Updated timezone to Asia/Kolkata',
      details: { timezone: 'Asia/Kolkata', currency: 'INR' },
    });

    // Log event for user 2 (isolation check)
    await logActivity(pool, {
      userId: user2,
      action: 'PASSWORD_CHANGE',
      category: 'security',
      description: 'User 2 password changed',
    });

    // 1. Check user 1 total logs
    const page1 = await getActivityLogs(pool, user1, { page: 1, limit: 2 });
    assert.equal(page1.pagination.total, 3);
    assert.equal(page1.pagination.totalPages, 2);
    assert.equal(page1.logs.length, 2);
    // None of user 2's logs should appear
    assert.ok(!page1.logs.some((l) => l.description.includes('User 2')));

    // 2. Check page 2
    const page2 = await getActivityLogs(pool, user1, { page: 2, limit: 2 });
    assert.equal(page2.logs.length, 1);

    // 3. Check category filter
    const securityOnly = await getActivityLogs(pool, user1, { category: 'security' });
    assert.equal(securityOnly.logs.length, 1);
    assert.equal(securityOnly.logs[0].action, 'PASSWORD_CHANGE');

    const profileOnly = await getActivityLogs(pool, user1, { category: 'profile' });
    assert.equal(profileOnly.logs.length, 1);
    assert.equal(profileOnly.logs[0].action, 'EMAIL_CHANGE');

    // 4. Check summary
    const summary = await getActivitySummary(pool, user1);
    assert.equal(summary.total_logs, 3);
    assert.equal(summary.password_changes_count, 1);
    assert.ok(summary.last_password_change);
    assert.equal(summary.password_change_timestamps.length, 1);
    assert.equal(summary.email_changes_count, 1);
    assert.equal(summary.preferences_changes_count, 1);
    assert.equal(summary.recent_logs.length, 3);
  } finally {
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [user1, user2]);
  }
});
