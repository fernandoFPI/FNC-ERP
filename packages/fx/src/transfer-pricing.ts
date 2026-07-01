import type { PoolClient } from 'pg'

export class TransferPricingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TransferPricingError'
  }
}

export type TransferPricingMethod = 'avco' | 'cost_plus' | 'market' | 'standard'

export interface TransferPriceResult {
  method: TransferPricingMethod
  avco_at_transfer: number
  standard_cost_at_transfer: number | null
  transfer_price: number
  markup_pct_applied: number | null
  requires_manual_input: boolean
}

export interface ResolveTransferPriceParams {
  client: PoolClient
  productId: string
  fromCompanyId: string
  fromLocationId: string
  manualPrice?: number
}

export async function resolveTransferPrice(
  params: ResolveTransferPriceParams,
): Promise<TransferPriceResult> {
  const { client, productId, fromCompanyId, fromLocationId, manualPrice } = params

  const companyResult = await client.query<{
    interco_transfer_pricing_method: string
    interco_cost_plus_markup_pct: string
  }>(
    `SELECT interco_transfer_pricing_method, interco_cost_plus_markup_pct
     FROM companies WHERE id = $1`,
    [fromCompanyId],
  )
  const company = companyResult.rows[0]
  if (!company) {
    throw new TransferPricingError('COMPANY_NOT_FOUND', `Company ${fromCompanyId} not found`)
  }

  const method = company.interco_transfer_pricing_method as TransferPricingMethod
  const markupPct = parseFloat(company.interco_cost_plus_markup_pct)

  // Weighted average across all lots at this location
  const balanceResult = await client.query<{
    weighted_average_cost: string
    total_qty: string
  }>(
    `SELECT
       COALESCE(
         SUM(qty_on_hand * average_cost) / NULLIF(SUM(qty_on_hand), 0),
         0
       ) AS weighted_average_cost,
       COALESCE(SUM(qty_on_hand), 0) AS total_qty
     FROM stock_balances
     WHERE product_id = $1
       AND location_id = $2`,
    [productId, fromLocationId],
  )
  const avco = parseFloat(balanceResult.rows[0]?.weighted_average_cost ?? '0')

  const productResult = await client.query<{ standard_cost: string }>(
    `SELECT standard_cost FROM products WHERE id = $1`,
    [productId],
  )
  const rawStandard = parseFloat(productResult.rows[0]?.standard_cost ?? '0')
  const standardCost = rawStandard > 0 ? rawStandard : null

  switch (method) {
    case 'avco':
      return {
        method,
        avco_at_transfer: avco,
        standard_cost_at_transfer: standardCost,
        transfer_price: avco,
        markup_pct_applied: null,
        requires_manual_input: false,
      }

    case 'cost_plus': {
      const costPlusPrice = avco * (1 + markupPct)
      return {
        method,
        avco_at_transfer: avco,
        standard_cost_at_transfer: standardCost,
        transfer_price: costPlusPrice,
        markup_pct_applied: markupPct,
        requires_manual_input: false,
      }
    }

    case 'standard':
      if (!standardCost) {
        throw new TransferPricingError(
          'STANDARD_COST_NOT_SET',
          `Product ${productId} has no standard cost configured. ` +
            `Set a standard cost on the product or change the transfer pricing method.`,
        )
      }
      return {
        method,
        avco_at_transfer: avco,
        standard_cost_at_transfer: standardCost,
        transfer_price: standardCost,
        markup_pct_applied: null,
        requires_manual_input: false,
      }

    case 'market':
      if (manualPrice !== undefined && manualPrice > 0) {
        return {
          method,
          avco_at_transfer: avco,
          standard_cost_at_transfer: standardCost,
          transfer_price: manualPrice,
          markup_pct_applied: null,
          requires_manual_input: false,
        }
      }
      return {
        method,
        avco_at_transfer: avco,
        standard_cost_at_transfer: standardCost,
        transfer_price: 0,
        markup_pct_applied: null,
        requires_manual_input: true,
      }

    default:
      throw new TransferPricingError(
        'INVALID_PRICING_METHOD',
        `Unknown pricing method: ${String(method)}`,
      )
  }
}
