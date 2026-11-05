// Shared OTP attempt limiter.
//
// The counters live in this module so every route that verifies an OTP draws
// down the same budget. Keeping a per-route Map would let an attacker reset
// their allowance simply by switching endpoints.
//
// State is process-local: deployments running several API instances need a
// shared store (e.g. Redis) for this to bind globally.
const otpAttempts = new Map();
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;

function getOtpRateLimitKey(req, email, purpose) {
  return `${purpose}:${email.toLowerCase()}:${req.ip}`;
}

function checkOtpRateLimit(req, email, purpose) {
  const key = getOtpRateLimitKey(req, email, purpose);
  const now = Date.now();
  const current = otpAttempts.get(key);

  if (!current || current.resetAt <= now) {
    otpAttempts.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
    return true;
  }

  current.count += 1;
  if (current.count > OTP_MAX_ATTEMPTS) {
    return false;
  }

  otpAttempts.set(key, current);
  return true;
}

function clearOtpRateLimit(req, email, purpose) {
  otpAttempts.delete(getOtpRateLimitKey(req, email, purpose));
}

module.exports = {
  checkOtpRateLimit,
  clearOtpRateLimit,
  OTP_MAX_ATTEMPTS,
  OTP_WINDOW_MS,
};
