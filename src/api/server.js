'use strict';

require('dotenv').config();
const express = require('express');
const routes = require('./routes');
const engine = require('../queues/asyncEngine');
const logger = require('../utils/logger');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Web Dashboard UI at /admin/queues ──────────────────────────────────────────
app.get('/admin/queues', (_req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SurgeShield Notification Engine Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --high: #ef4444;
      --medium: #f59e0b;
      --low: #10b981;
      --completed: #22c55e;
      --failed: #f43f5e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 2rem; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .header h1 { font-size: 1.8rem; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .badge { padding: 0.3rem 0.8rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; background: #334155; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; text-align: center; }
    .card h3 { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; }
    .card .val { font-size: 2rem; font-weight: 700; color: var(--accent); }
    
    .panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
    .panel h2 { font-size: 1.2rem; margin-bottom: 1rem; color: var(--text); }
    
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
    th { padding: 0.8rem; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 600; }
    td { padding: 0.8rem; border-bottom: 1px solid var(--border); }
    tr:hover { background: rgba(255,255,255,0.02); }
    
    .status-waiting { color: #f59e0b; font-weight: 600; }
    .status-active { color: #38bdf8; font-weight: 600; }
    .status-completed { color: #22c55e; font-weight: 600; }
    .status-dlq { color: #ef4444; font-weight: 600; }
    
    .p-high { background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .p-medium { background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .p-low { background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    
    .btn { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 0.85rem; }
    .btn:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    
    form { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .full { grid-column: 1 / -1; }
    input, select, textarea { background: #0f172a; border: 1px solid var(--border); color: white; padding: 0.7rem; border-radius: 6px; width: 100%; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ SurgeShield Notification Dashboard</h1>
    <div><span class="badge">Live Refresh: 2s</span></div>
  </div>

  <div class="grid">
    <div class="card"><h3>Waiting</h3><div class="val" id="c-waiting">0</div></div>
    <div class="card"><h3>Active</h3><div class="val" id="c-active">0</div></div>
    <div class="card"><h3>Completed</h3><div class="val" id="c-completed" style="color:var(--completed)">0</div></div>
    <div class="card"><h3>Delayed</h3><div class="val" id="c-delayed" style="color:var(--medium)">0</div></div>
    <div class="card"><h3>Dead Letter (DLQ)</h3><div class="val" id="c-dlq" style="color:var(--failed)">0</div></div>
  </div>

  <div class="panel">
    <h2>⚡ Quick Test: Send Notification</h2>
    <form id="sendForm">
      <div>
        <label style="font-size:0.8rem;color:#94a3b8">Recipient Email (Enter your real inbox!)</label>
        <input type="email" id="to" placeholder="sriramlohith5232@gmail.com" required value="sriramlohith5232@gmail.com">
      </div>
      <div>
        <label style="font-size:0.8rem;color:#94a3b8">Priority</label>
        <select id="priority">
          <option value="high">🔥 High Priority</option>
          <option value="medium" selected>⚡ Medium Priority</option>
          <option value="low">🌱 Low Priority</option>
        </select>
      </div>
      <div class="full">
        <label style="font-size:0.8rem;color:#94a3b8">Subject</label>
        <input type="text" id="subject" placeholder="Event Reminder" required value="Event Registration Confirmation">
      </div>
      <div class="full">
        <label style="font-size:0.8rem;color:#94a3b8">Body Content</label>
        <input type="text" id="text" placeholder="Notification body content" required value="Your seat for SurgeShield Conference is confirmed!">
      </div>
      <div class="full">
        <button type="submit" class="btn">Enqueue Notification Job</button>
      </div>
    </form>
  </div>

  <div class="panel">
    <h2>📋 Job Stream & Monitoring</h2>
    <table>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Priority</th>
          <th>Recipient</th>
          <th>Subject</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="jobTable">
        <tr><td colspan="7" style="text-align:center;color:#94a3b8">Loading jobs...</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        
        document.getElementById('c-waiting').innerText = data.counts.waiting || 0;
        document.getElementById('c-active').innerText = data.counts.active || 0;
        document.getElementById('c-completed').innerText = data.counts.completed || 0;
        document.getElementById('c-delayed').innerText = data.counts.delayed || 0;
        document.getElementById('c-dlq').innerText = data.counts.dlq || 0;

        const tbody = document.getElementById('jobTable');
        if (!data.jobs || data.jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8">No jobs in queue yet.</td></tr>';
          return;
        }

        tbody.innerHTML = data.jobs.map(j => \`
          <tr>
            <td>#\${j.id}</td>
            <td><span class="p-\${j.priority}">\${j.priority.toUpperCase()}</span></td>
            <td>\${j.data.to}</td>
            <td>\${j.data.subject}</td>
            <td><span class="status-\${j.state}">\${j.state.toUpperCase()}</span></td>
            <td>\${j.attemptsMade} / \${j.maxAttempts}</td>
            <td>
              \${j.state === 'dlq' ? \`<button class="btn btn-danger" onclick="retryDlq('\${j.id}')">Retry DLQ</button>\` : '-'}
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error(err);
      }
    }

    document.getElementById('sendForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        to: document.getElementById('to').value,
        priority: document.getElementById('priority').value,
        subject: document.getElementById('subject').value,
        text: document.getElementById('text').value,
      };
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      loadData();
    });

    async function retryDlq(id) {
      await fetch(\`/api/dlq/\${id}/retry\`, { method: 'POST' });
      loadData();
    }

    loadData();
    setInterval(loadData, 2000);
  </script>
</body>
</html>
  `;
  res.send(html);
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({
    service: 'SurgeShield Async Notification Engine',
    version: '1.0.0',
    endpoints: {
      enqueue: 'POST /api/notify',
      jobStatus: 'GET /api/notify/:jobId',
      health: 'GET /api/health',
      dashboard: 'GET /admin/queues',
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  logger.error('[Server] Unhandled error', { err: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
