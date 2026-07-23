import express from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { locationsRouter } from './routes/locations.js'
import { departmentsRouter } from './routes/departments.js'
import { employeesRouter } from './routes/employees.js'
import { attendanceRouter } from './routes/attendance.js'
import { leaveRouter } from './routes/leave.js'
import { salaryRouter } from './routes/salary.js'
import { payrollRouter } from './routes/payroll.js'
import { employeeAttachmentsRouter } from './routes/employee-attachments.js'

export function createApp(): import('express').Express {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('etag')
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hr', timestamp: new Date().toISOString() })
  })

  app.use(requireAuth())

  app.use('/hr/locations', locationsRouter)
  app.use('/hr/departments', departmentsRouter)
  app.use('/hr/employees', employeesRouter)
  app.use('/hr/attendance', attendanceRouter)
  app.use('/hr/leave', leaveRouter)
  app.use('/hr/salary', salaryRouter)
  app.use('/hr/payroll', payrollRouter)
  app.use('/hr/employees', employeeAttachmentsRouter)

  return app
}
