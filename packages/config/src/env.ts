import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Auto-load .env in non-production environments.
// Load order (first-wins, later files fill gaps):
//   1. <cwd>/.env        — service-local overrides (e.g. services/gateway/.env)
//   2. <monorepo-root>/.env — shared defaults
// Production systems should inject vars via the OS/container environment.
if (process.env['NODE_ENV'] !== 'production') {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  // Load service-local .env first (override: true so it wins over root)
  loadDotenv({ path: resolve(process.cwd(), '.env'), override: true })
  // Then fill in any missing vars from the monorepo root .env
  // packages/config/src → packages/config → packages → root
  loadDotenv({ path: resolve(__dirname, '../../../.env'), override: false })
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection URL'),
  DATABASE_TEST_URL: z
    .string()
    .url('DATABASE_TEST_URL must be a valid PostgreSQL connection URL')
    .optional(),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  GATEWAY_PORT: z.coerce.number().default(3000),
  AUTH_SERVICE_PORT: z.coerce.number().default(3001),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  FINANCE_SERVICE_PORT: z.coerce.number().default(3002),
  FINANCE_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  PROCUREMENT_SERVICE_PORT: z.coerce.number().default(3003),
  PROCUREMENT_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  INVENTORY_SERVICE_PORT: z.coerce.number().default(3005),
  INVENTORY_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  INTERCO_SERVICE_PORT: z.coerce.number().default(3008),
  INTERCO_SERVICE_URL: z.string().url().default('http://localhost:3008'),
  HR_SERVICE_PORT: z.coerce.number().default(3004),
  HR_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  PROJECTS_SERVICE_PORT: z.coerce.number().default(3006),
  PROJECTS_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  MANUFACTURING_SERVICE_PORT: z.coerce.number().default(3007),
  MANUFACTURING_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  NOTIFICATIONS_SERVICE_PORT: z.coerce.number().default(3009),
  NOTIFICATIONS_SERVICE_URL: z.string().url().default('http://localhost:3009'),
  RENTAL_SERVICE_PORT: z.coerce.number().default(3010),
  RENTAL_SERVICE_URL: z.string().url().default('http://localhost:3010'),
  REPORTING_SERVICE_PORT: z.coerce.number().default(3011),
  REPORTING_SERVICE_URL: z.string().url().default('http://localhost:3011'),
  SERVICE_TOKEN: z.string().min(32).default('service-token-change-in-prod-min32chars-padding'),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256)'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  SERVICE_NAME: z.string().default('unknown'),
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_GLOBAL: z.coerce.number().default(200),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().default(10),
  RATE_LIMIT_MAX_PER_USER: z.coerce.number().default(300),
  // Session management
  MAX_SESSIONS_PER_USER: z.coerce.number().default(5),
  // Postgres pool size — overridden per-service in ecosystem.config.cjs when
  // running multiple PM2 cluster instances of the same service, so the
  // aggregate connection count stays within Postgres's max_connections.
  DB_POOL_MAX: z.coerce.number().default(20),
  // Frontend URL for password reset links
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Backblaze B2 storage
  B2_ENDPOINT: z.string().url().default('https://s3.us-west-004.backblazeb2.com'),
  B2_REGION: z.string().default('us-west-004'),
  B2_KEY_ID: z.string().default(''),
  B2_APPLICATION_KEY: z.string().default(''),
  B2_BUCKET_NAME: z.string().default('fnc-erp-dev'),
  B2_BUCKET_PUBLIC_URL: z.string().url().optional(),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(52428800),
  PRESIGNED_URL_TTL_SECONDS: z.coerce.number().default(900),
  // PDF generation
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PDF_STORAGE_FOLDER: z.string().default('generated-pdfs'),
  // FX rate sync API keys (both optional — at least one recommended in production)
  EXCHANGE_RATE_API_KEY: z.string().optional(),
  OPEN_EXCHANGE_RATES_APP_ID: z.string().optional(),
  // Email (Microsoft Graph API — app-only client-credentials auth)
  MSGRAPH_TENANT_ID: z.string().default(''),
  MSGRAPH_CLIENT_ID: z.string().default(''),
  MSGRAPH_CLIENT_SECRET: z.string().default(''),
  MSGRAPH_SENDER_ADDRESS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('FNC ERP'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@fnc-group.com'),
  EMAIL_REPLY_TO: z.string().optional(),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Environment validation failed:\n${issues}\n\nCheck your .env file.`)
  }
  return result.data
}

export const env = parseEnv()

export type Env = z.infer<typeof envSchema>
