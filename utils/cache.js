const NodeCache = require('node-cache');

// Create cache instance with TTL of 5 minutes for OTP
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60 // Check for expired keys every 60 seconds
});

module.exports = cache;