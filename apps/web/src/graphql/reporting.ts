import { gql } from '@apollo/client'

export const EXECUTIVE_DASHBOARD_QUERY = gql`
  query ExecutiveDashboard($currencyCode: String) {
    executiveDashboard(currencyCode: $currencyCode) {
      currencyCode
      availableCurrencies
      totalRevenue
      totalCosts
      netProfit
      activeProjects
      totalProjectBudget
      totalHeadcount
      openPOsValue
      revenueTrend {
        period
        value
      }
      costsTrend {
        period
        value
      }
      profitTrend {
        period
        value
      }
      entityBreakdown {
        companyId
        companyName
        revenueThisMonth
        costThisMonth
        netThisMonth
        headcount
      }
      revenueByEntityMonthly {
        month
        yakam
        factory
        watanyia
      }
      projectProfitabilityScatter {
        id
        name
        budget
        marginPct
        actualCost
        status
        client_name
      }
    }
  }
`

export const CONSOLIDATED_PL_QUERY = gql`
  query ConsolidatedPL($fromDate: String!, $toDate: String!, $showEliminations: Boolean, $currencyCode: String) {
    consolidatedPL(fromDate: $fromDate, toDate: $toDate, showEliminations: $showEliminations, currencyCode: $currencyCode) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies {
        id
        name
      }
      currency
      availableCurrencies
      totalRevenue
      totalExpenses
      netProfit
    }
  }
`

export const CONSOLIDATED_BS_QUERY = gql`
  query ConsolidatedBS($asOfDate: String!, $showEliminations: Boolean, $currencyCode: String) {
    consolidatedBS(asOfDate: $asOfDate, showEliminations: $showEliminations, currencyCode: $currencyCode) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies {
        id
        name
      }
      currency
      availableCurrencies
      totalAssets
      totalLiabilities
      totalEquity
      isBalanced
    }
  }
`

export const CONSOLIDATED_TB_QUERY = gql`
  query ConsolidatedTrialBalance($asOfDate: String!, $currencyCode: String) {
    consolidatedTrialBalance(asOfDate: $asOfDate, currencyCode: $currencyCode) {
      rows {
        accountType
        accountCode
        accountName
        companies
        consolidated
        eliminated
      }
      companies {
        id
        name
      }
      currency
      availableCurrencies
      totalDebits
      totalCredits
      isBalanced
    }
  }
`

export const PROJECT_PROFITABILITY_QUERY = gql`
  query ProjectProfitabilityReport(
    $companyId: ID
    $status: [String]
    $projectType: String
    $fromDate: String
    $toDate: String
  ) {
    projectProfitabilityReport(
      companyId: $companyId
      status: $status
      projectType: $projectType
      fromDate: $fromDate
      toDate: $toDate
    ) {
      id
      code
      name
      projectType
      currencyCode
      companyName
      budget
      actualCost
      revenue
      margin
      marginPct
      status
      costBreakdown {
        key
        label
        amount
      }
    }
  }
`

export const PAYROLL_COST_REPORT_QUERY = gql`
  query PayrollCostReport($fromDate: String!, $toDate: String!, $companyId: ID, $departmentId: ID) {
    payrollCostReport(
      fromDate: $fromDate
      toDate: $toDate
      companyId: $companyId
      departmentId: $departmentId
    ) {
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
      byCurrency {
        currency
        amount
        fxRate
        iqdEquivalent
      }
      monthlyTrend {
        month
        yakam
        factory
        watanyia
      }
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
      byLocation {
        locationName
        locationType
        totalValue
      }
    }
  }
`

export const WHT_REPORT_QUERY = gql`
  query WHTReport($fromDate: String!, $toDate: String!, $companyId: ID, $currencyCode: String) {
    whtReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId, currencyCode: $currencyCode) {
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
      currencyCode
      availableCurrencies
    }
  }
`

export const FX_EXPOSURE_QUERY = gql`
  query FXExposureReport($asOfDate: String!, $companyId: ID) {
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
  query PayrollTaxReport($fromDate: String!, $toDate: String!, $companyId: ID, $currencyCode: String) {
    payrollTaxReport(fromDate: $fromDate, toDate: $toDate, companyId: $companyId, currencyCode: $currencyCode) {
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
      currencyCode
      availableCurrencies
    }
  }
`
