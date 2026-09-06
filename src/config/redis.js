'use strict';

require('dotenv').config();
const { Redis } = require('ioredis');
const logger = require('../utils/logger');

/**
 * Creates a Redis connection for BullMQ.
 * BullMQ requires separate connection instances for Queue, Worker, and QueueEvents,
 * so we export a factory function instead of a singleton.
 */
function createRedisConnection() {
  const conn = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
  });

  conn.on('connect', () => logger.info('[Redis] Connected'));
  conn.on('error', (err) => logger.error('[Redis] Connection error', { err: err.message }));

  return conn;
}

module.exports = { createRedisConnection };
