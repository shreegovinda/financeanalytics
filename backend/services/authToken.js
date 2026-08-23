const jwt = require('jsonwebtoken');

function issueAuthToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tokenVersion: Number(user.token_version || 0),
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

module.exports = { issueAuthToken };
