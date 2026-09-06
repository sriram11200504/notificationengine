'use strict';

const { Router } = require('express');
const notificationService = require('../services/notificationService');
const engine = require('../queues/asyncEngine');
const logger = require('../utils/logger');

const router = Router();

// ── POST /notify ──────────────────────────────────────────────────────────────
router.post('/notify', async (req, res) => {
  try {
    const job = await notificationService.send(req.body);
    return res.status(202).json({
      success: true,
      message: 'Notification enqueued successfully',
      jobId: job.id,
      priority: job.priority,
      status: job.state,
    });
  } catch (err) {
    logger.warn('[API] Bad request to POST /notify', { reason: err.message });
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  const counts = engine.getCounts();
  return res.json({
    status: 'ok',
    system: 'SurgeShield Async Notification Engine',
    timestamp: new Date().toISOString(),
    queue: counts,
    concurrency: engine.concurrency,
  });
});

// ── GET /notify/:jobId ────────────────────────────────────────────────────────
router.get('/notify/:jobId', (req, res) => {
  const job = engine.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  return res.json({
    jobId: job.id,
    state: job.state,
    priority: job.priority,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.maxAttempts,
    data: job.data,
    progress: job.progress,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    createdAt: job.createdAt,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    nextAttemptAt: job.nextAttemptAt,
  });
});

// ── POST /dlq/:jobId/retry ───────────────────────────────────────────────────
router.post('/dlq/:jobId/retry', async (req, res) => {
  try {
    const job = await engine.retryDlqJob(req.params.jobId);
    return res.json({
      success: true,
      message: `Job ${job.id} re-enqueued from Dead-Letter Queue`,
      job,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /jobs ──────────────────────────────────────────────────────────────────
router.get('/jobs', (_req, res) => {
  return res.json({
    counts: engine.getCounts(),
    jobs: engine.getAllJobs(),
  });
});

module.exports = router;
