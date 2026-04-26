const express = require('express');
const { getProvidersStatus } = require('../services/ai');

const router = express.Router();

router.get('/providers', (req, res) => {
  res.json(getProvidersStatus());
});

module.exports = router;
