import { gql } from '@apollo/client'

export const EXECUTIVE_DASHBOARD_QUERY = gql`
  query ExecutiveDashboard {
    executiveDashboard {
      totalRevenue
      totalCosts
      netProfit
      activeProjects
      totalProjectBudget
      totalHeadcount
      openPOsValue
      revenueTrend { period value }
      costsTrend { period value }
      profitTrend { period value }
      entityBreakdown {
        companyId
        companyName
        revenueThisMonth
        costThisMonth
        netThisMonth
        headcount
      }
      revenueByEntityMonthly { month yakam factory watanyia }
      projectProfitabilityScatter { id name budget marginPct actualCost status client_name }
    }
  }
`

export const CONSOLIDATED_PL_QUERY = gql`
  query ConsolidatedPL($fromDate: String!, $toDate: String!, $showEliminations: Boolean) {
    consolidatedPL(fromDate: $fromDate, toDate: $toDate, showEliminations: $showEliminations) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies { id name }
      currency
      totalRevenue
      totalExpenses
      netProfit
    }
  }
`

export const CONSOLIDATED_BS_QUERY = gql`
  query ConsolidatedBS($asOfDate: String!, $showEliminations: Boolean) {
    consolidatedBS(asOfDate: $asOfDate, showEliminations: $showEliminations) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies { id name }
      currency
      totalAssets
      totalLiabilities
      totalEquity
      isBalanced
    }
  }
`

export const CONSOLIDATED_TB_QUERY = gql`
  query ConsolidatedTrialBalance($asOfDate: String!) {
    consolidatedTrialBalance(asOfDate: $asOfDate) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies { id name }
      currency
      totalDebits
      totalCredits
      isBalanced
    }
  }
`

export const PROJECT_PROFITABILITY_QUERY = gql`
  query ProjectProfitabilityReport($companyId: ID, $status: [String], $projectType: String, $fromDate: String, $toDate: String) {
    projectProfitabilityReport(companyId: $companyId, status: $status, projectType: $projectType, fromDate: $fromDate, toDate: $toDate) {
      id
      code
      name
      projectType
      companyName
      budget
      actualCost
      revenue
      margin
      marginPct
      status
      costBreakdown { key label amount }
    }
  }
`

export const PAYROLL_COST_REPORT_QUERY = gql`
  query PayrollCostReport($fromDate: String!, $toDate: String!, $companyId: ID, $departmentId: ID) {
    payrollCostReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId, departmentId: $departmentId) {
      rows {
        companyName
        costCenter
        period
        headcount
        totalGross
        totalNet
        totalIQD
      }
      totalHeadcount
      totalGross
      totalNet
      totalEmployerCost
      avgCostPerEmployee
      byCurrency { currency amount fxRate iqdEquivalent }
      monthlyTrend { month yakam factory watanyia }
    }
  }
`

export const ATTENDANCE_SUMMARY_QUERY = gql`
  query AttendanceSummaryReport($fromDate: String!, $toDate: String!, $companyId: ID) {
    attendanceSummaryReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId) {
      rows {
        employeeName
        employeeNumber
        department
        totalPresent
        totalAbsent
        totalLeave
        totalOvertime
        attendancePct
      }
      totalEmployees
      avgAttendancePct
    }
  }
`

export const INVENTORY_VALUATION_QUERY = gql`
  query InventoryValuationReport($asOfDate: String!, $companyId: ID, $locationId: ID) {
    inventoryValuationReport(asOfDate: $asOfDate, companyId: $companyId, locationId: $locationId) {
      rows {
        productName
        sku
        locationName
        locationType
        qtyOnHand
        avgCost
        totalValue
        currency
      }
      totalValue
      totalProducts
      totalLocations
      lowStockItems
      byLocation { locationName locationType totalValue }
    }
  }
`

export const WHT_REPORT_QUERY = gql`
  query WHTReport($fromDate: String!, $toDate: String!, $companyId: ID!) {
    whtReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId) {
      rows {
        vendorName
        taxId
        whtType
        rate
        paymentAmount
        whtAmount
        period
      }
      totalWHT
      vendorCount
      totalPaymentsSubjectToWHT
    }
  }
`

export const FX_EXPOSURE_QUERY = gql`
  query FXExposureReport($asOfDate: String!, $companyId: ID!) {
    fxExposureReport(asOfDate: $asOfDate, companyId: $companyId) {
      rows {
        currency
        openAR
        openAP
        netExposure
        fxRate
        iqdEquivalent
      }
      totalIQDExposure
    }
  }
`

export const PAYROLL_TAX_REPORT_QUERY = gql`
  query PayrollTaxReport($fromDate: String!, $toDate: String!, $companyId: ID!) {
    payrollTaxReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId) {
      rows {
        employeeName
        employeeNumber
        period
        grossPay
        taxableIncome
        incomeTaxWithheld
        socialSecurity
        netPay
      }
    }
  }
`
