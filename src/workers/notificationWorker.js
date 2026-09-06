'use strict';

require('dotenv').config();
const { Worker, QueueEvents } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { getTransporter } = require('../config/email');
const { moveToDLQ } = require('../queues/dlq');
const logger = require('../utils/logger');

/**
 * Core job processor — called by BullMQ for each dequeued email job.
 * Throws on failure so BullMQ can trigger the retry/backoff mechanism.
 *
 * @param {import('bullmq').Job} job
 */
async function processEmailJob(job) {
  const { to, subject, html, text, from } = job.data;

  logger.info('[Worker] Processing email job', {
    jobId: job.id,
    attempt: job.attemptsMade + 1,
    to,
    subject,
  });

  // Update job progress so the dashboard can display it
  await job.updateProgress(10);

  const transporter = await getTransporter();

  await job.updateProgress(40);

  const mailOptions = {
    from: from || process.env.SMTP_FROM || '"Notification Engine" <no-reply@example.com>',
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : { text: subject }), // fallback plain text
  };

  const info = await transporter.sendMail(mailOptions);

  await job.updateProgress(100);

  logger.info('[Worker] Email sent successfully', {
    jobId: job.id,
    to,
    messageId: info.messageId,
    // Ethereal preview URL (only available with test accounts)
    previewUrl: require('nodemailer').getTestMessageUrl(info) || undefined,
  });

  return { messageId: info.messageId, sentAt: new Date().toISOString() };
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker('notifications', processEmailJob, {
  connection: createRedisConnection(),
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  limiter: {
    max: parseInt(process.env.RATE_MAX || '50', 10),
    duration: parseInt(process.env.RATE_DURATION_MS || '60000', 10),
  },
  skipVersionCheck: true, // Fix for Redis < 5.0.0
});

// ── Event listeners ───────────────────────────────────────────────────────────

worker.on('completed', (job, result) => {
  logger.info('[Worker] Job completed', { jobId: job.id, result });
});

worker.on('failed', async (job, err) => {
  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3);

  logger.error('[Worker] Job failed', {
    jobId: job.id,
    attempt: job.attemptsMade,
    isLastAttempt,
    reason: err.message,
  });

  // On final failure → move to Dead-Letter Queue
  if (isLastAttempt) {
    await moveToDLQ(job, err);
  }
});

worker.on('stalled', (jobId) => {
  logger.warn('[Worker] Job stalled (worker crashed mid-process)', { jobId });
});

worker.on('error', (err) => {
  logger.error('[Worker] Worker error', { err: err.message });
});

// ── QueueEvents (for detailed telemetry) ─────────────────────────────────────

const queueEvents = new QueueEvents('notifications', {
  connection: createRedisConnection(),
  skipVersionCheck: true, // Fix for Redis < 5.0.0
});

queueEvents.on('waiting', ({ jobId }) =>
  logger.debug('[Queue] Job waiting', { jobId })
);
queueEvents.on('active', ({ jobId, prev }) =>
  logger.debug('[Queue] Job active', { jobId, prev })
);
queueEvents.on('delayed', ({ jobId, delay }) =>
  logger.debug('[Queue] Job delayed (retry backoff)', { jobId, delay })
);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function gracefulShutdown(signal) {
  logger.info(`[Worker] ${signal} received — closing worker gracefully...`);
  await worker.close();
  await queueEvents.close();
  logger.info('[Worker] Worker closed. Bye!');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { worker };
