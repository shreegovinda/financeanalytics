const jwt = require('jsonwebtoken');

function issueAuthToken(user) {
  const secret = process.env.JWT_SECRET || 'financeanalytics-test-secret-key-32chars';
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tokenVersion: Number(user.token_version || 0),
    },
    secret,
    { expiresIn: '7d' },
  );
}

module.exports = { issueAuthToken };
