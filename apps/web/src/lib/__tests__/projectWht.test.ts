import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PROJECT_WHT_SCENARIOS,
  DEFAULT_WHT_RATE_PERCENT,
  whtRateFromPercent,
  whtPercentText,
  estimateProjectWht,
} from '../projectWht'

describe('whtRateFromPercent', () => {
  it('turns a percent into the fraction the server stores', () => {
    expect(whtRateFromPercent('3')).toBe(0.03)
    expect(whtRateFromPercent('3.3')).toBe(0.033)
    expect(whtRateFromPercent('7.1')).toBe(0.071)
    expect(whtRateFromPercent('3.25')).toBe(0.0325)
    expect(whtRateFromPercent('0')).toBe(0)
    expect(whtRateFromPercent('100')).toBe(1)
    expect(whtRateFromPercent(' 5 ')).toBe(0.05)
  })

  it('refuses what the server would refuse', () => {
    for (const bad of ['', 'abc', '-1', '100.5', '101', '3.256', '3,5', '1e2', '.5', '3.']) {
      expect(whtRateFromPercent(bad), `"${bad}"`).toBeNull()
    }
  })

  it('the default rate is a valid one and is what the invoice wizard starts at', () => {
    expect(whtRateFromPercent(DEFAULT_WHT_RATE_PERCENT)).toBe(0.03)
  })
})

describe('whtPercentText', () => {
  it('is the inverse, without floating noise', () => {
    expect(whtPercentText(0.03)).toBe('3')
    expect(whtPercentText(0.0325)).toBe('3.25')
    expect(whtPercentText(0.071)).toBe('7.1')
    expect(whtPercentText(0)).toBe('0')
  })
})

describe('estimateProjectWht', () => {
  it('is Bid Price x rate', () => {
    expect(estimateProjectWht('200000', 0.03)).toBe(6000)
    expect(estimateProjectWht(1000, 0.05)).toBe(50)
  })

  it('takes the Bid Price as the column stores it (two decimals), then rounds to four, like the server', () => {
    expect(estimateProjectWht('1234.5678', 0.033)).toBe(40.7408)
  })

  it('has no estimate without a usable Bid Price or rate (not a made-up zero)', () => {
    expect(estimateProjectWht('', 0.03)).toBeNull()
    expect(estimateProjectWht('   ', 0.03)).toBeNull()
    expect(estimateProjectWht(null, 0.03)).toBeNull()
    expect(estimateProjectWht(undefined, 0.03)).toBeNull()
    expect(estimateProjectWht('abc', 0.03)).toBeNull()
    expect(estimateProjectWht('1000', null)).toBeNull()
  })

  it('a zero Bid Price is an estimate of zero', () => {
    expect(estimateProjectWht('0', 0.03)).toBe(0)
  })
})

describe('the server rules it mirrors (services/gateway/src/lib/projectWht.ts)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../../../../services/gateway/src/lib/projectWht.ts'),
    'utf8',
  )

  it('offers the same scenarios', () => {
    const m = /export const PROJECT_WHT_SCENARIOS = \[([^\]]*)\] as const/.exec(src)
    const list = m?.[1]
    if (list === undefined) throw new Error('PROJECT_WHT_SCENARIOS not found in the server file')
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual([...PROJECT_WHT_SCENARIOS])
  })

  it('rounds the amount the same way, to four decimals', () => {
    expect(src).toContain('Math.round(projectValue * wht.rate * 10000) / 10000')
  })

  it('refuses the same rates: 0 to 100%, two decimals of a percent', () => {
    expect(src).toContain('rate < 0 || rate > 1')
    expect(src).toContain('Math.abs(rate * 10000 - Math.round(rate * 10000)) > 1e-6')
  })
})
