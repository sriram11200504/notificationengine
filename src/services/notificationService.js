'use strict';

const engine = require('../queues/asyncEngine');
const logger = require('../utils/logger');

/**
 * Validates and enqueues an email notification job into the Async Engine.
 */
async function send(payload) {
  const { to, subject, html, text, from, priority = 'medium' } = payload;

  if (!to || typeof to !== 'string') {
    throw new Error('NotificationService: "to" (recipient email) is required');
  }
  if (!subject || typeof subject !== 'string') {
    throw new Error('NotificationService: "subject" is required');
  }
  if (!html && !text) {
    throw new Error('NotificationService: at least one of "html" or "text" body is required');
  }
  if (!['high', 'medium', 'low'].includes(priority)) {
    throw new Error(`NotificationService: invalid priority "${priority}". Use high | medium | low`);
  }

  const job = await engine.addJob('send-email', { to, subject, html, text, from }, { priority });

  logger.info('[NotificationService] Job enqueued', {
    jobId: job.id,
    to,
    subject,
    priority,
  });

  return job;
}

const sendHigh = (payload) => send({ ...payload, priority: 'high' });
const sendMedium = (payload) => send({ ...payload, priority: 'medium' });
const sendLow = (payload) => send({ ...payload, priority: 'low' });

module.exports = { send, sendHigh, sendMedium, sendLow };
