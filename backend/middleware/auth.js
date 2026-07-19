const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];

    // Tokens issued before token versioning are version zero and remain valid
    // until the user's first password reset or change.
    if (!user || Number(decoded.tokenVersion || 0) !== Number(user.token_version)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('Error validating token session:', err);
    return res.status(500).json({ error: 'Failed to validate session' });
  }
};

module.exports = authMiddleware;
