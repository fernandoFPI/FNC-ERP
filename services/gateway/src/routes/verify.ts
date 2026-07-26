import { Router, type Router as ExpressRouter, type Request, type Response } from 'express'
import { query } from '@fnc-erp/db'

export const verifyRouter: ExpressRouter = Router()

verifyRouter.get('/invoice/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string }

  try {
    const r = await query(
      `SELECT pi.*,
              p.code AS project_code, p.name AS project_name,
              pc.contract_number, pc.client_name, pc.retention_pct,
              COALESCE(sc.default_payment_terms_days, pc.payment_terms_days, 30) AS payment_terms_days,
              co.name AS company_name, co.legal_name AS company_legal_name,
              co.country_code AS company_country, co.stamp_image AS company_stamp_image
       FROM project_invoices pi
       LEFT JOIN projects p ON p.id = pi.project_id
       LEFT JOIN project_contracts pc ON pc.id = pi.contract_id
       LEFT JOIN companies co ON co.id = pi.company_id
       LEFT JOIN system_configuration sc ON sc.company_id = pi.company_id
       WHERE pi.verification_token = $1`,
      [token],
    )

    if (!r.rows[0]) {
      res.json({
        success: true,
        data: { valid: false, reason: 'not_found', invoice: null, bankAccount: null },
      })
      return
    }

    const i = r.rows[0] as Record<string, unknown>
    const status = String(i.status)
    const isRevoked = ['void', 'cancelled'].includes(status)

    const [linesR, bankR] = await Promise.all([
      query(`SELECT * FROM project_invoice_lines WHERE invoice_id = $1 ORDER BY line_number`, [
        i.id,
      ]),
      i.bank_account_id
        ? query(`SELECT * FROM bank_accounts WHERE id = $1`, [i.bank_account_id])
        : Promise.resolve({ rows: [] }),
    ])

    const ba = bankR.rows[0] as Record<string, unknown> | undefined
    const bankAccount = ba
      ? {
          id: ba.id,
          accountName: ba.account_name,
          bankName: ba.bank_name,
          beneficiaryName: ba.beneficiary_name ?? null,
          accountNumber: ba.account_number ?? null,
          iban: ba.iban ?? null,
          swift: ba.swift ?? null,
          branchCode: ba.branch_code ?? null,
          bankAddress: ba.bank_address ?? null,
          intermediaryBankName: ba.intermediary_bank_name ?? null,
          intermediarySwift: ba.intermediary_swift ?? null,
          intermediaryCountry: ba.intermediary_country ?? null,
          currencyCode: ba.currency_code,
          isActive: ba.is_active,
        }
      : null

    res.json({
      success: true,
      data: {
        valid: !isRevoked,
        reason: isRevoked ? status : null,
        invoice: {
          invoiceNumber: i.invoice_number,
          status,
          invoiceDate: i.invoice_date,
          dueDate: i.due_date,
          billingMethod: i.billing_method,
          paymentTermsDays: Number(i.payment_terms_days ?? 30),
          currencyCode: i.currency_code ?? 'IQD',
          paymentType: i.payment_type ?? 'wire_transfer',
          projectCode: i.project_code ?? null,
          projectName: i.project_name ?? null,
          contractNumber: i.contract_number ?? null,
          clientName: i.client_name ?? null,
          companyName: i.company_name ?? null,
          companyLegalName: i.company_legal_name ?? null,
          companyCountry: i.company_country ?? null,
          companyStampImage: i.company_stamp_image ?? null,
          grossTotal: parseFloat(String(i.gross_total)),
          retentionAmount: parseFloat(String(i.retention_amount ?? '0')),
          retentionPct: parseFloat(String(i.retention_pct ?? '0')),
          netPayable: parseFloat(String(i.net_payable)),
          whtApplies: Boolean(i.wht_applies ?? false),
          whtAmount: parseFloat(String(i.wht_amount ?? '0')),
          bankAccountId: i.bank_account_id ?? null,
          lines: linesR.rows.map((l: Record<string, unknown>) => ({
            lineNumber: l.line_number,
            description: l.description,
            qty: parseFloat(String(l.qty)),
            unitCost: parseFloat(String(l.unit_cost)),
            subtotal: parseFloat(String(l.subtotal)),
            marginPct: parseFloat(String(l.margin_pct ?? '0')),
            marginAmount: parseFloat(String(l.margin_amount ?? '0')),
            taxPct: parseFloat(String(l.tax_pct ?? '0')),
            taxAmount: parseFloat(String(l.tax_amount ?? '0')),
            lineTotal: parseFloat(String(l.line_total)),
          })),
        },
        bankAccount,
      },
    })
  } catch {
    res.status(500).json({ success: false, error: { message: 'Verification lookup failed' } })
  }
})
