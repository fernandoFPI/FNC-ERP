// A petty cash float's currency (migration 103: `petty_cash_floats.currency_code`).
//
// The currency is more than a label. Every journal line a spend, a top-up or an advance issue writes against the
// float carries it (`journal_lines.currency_code`), an advance can only be issued from a box in its own currency
// (`cashboxProblem`), and the page shows each balance in it. So it may be corrected only while nothing has been
// written in the old one: a float that holds just its opening balance. After that a wrong currency means a new float.
//
// The New Float form used to send a hard-coded 'IQD' (it had no currency box) and the edit route ignored the field,
// so two USD floats on production were stored as IQD with no way to fix them (playbook #89).

/**
 * SQL for "this float has history in its current currency". It expects the float aliased as `f`, and is used by the
 * list, the detail read and the guard on the edit route, so the screen's "currency locked" flag cannot drift from the
 * server's refusal. ANY replenishment counts, even a pending one: its journal would be written in the float's
 * currency at approval time.
 */
export const FLOAT_HAS_ACTIVITY_SQL = `(
  EXISTS (SELECT 1 FROM petty_cash_transactions t WHERE t.float_id = f.id AND t.transaction_type <> 'opening')
  OR EXISTS (SELECT 1 FROM petty_cash_replenishments r WHERE r.float_id = f.id)
  OR EXISTS (SELECT 1 FROM employee_advances a WHERE a.petty_cash_float_id = f.id)
  OR EXISTS (SELECT 1 FROM expense_claims c WHERE c.petty_cash_float_id = f.id)
  OR EXISTS (SELECT 1 FROM payment_vouchers v WHERE v.petty_cash_float_id = f.id)
)`

/** Upper-case three-letter code, or a validation error the route turns into a 422. */
export function normaliseFloatCurrency(raw: string): string {
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) {
    throw Object.assign(new Error('Currency must be a three-letter code such as IQD or USD'), {
      isValidation: true,
    })
  }
  return code
}

export const FLOAT_CURRENCY_LOCKED_MESSAGE =
  'This float already has spends, top-ups, advances or claims recorded in its current currency, so the currency can no longer be changed. Create a new float in the right currency instead.'
