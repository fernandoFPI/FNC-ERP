// PM2 ecosystem config — manages all FNC ERP services in production.
// Usage: pm2 start ecosystem.config.cjs --env production
// Log rotation: pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M

'use strict'

const fs = require('fs')
const path = require('path')

const LOG_DIR = '/var/log/fnc-erp'
const BASE = '/opt/fnc-erp'

// packages/config/src/env.ts stops auto-loading .env once NODE_ENV=production,
// so PM2 has to hand every process its environment explicitly. Parsed once here
// and spread into each app's env_production below. No dotenv dependency needed —
// this file has no package.json of its own for pnpm to resolve one against.
function loadEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const sharedEnv = loadEnvFile(path.join(BASE, '.env'))

function makeApp(name, script, port, extraEnv = {}) {
  return {
    name,
    script,
    exec_mode: 'fork',
    instances: 1,
    env_production: {
      ...sharedEnv,
      NODE_ENV: 'production',
      SERVICE_NAME: name,
      PORT: port,
      ...extraEnv,
    },
    out_file: `${LOG_DIR}/${name}-out.log`,
    error_file: `${LOG_DIR}/${name}-error.log`,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    health_check_url: `http://localhost:${port}/health`,
    health_check_interval: 30000,
    health_check_grace_period: 5000,
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '5s',
  }
}

module.exports = {
  apps: [
    makeApp('gateway',       `${BASE}/services/gateway/dist/index.js`,       3000),
    makeApp('auth',          `${BASE}/services/auth/dist/index.js`,           3001),
    makeApp('finance',       `${BASE}/services/finance/dist/index.js`,        3002),
    makeApp('procurement',   `${BASE}/services/procurement/dist/index.js`,    3003),
    makeApp('hr',            `${BASE}/services/hr/dist/index.js`,             3004),
    makeApp('inventory',     `${BASE}/services/inventory/dist/index.js`,      3005),
    makeApp('projects',      `${BASE}/services/projects/dist/index.js`,       3006),
    makeApp('manufacturing', `${BASE}/services/manufacturing/dist/index.js`,  3007),
    makeApp('interco',       `${BASE}/services/interco/dist/index.js`,        3008),
    makeApp('notifications', `${BASE}/services/notifications/dist/index.js`,  3009),
    makeApp('rental',        `${BASE}/services/rental/dist/index.js`,         3010),
    makeApp('reporting',     `${BASE}/services/reporting/dist/index.js`,      3011),
    {
      name: 'worker',
      script: `${BASE}/services/worker/dist/index.js`,
      exec_mode: 'fork',
      instances: 1,
      env_production: {
        ...sharedEnv,
        NODE_ENV: 'production',
        SERVICE_NAME: 'worker',
      },
      out_file: `${LOG_DIR}/worker-out.log`,
      error_file: `${LOG_DIR}/worker-error.log`,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
}
