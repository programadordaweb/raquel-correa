// Vercel serverless entry point — exports the same Express app used by
// server.js locally. vercel.json routes every /api/* request here.
module.exports = require('../app');
