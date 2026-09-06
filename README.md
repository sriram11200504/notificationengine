# 🛡️ SurgeShield — Async Notification Engine

A production-grade, highly resilient **Asynchronous Email Notification Processing Engine** built in Node.js.

Designed to handle unpredictable traffic spikes, downstream service outages, and high-concurrency event registration workloads.

---

## ✨ Features

- ⚡ **Non-blocking Async Processing**: HTTP API returns `202 Accepted` immediately; background workers process jobs asynchronously.
- 🎯 **Priority Queue Scheduling**: Supports `high` (1), `medium` (5), and `low` (10) priorities. Critical notifications process first.
- 🔁 **Exponential Backoff Retries**: Transient failures automatically trigger 3 attempts with exponential delay (`2s`, `4s`, `8s`).
- 🚦 **Rate Limiting**: Sliding-window rate limiting prevents downstream email provider throttling.
- ☠️ **Dead-Letter Queue (DLQ)**: Permanently failed jobs are isolated in DLQ with failure history and manual single-click retry capabilities.
- 💾 **State Persistence**: Queued job states persist across process restarts (`data/jobs.json`).
- 📊 **Real-time Web Dashboard**: Built-in interactive Web UI at `/admin/queues` with live metrics, tabbed status views, quick-test forms, and auto-refresh.
- 📧 **Nodemailer Integration**: Supports Gmail SMTP (App Passwords) and zero-config Ethereal test inbox mode.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/sriram11200504/notificationengine.git
cd notificationengine
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

For real Gmail inbox delivery, add your Gmail App Password to `.env`:
```env
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_16_digit_app_password
```

### 3. Run Development Server
```bash
npm run dev
```

Visit the Dashboard at **`http://localhost:3000/admin/queues`**

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/notify` | Enqueue a new email notification |
| `GET` | `/api/notify/:jobId` | Fetch job status & progress |
| `GET` | `/api/health` | Health check & queue metrics |
| `POST` | `/api/dlq/:jobId/retry` | Re-enqueue a failed DLQ job |
| `GET` | `/admin/queues` | 📊 Interactive Web Dashboard |

### Sample Enqueue Payload
```json
POST /api/notify
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Event Confirmation",
  "text": "Your seat is confirmed!",
  "priority": "high"
}
```

---

## 🏗️ Architecture

```
HTTP API (Express)
      │
      ▼
NotificationService (Validation & Enqueue)
      │
      ▼
AsyncQueueEngine (Priority Queue & Persistence)
  ├── High Priority Queue
  ├── Medium Priority Queue
  └── Low Priority Queue
      │
      ▼
Worker Pool (Concurrency + Rate Limiter + Backoff)
  ├── Retry Mechanism (3 attempts)
  └── Dead-Letter Queue (DLQ on failure)
      │
      ▼
Email Provider (Nodemailer / Gmail SMTP)
```

---

## 📄 License
MIT License
