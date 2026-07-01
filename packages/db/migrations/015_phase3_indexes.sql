-- Phase 3 performance indexes

-- HR
CREATE INDEX idx_employees_company ON employees(company_id) WHERE status != 'terminated';
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_attendance_employee_date ON attendance_logs(employee_id, punched_at DESC);
CREATE INDEX idx_attendance_company_date ON attendance_logs(company_id, punched_at DESC);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id, status);
CREATE INDEX idx_leave_requests_company ON leave_requests(company_id, status, start_date);
CREATE INDEX idx_employee_shifts_employee ON employee_shifts(employee_id, effective_from DESC);

-- Payroll
CREATE INDEX idx_payroll_runs_company ON payroll_runs(company_id, status);
CREATE INDEX idx_payslips_run ON payslips(payroll_run_id);
CREATE INDEX idx_payslips_employee ON payslips(employee_id, created_at DESC);
CREATE INDEX idx_overtime_logs_employee ON overtime_logs(employee_id, work_date DESC);
CREATE INDEX idx_salary_configs_employee ON salary_configs(employee_id, effective_from DESC);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_company ON notifications(company_id, created_at DESC);
