'use strict';

require('dotenv').config();
const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

/**
 * Priority levels — lower number = higher BullMQ priority.
 * BullMQ processes jobs with lower priority values first.
 */
const PRIORITY = {
  high: 1,
  medium: 5,
  low: 10,
};

/**
 * Default job options applied to every notification job.
 * - attempts: total tries (first attempt + retries)
 * - backoff: exponential delay between retries
 * - removeOnComplete: keep last 100 completed jobs for the dashboard
 * - removeOnFail: keep all failed jobs (they move to DLQ separately)
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

const notificationQueue = new Queue('notifications', {
  connection: createRedisConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
  limiter: {
    // Rate limit: max N jobs per duration across all workers
    max: parseInt(process.env.RATE_MAX || '50', 10),
    duration: parseInt(process.env.RATE_DURATION_MS || '60000', 10),
  },
  skipVersionCheck: true, // Fix for Redis < 5.0.0
});

module.exports = { notificationQueue, PRIORITY, DEFAULT_JOB_OPTIONS };
