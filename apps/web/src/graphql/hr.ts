import { gql } from '@apollo/client'

export const EMPLOYEES_QUERY = gql`
  query Employees($department_id: ID, $is_active: Boolean) {
    employees(department_id: $department_id, is_active: $is_active) {
      id employee_number first_name last_name email
      department_id department_name job_title employment_type status hire_date
    }
  }
`

export const EMPLOYEE_QUERY = gql`
  query Employee($id: ID!) {
    employee(id: $id) {
      id employee_number first_name last_name email phone national_id
      passport_number nationality date_of_birth gender
      job_title department_id department_name work_location_id manager_id
      employment_type hire_date termination_date status is_active user_id linked_user_email photo_url
    }
  }
`

export const CREATE_EMPLOYEE = gql`
  mutation CreateEmployee($input: EmployeeInput!) {
    createEmployee(input: $input) { id employee_number first_name last_name status }
  }
`

export const UPDATE_EMPLOYEE = gql`
  mutation UpdateEmployee($id: ID!, $input: EmployeeInput!) {
    updateEmployee(id: $id, input: $input) { id employee_number first_name last_name status }
  }
`

export const LINK_EMPLOYEE_USER = gql`
  mutation LinkEmployeeUser($employee_id: ID!, $user_id: ID) {
    linkEmployeeUser(employee_id: $employee_id, user_id: $user_id) {
      id user_id
    }
  }
`

export const TERMINATE_EMPLOYEE = gql`
  mutation TerminateEmployee($id: ID!, $terminationDate: String!, $reason: String!) {
    terminateEmployee(id: $id, terminationDate: $terminationDate, reason: $reason) {
      id status termination_date
    }
  }
`

export const DEPARTMENTS_QUERY = gql`
  query Departments {
    departments {
      id name parent_id manager_id is_active
    }
  }
`

export const CREATE_DEPARTMENT = gql`
  mutation CreateDepartment($input: DepartmentInput!) {
    createDepartment(input: $input) { id name is_active }
  }
`

export const UPDATE_DEPARTMENT = gql`
  mutation UpdateDepartment($id: ID!, $input: DepartmentInput!) {
    updateDepartment(id: $id, input: $input) { id name is_active }
  }
`

export const WORK_LOCATIONS_QUERY = gql`
  query WorkLocations($is_active: Boolean) {
    workLocations(is_active: $is_active) {
      id name address latitude longitude geofence_radius_m is_active
    }
  }
`

export const CREATE_WORK_LOCATION = gql`
  mutation CreateWorkLocation($input: WorkLocationInput!) {
    createWorkLocation(input: $input) { id name is_active }
  }
`

export const UPDATE_WORK_LOCATION = gql`
  mutation UpdateWorkLocation($id: ID!, $input: WorkLocationInput!) {
    updateWorkLocation(id: $id, input: $input) { id name is_active }
  }
`

export const SHIFT_CONFIGS_QUERY = gql`
  query ShiftConfigs {
    shiftConfigs {
      id name start_time end_time break_minutes overtime_threshold_hours is_active
    }
  }
`

export const CREATE_SHIFT_CONFIG = gql`
  mutation CreateShiftConfig($input: ShiftConfigInput!) {
    createShiftConfig(input: $input) { id name }
  }
`

export const UPDATE_SHIFT_CONFIG = gql`
  mutation UpdateShiftConfig($id: ID!, $input: ShiftConfigInput!) {
    updateShiftConfig(id: $id, input: $input) { id name }
  }
`

export const EMPLOYEE_CURRENT_SHIFT_QUERY = gql`
  query EmployeeCurrentShift($employee_id: ID!) {
    employeeCurrentShift(employee_id: $employee_id) {
      id shift_id shift_name start_time end_time break_minutes overtime_threshold_hours effective_from effective_to
    }
  }
`

export const ASSIGN_SHIFT = gql`
  mutation AssignShift($employee_id: ID!, $shift_id: ID!, $effective_from: String!) {
    assignShift(employee_id: $employee_id, shift_id: $shift_id, effective_from: $effective_from) {
      id shift_id shift_name effective_from
    }
  }
`

export const UNASSIGN_SHIFT = gql`
  mutation UnassignShift($employee_id: ID!) {
    unassignShift(employee_id: $employee_id)
  }
`

export const LEAVE_TYPES_QUERY = gql`
  query LeaveTypes($is_active: Boolean) {
    leaveTypes(is_active: $is_active) {
      id name is_paid max_days_per_year requires_approval is_active
    }
  }
`

export const CREATE_LEAVE_TYPE = gql`
  mutation CreateLeaveType($input: LeaveTypeInput!) {
    createLeaveType(input: $input) { id name }
  }
`

export const DELETE_LEAVE_TYPE = gql`
  mutation DeleteLeaveType($id: ID!) {
    deleteLeaveType(id: $id)
  }
`

export const LEAVE_REQUESTS_QUERY = gql`
  query LeaveRequests($employee_id: ID, $status: String, $from_date: String, $to_date: String) {
    leaveRequests(employee_id: $employee_id, status: $status, from_date: $from_date, to_date: $to_date) {
      id employee_id employee_name leave_type_id leave_type_name
      start_date end_date total_days status reason reviewed_at
    }
  }
`

export const LEAVE_REQUEST_QUERY = gql`
  query LeaveRequest($id: ID!) {
    leaveRequest(id: $id) {
      id employee_id employee_name leave_type_id leave_type_name
      start_date end_date total_days status reason reviewed_by reviewed_at created_at
    }
  }
`

export const LEAVE_BALANCES_QUERY = gql`
  query LeaveBalances($employee_id: ID!) {
    leaveBalances(employee_id: $employee_id) {
      leave_type_id leave_type_name days_allocated days_used days_remaining
    }
  }
`

export const CREATE_LEAVE_REQUEST = gql`
  mutation CreateLeaveRequest($input: LeaveRequestInput!) {
    createLeaveRequest(input: $input) { id status }
  }
`

export const APPROVE_LEAVE_REQUEST = gql`
  mutation ApproveLeaveRequest($id: ID!) {
    approveLeaveRequest(id: $id) { id status }
  }
`

export const REJECT_LEAVE_REQUEST = gql`
  mutation RejectLeaveRequest($id: ID!, $reviewNotes: String) {
    rejectLeaveRequest(id: $id, reviewNotes: $reviewNotes) { id status }
  }
`

export const CANCEL_LEAVE_REQUEST = gql`
  mutation CancelLeaveRequest($id: ID!) {
    cancelLeaveRequest(id: $id) { id status }
  }
`

export const OVERTIME_REQUESTS_QUERY = gql`
  query OvertimeRequests($employee_id: ID, $from_date: String, $to_date: String) {
    overtimeRequests(employee_id: $employee_id, from_date: $from_date, to_date: $to_date) {
      id employee_id employee_name work_date
      regular_hours overtime_hours overtime_multiplier status
      review_notes reviewed_by_email
    }
  }
`

export const APPROVE_OVERTIME = gql`
  mutation ApproveOvertimeRequest($id: ID!) {
    approveOvertimeRequest(id: $id) { id status }
  }
`

export const REJECT_OVERTIME = gql`
  mutation RejectOvertimeRequest($id: ID!, $reviewNotes: String) {
    rejectOvertimeRequest(id: $id, reviewNotes: $reviewNotes) { id status }
  }
`

export const BULK_APPROVE_OVERTIME = gql`
  mutation BulkApproveOvertime($ids: [ID!]!) {
    bulkApproveOvertime(ids: $ids) { id status }
  }
`

export const EMPLOYEE_SALARY_CONFIG_QUERY = gql`
  query EmployeeSalaryConfig($employee_id: ID!) {
    employeeSalaryConfig(employee_id: $employee_id) {
      id employee_id base_salary currency_code
      housing_allowance transport_allowance other_allowances
      income_tax_pct social_security_pct effective_from effective_to
    }
  }
`

export const UPDATE_SALARY_CONFIG = gql`
  mutation UpdateSalaryConfig($employee_id: ID!, $input: SalaryConfigInput!) {
    updateSalaryConfig(employee_id: $employee_id, input: $input) {
      id employee_id base_salary currency_code
      housing_allowance transport_allowance other_allowances
      income_tax_pct social_security_pct effective_from
    }
  }
`

export const ATTENDANCE_LOGS_QUERY = gql`
  query AttendanceLogs($employee_id: ID, $from_date: String, $to_date: String) {
    attendanceLogs(employee_id: $employee_id, from_date: $from_date, to_date: $to_date) {
      id employee_id employee_name punch_type punched_at
      geofence_valid distance_from_location_m work_location_id
    }
  }
`

export const ATTENDANCE_CALENDAR_QUERY = gql`
  query AttendanceCalendar($employeeId: ID!, $month: String!) {
    attendanceCalendar(employeeId: $employeeId, month: $month) {
      date hoursWorked hasOvertime isAbsent isWeekend isLeave leaveTypeName
    }
  }
`

export const ATTENDANCE_SUMMARY_QUERY = gql`
  query AttendanceSummary($employeeId: ID!, $month: String!) {
    attendanceSummary(employeeId: $employeeId, month: $month) {
      days_present days_absent total_hours overtime_hours leave_days
    }
  }
`

export const BANK_DETAILS_SUMMARY_QUERY = gql`
  query BankDetailsSummary($employee_id: ID!) {
    bankDetailsSummary(employee_id: $employee_id) {
      bank_name currency_code has_account
    }
  }
`

export const REVEAL_BANK_DETAILS = gql`
  mutation RevealBankDetails($employee_id: ID!) {
    revealBankDetails(employee_id: $employee_id) {
      bank_name account_number iban currency_code
    }
  }
`

export const UPDATE_BANK_DETAILS = gql`
  mutation UpdateBankDetails($employee_id: ID!, $input: BankDetailsInput!) {
    updateBankDetails(employee_id: $employee_id, input: $input) {
      id first_name last_name
    }
  }
`

export const ENTITY_ATTACHMENTS_QUERY = gql`
  query EntityAttachments($entityType: String!, $entityId: ID!) {
    entityAttachments(entityType: $entityType, entityId: $entityId) {
      id
      file { id originalFilename mimeType sizeBytes category uploadedAt }
      label isPrimary createdAt uploadedByEmail
    }
  }
`

export const ATTACH_FILE = gql`
  mutation AttachFile($fileId: ID!, $entityType: String!, $entityId: ID!, $label: String) {
    attachFile(fileId: $fileId, entityType: $entityType, entityId: $entityId, label: $label) {
      id file { id originalFilename mimeType sizeBytes } label createdAt
    }
  }
`

export const DETACH_FILE = gql`
  mutation DetachFile($attachmentId: ID!, $entityType: String!, $entityId: ID!) {
    detachFile(attachmentId: $attachmentId, entityType: $entityType, entityId: $entityId)
  }
`

export const FILE_DOWNLOAD_URL_QUERY = gql`
  query FileDownloadUrl($fileId: ID!) {
    fileDownloadUrl(fileId: $fileId) {
      downloadUrl filename mimeType expiresInSeconds
    }
  }
`
