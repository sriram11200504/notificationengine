'use strict';

require('dotenv').config();
const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Dead-Letter Queue (DLQ)
 *
 * Jobs are moved here by the worker after all retry attempts are exhausted.
 * DLQ jobs are retained indefinitely so you can inspect, re-enqueue, or alert on them.
 * The Bull Board dashboard shows this queue separately.
 */
const dlq = new Queue('notifications-dlq', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    // Keep DLQ jobs forever — don't auto-remove
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1, // DLQ jobs are not retried automatically
  },
  skipVersionCheck: true, // Fix for Redis < 5.0.0
});

/**
 * Move a failed job to the DLQ with its error context attached.
 * @param {import('bullmq').Job} job - The failed BullMQ job
 * @param {Error} error - The final error that caused failure
 */
async function moveToDLQ(job, error) {
  try {
    await dlq.add(
      `dlq:${job.name}`,
      {
        originalJobId: job.id,
        originalQueue: job.queueName,
        payload: job.data,
        failedReason: error?.message || 'Unknown error',
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      },
      { priority: 1 } // All DLQ entries have equal priority
    );
    logger.warn('[DLQ] Job moved to dead-letter queue', {
      jobId: job.id,
      reason: error?.message,
    });
  } catch (dlqErr) {
    logger.error('[DLQ] Failed to move job to DLQ', { dlqErr: dlqErr.message });
  }
}

module.exports = { dlq, moveToDLQ };
