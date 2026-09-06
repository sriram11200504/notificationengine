'use strict';

require('dotenv').config();
const app = require('./api/server');
const logger = require('./utils/logger');
require('./queues/asyncEngine');

let PORT = parseInt(process.env.PORT || '3000', 10);

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    logger.info(`[Server] SurgeShield Async Notification Engine running`, {
      port: portToTry,
      api: `http://localhost:${portToTry}/api`,
      health: `http://localhost:${portToTry}/api/health`,
      dashboard: `http://localhost:${portToTry}/admin/queues`,
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`[Server] Port ${portToTry} is in use. Trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      logger.error('[Server] Server error', { error: err.message });
    }
  });

  process.on('SIGTERM', () => {
    logger.info('[Server] SIGTERM received — shutting down server...');
    server.close(() => {
      logger.info('[Server] HTTP server closed');
      process.exit(0);
    });
  });
}

startServer(PORT);
