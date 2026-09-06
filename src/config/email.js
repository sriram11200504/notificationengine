'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let _transporter = null;

/**
 * Returns a lazily-initialized Nodemailer transporter.
 * Supports 3 modes:
 * 1. Gmail SMTP (free, delivers to ANY real email inbox)
 * 2. Custom SMTP (Brevo / SendGrid / Resend)
 * 3. Ethereal Test Account (fallback for local dev without credentials)
 */
async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    // 📩 Mode 1: Gmail SMTP using Nodemailer (Free real email delivery)
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS, // App Password generated from Google Account
      },
    });
    logger.info('[Email] Using Gmail SMTP (Real inbox delivery enabled)', { user: process.env.GMAIL_USER });
  } else if (process.env.SMTP_HOST) {
    // 📩 Mode 2: Custom SMTP Server
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    logger.info('[Email] Using custom SMTP server', { host: process.env.SMTP_HOST });
  } else {
    // 📩 Mode 3: Auto Ethereal Test Account (Virtual preview links for dev)
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    logger.info('[Email] Using Ethereal test account (dev mode)', {
      user: testAccount.user,
      previewURL: 'https://ethereal.email',
    });
  }

  return _transporter;
}

module.exports = { getTransporter };
