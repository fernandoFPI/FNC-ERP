import { gql } from '@apollo/client'

export const PAYROLL_RUNS_QUERY = gql`
  query PayrollRuns($status: String) {
    payrollRuns(status: $status) {
      id
      period_name
      start_date
      end_date
      status
      total_gross
      total_net
      total_deductions
      created_at
    }
  }
`

export const PAYROLL_RUN_QUERY = gql`
  query PayrollRun($id: ID!) {
    payrollRun(id: $id) {
      id
      period_name
      start_date
      end_date
      status
      total_gross
      total_net
      total_deductions
      created_at
    }
  }
`

export const PAYSLIP_QUERY = gql`
  query Payslip($id: ID!) {
    payslip(id: $id) {
      id
      payroll_run_id
      employee_id
      employee_name
      employee_number
      base_salary
      housing_allowance
      transport_allowance
      other_allowances
      overtime_hours
      overtime_pay
      gross_salary
      income_tax
      social_security
      other_deductions
      net_salary
      currency_code
      working_days
      absent_days
      leave_days
    }
  }
`

export const PAYROLL_LINE_QUERY = PAYSLIP_QUERY

export const PAYSLIPS_QUERY = gql`
  query Payslips($payroll_run_id: ID, $employee_id: ID) {
    payslips(payroll_run_id: $payroll_run_id, employee_id: $employee_id) {
      id
      payroll_run_id
      employee_id
      employee_name
      employee_number
      base_salary
      housing_allowance
      transport_allowance
      other_allowances
      overtime_hours
      overtime_pay
      gross_salary
      income_tax
      social_security
      other_deductions
      net_salary
      currency_code
      working_days
      absent_days
      leave_days
    }
  }
`

export const EMPLOYEE_SALARY_CONFIG_QUERY = gql`
  query EmployeeSalaryConfig($employee_id: ID!) {
    employeeSalaryConfig(employee_id: $employee_id) {
      id
      employee_id
      base_salary
      currency_code
      housing_allowance
      transport_allowance
      other_allowances
      income_tax_pct
      social_security_pct
      effective_from
      effective_to
    }
  }
`

export const MY_PAYSLIPS_QUERY = gql`
  query MyPayslips {
    myPayslips {
      id
      payroll_run_id
      employee_id
      employee_name
      employee_number
      gross_salary
      net_salary
      income_tax
      social_security
      currency_code
      working_days
      absent_days
      leave_days
      overtime_hours
    }
  }
`

export const CREATE_PAYROLL_RUN = gql`
  mutation CreatePayrollRun($input: PayrollRunInput!) {
    createPayrollRun(input: $input) {
      id
      period_name
      status
    }
  }
`

export const PROCESS_PAYROLL_RUN = gql`
  mutation ProcessPayrollRun($id: ID!) {
    processPayrollRun(id: $id) {
      id
      status
    }
  }
`

export const APPROVE_PAYROLL_RUN = gql`
  mutation ApprovePayrollRun($id: ID!) {
    approvePayrollRun(id: $id) {
      id
      status
    }
  }
`

export const POST_PAYROLL_RUN = gql`
  mutation PostPayrollRun($id: ID!) {
    postPayrollRun(id: $id) {
      id
      status
    }
  }
`

export const CANCEL_PAYROLL_RUN = gql`
  mutation CancelPayrollRun($id: ID!) {
    cancelPayrollRun(id: $id) {
      id
      status
    }
  }
`
