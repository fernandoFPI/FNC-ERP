// Withholding tax (WHT) on a project: the three settings stored on `projects` (migration 320) and the
// amount calculated from them. The settings mirror an invoice's (migration 063); the amount is NOT stored,
// it is always the current Bid Price (projects.project_value) times the rate, so it cannot go stale.

export const PROJECT_WHT_SCENARIOS = ['client_withholds', 'fnc_pays'] as const
export type ProjectWhtScenario = (typeof PROJECT_WHT_SCENARIOS)[number]

export interface ProjectWht {
  applies: boolean
  scenario: ProjectWhtScenario | null
  /** A fraction: 0.03 = 3%. */
  rate: number
}

export const PROJECT_WHT_OFF: ProjectWht = { applies: false, scenario: null, rate: 0 }

const isScenario = (v: unknown): v is ProjectWhtScenario =>
  typeof v === 'string' && (PROJECT_WHT_SCENARIOS as readonly string[]).includes(v)

/**
 * The WHT settings a create/update input asks for, validated.
 *
 *   * `null`  : the input says nothing about WHT, so leave the project as it is (an update such as the
 *               status bar's schedule dates sends none of the three fields).
 *   * off     : applies is false, so the scenario is cleared and the rate is zero.
 *   * on      : needs a scenario (from the input, else the stored one) and a rate between 0 and 100%.
 *
 * A bad value is refused with a plain message. There is no silent fallback: an unknown scenario or an
 * out-of-range rate is not quietly turned into another one (playbook #30).
 */
export function resolveProjectWht(
  input: { whtApplies?: unknown; whtScenario?: unknown; whtRate?: unknown },
  existing: ProjectWht = PROJECT_WHT_OFF,
): ProjectWht | null {
  const given = (v: unknown) => v !== undefined && v !== null
  if (!given(input.whtApplies) && !given(input.whtScenario) && !given(input.whtRate)) return null

  const applies = given(input.whtApplies) ? input.whtApplies === true : existing.applies
  if (!applies) return PROJECT_WHT_OFF

  const scenario = given(input.whtScenario) ? input.whtScenario : existing.scenario
  if (!isScenario(scenario)) {
    throw new Error(
      'Choose who pays the withholding tax: the client withholds it, or FNC pays it (client_withholds / fnc_pays)',
    )
  }

  const rate = given(input.whtRate) ? Number(input.whtRate) : existing.rate
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error('The withholding tax rate must be between 0% and 100%')
  }
  // The column holds four decimals of a fraction (two of a percent). Refuse more, do not round it quietly.
  if (Math.abs(rate * 10000 - Math.round(rate * 10000)) > 1e-6) {
    throw new Error('The withholding tax rate can have at most two decimals (for example 3.25%)')
  }
  return { applies: true, scenario, rate: Math.round(rate * 10000) / 10000 }
}

/** The settings as stored on a `projects` row. */
export function projectWhtFromRow(row: Record<string, unknown>): ProjectWht {
  const applies = row.wht_applies === true
  return {
    applies,
    scenario: applies && isScenario(row.wht_scenario) ? row.wht_scenario : null,
    rate: row.wht_rate != null ? parseFloat(String(row.wht_rate)) : 0,
  }
}

/**
 * How much WHT the project will carry: Bid Price x rate, rounded to four decimals exactly as an invoice does
 * (resolvers: whtAmount = Math.round(base * rate * 10000) / 10000). `null` when WHT is off or there is no bid
 * price yet, so a screen can say "no estimate" instead of showing a made-up 0.
 */
export function projectWhtAmount(projectValue: number | null, wht: ProjectWht): number | null {
  if (!wht.applies || projectValue == null || !Number.isFinite(projectValue)) return null
  return Math.round(projectValue * wht.rate * 10000) / 10000
}
