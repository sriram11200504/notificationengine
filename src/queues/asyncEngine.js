'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getTransporter } = require('../config/email');

const DATA_DIR = path.join(__dirname, '../../data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

const PRIORITY_MAP = {
  high: 1,
  medium: 5,
  low: 10,
};

class AsyncQueueEngine extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // id -> job
    this.activeJobs = new Set();
    this.concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
    this.rateMax = parseInt(process.env.RATE_MAX || '50', 10);
    this.rateWindowMs = parseInt(process.env.RATE_DURATION_MS || '60000', 10);
    this.processedTimestamps = []; // for rate limiting
    this.isProcessing = false;
    this.jobCounter = Date.now();

    this.ensureDataDir();
    this.loadJobs();
    this.startWorkerLoop();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  saveJobs() {
    try {
      const data = Array.from(this.jobs.values());
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error('[Engine] Failed to persist jobs', { error: err.message });
    }
  }

  loadJobs() {
    if (fs.existsSync(JOBS_FILE)) {
      try {
        const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
        const list = JSON.parse(raw);
        for (const job of list) {
          // Re-queue active jobs on restart
          if (job.state === 'active') job.state = 'waiting';
          this.jobs.set(job.id, job);
        }
        logger.info(`[Engine] Loaded ${this.jobs.size} jobs from storage`);
      } catch (err) {
        logger.warn('[Engine] Could not load persisted jobs', { error: err.message });
      }
    }
  }

  async addJob(name, data, options = {}) {
    const priorityStr = options.priority || 'medium';
    const numericPriority = PRIORITY_MAP[priorityStr] || 5;

    const job = {
      id: String(++this.jobCounter),
      name,
      data,
      priority: priorityStr,
      numericPriority,
      state: 'waiting', // waiting | active | completed | failed | dlq
      attemptsMade: 0,
      maxAttempts: options.attempts || 3,
      progress: 0,
      failedReason: null,
      returnvalue: null,
      createdAt: new Date().toISOString(),
      processedOn: null,
      finishedOn: null,
      nextAttemptAt: null,
    };

    this.jobs.set(job.id, job);
    this.saveJobs();
    logger.info('[Engine] Job added', { jobId: job.id, priority: priorityStr, to: data.to });

    setImmediate(() => this.processNext());
    return job;
  }

  getJob(id) {
    return this.jobs.get(String(id));
  }

  getCounts() {
    const counts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, dlq: 0 };
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.state === 'waiting') {
        if (job.nextAttemptAt && new Date(job.nextAttemptAt).getTime() > now) {
          counts.delayed++;
        } else {
          counts.waiting++;
        }
      } else if (job.state === 'active') {
        counts.active++;
      } else if (job.state === 'completed') {
        counts.completed++;
      } else if (job.state === 'failed') {
        counts.failed++;
      } else if (job.state === 'dlq') {
        counts.dlq++;
      }
    }
    return counts;
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  checkRateLimit() {
    const now = Date.now();
    this.processedTimestamps = this.processedTimestamps.filter(t => now - t < this.rateWindowMs);
    return this.processedTimestamps.length < this.rateMax;
  }

  recordProcessed() {
    this.processedTimestamps.push(Date.now());
  }

  getNextJobToProcess() {
    const now = Date.now();
    const waitingJobs = [];

    for (const job of this.jobs.values()) {
      if (job.state === 'waiting') {
        if (job.nextAttemptAt && new Date(job.nextAttemptAt).getTime() > now) {
          continue; // Delayed job waiting for backoff
        }
        waitingJobs.push(job);
      }
    }

    if (waitingJobs.length === 0) return null;

    // Sort by priority (1=high, 5=medium, 10=low), then by creation time
    waitingJobs.sort((a, b) => {
      if (a.numericPriority !== b.numericPriority) {
        return a.numericPriority - b.numericPriority;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    return waitingJobs[0];
  }

  async processNext() {
    if (this.activeJobs.size >= this.concurrency) return;
    if (!this.checkRateLimit()) return;

    const job = this.getNextJobToProcess();
    if (!job) return;

    this.activeJobs.add(job.id);
    job.state = 'active';
    job.attemptsMade++;
    job.processedOn = new Date().toISOString();
    job.progress = 10;
    this.saveJobs();

    this.recordProcessed();

    logger.info('[Worker] Processing job', { jobId: job.id, attempt: job.attemptsMade, to: job.data.to });

    // Execute job asynchronously
    setImmediate(async () => {
      try {
        job.progress = 40;
        const transporter = await getTransporter();

        const mailOptions = {
          from: job.data.from || process.env.SMTP_FROM || '"Notification Engine" <no-reply@example.com>',
          to: job.data.to,
          subject: job.data.subject,
          ...(job.data.html ? { html: job.data.html } : {}),
          ...(job.data.text ? { text: job.data.text } : { text: job.data.subject }),
        };

        const info = await transporter.sendMail(mailOptions);
        job.progress = 100;
        job.state = 'completed';
        job.finishedOn = new Date().toISOString();
        job.returnvalue = { messageId: info.messageId, sentAt: job.finishedOn };

        logger.info('[Worker] Job completed', { jobId: job.id, messageId: info.messageId });
        this.emit('completed', job);
      } catch (err) {
        logger.error('[Worker] Job attempt failed', { jobId: job.id, attempt: job.attemptsMade, error: err.message });
        job.failedReason = err.message;

        if (job.attemptsMade < job.maxAttempts) {
          // Retry with exponential backoff (2s, 4s, 8s)
          const delayMs = Math.pow(2, job.attemptsMade) * 1000;
          job.state = 'waiting';
          job.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
          logger.info('[Worker] Job scheduled for retry', { jobId: job.id, delayMs, nextAttemptAt: job.nextAttemptAt });
        } else {
          // Move to Dead-Letter Queue
          job.state = 'dlq';
          job.finishedOn = new Date().toISOString();
          logger.warn('[DLQ] Job moved to dead-letter queue after max attempts', { jobId: job.id, reason: err.message });
          this.emit('dlq', job);
        }
      } finally {
        this.activeJobs.delete(job.id);
        this.saveJobs();
        // Continue processing remaining jobs
        setImmediate(() => this.processNext());
      }
    });
  }

  async retryDlqJob(id) {
    const job = this.getJob(id);
    if (!job || job.state !== 'dlq') {
      throw new Error(`Job ${id} is not in Dead-Letter Queue`);
    }
    job.state = 'waiting';
    job.attemptsMade = 0;
    job.failedReason = null;
    job.nextAttemptAt = null;
    this.saveJobs();
    logger.info('[DLQ] Job re-enqueued from DLQ', { jobId: id });
    setImmediate(() => this.processNext());
    return job;
  }

  clearQueue(stateFilter = null) {
    if (!stateFilter) {
      this.jobs.clear();
    } else {
      for (const [id, job] of this.jobs.entries()) {
        if (job.state === stateFilter) this.jobs.delete(id);
      }
    }
    this.saveJobs();
  }

  startWorkerLoop() {
    // Heartbeat worker check every 1 second
    setInterval(() => {
      this.processNext();
    }, 1000);
  }
}

const engine = new AsyncQueueEngine();
module.exports = engine;
