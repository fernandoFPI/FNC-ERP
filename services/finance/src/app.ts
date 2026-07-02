import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { accountsRouter } from './routes/accounts.js'
import { costCentersRouter } from './routes/costcenters.js'
import { analyticRouter } from './routes/analytic.js'
import { fxRatesRouter } from './routes/fxrates.js'
import { fxAdminRouter } from './routes/fx-admin.js'
import { journalsRouter } from './routes/journals.js'
import { reportsRouter } from './routes/reports.js'
import { periodsRouter } from './routes/periods.js'
import { vendorInvoicesRouter } from './routes/vendor-invoices.js'
import { arRouter } from './routes/ar.js'
import { journalAttachmentsRouter } from './routes/journal-attachments.js'
import { paymentVouchersRouter } from './routes/payment-vouchers.js'
import { assetsRouter } from './routes/assets.js'
import { bankRouter } from './routes/bank.js'
import { paymentTermsRouter } from './routes/payment-terms.js'
import { retentionRouter } from './routes/retention.js'
import { budgetRouter } from './routes/budget.js'
import { revaluationRouter } from './routes/revaluation.js'

export function createApp(): import('express').Express {
  const app = express()
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'finance', timestamp: new Date().toISOString() })
  })

  app.use(requireAuth())

  app.use('/finance/accounts', accountsRouter)
  app.use('/finance/cost-centers', costCentersRouter)
  app.use('/finance/analytic-accounts', analyticRouter)
  app.use('/finance/fx-rates', fxRatesRouter)
  app.use('/finance/fx-rates', fxAdminRouter)
  app.use('/finance/journals', journalsRouter)
  app.use('/finance/reports', reportsRouter)
  app.use('/finance/periods', periodsRouter)
  app.use('/finance/vendor-invoices', vendorInvoicesRouter)
  app.use('/finance/ar', arRouter)
  app.use('/finance/journals', journalAttachmentsRouter)
  app.use('/finance/payment-vouchers', paymentVouchersRouter)
  app.use('/finance/assets', assetsRouter)
  app.use('/finance/bank', bankRouter)
  app.use('/finance/payment-terms', paymentTermsRouter)
  app.use('/finance/retention', retentionRouter)
  app.use('/finance/budget', budgetRouter)
  app.use('/finance/revaluation', revaluationRouter)

  return app
}
