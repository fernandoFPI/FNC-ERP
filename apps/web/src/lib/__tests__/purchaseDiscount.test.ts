// The page's mirror of the rule for a purchase's price after the vendor's discount (migration 336, playbook #124): the price that
// counts is the one after the discount when there is one, otherwise the quoted price. The server's own rule is in
// services/gateway/src/lib/purchaseDiscount.ts; both sources are read here so the two cannot drift apart unnoticed.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  discountPercent,
  discountProblem,
  hasDiscount,
  purchaseUnitPrice,
} from '../purchaseDiscount'

describe('purchaseUnitPrice', () => {
  it('counts the price after the discount when there is one, otherwise the quoted price', () => {
    expect(purchaseUnitPrice({ actual_unit_price: '42.5', discounted_unit_price: '40' })).toBe(40)
    expect(purchaseUnitPrice({ actual_unit_price: 42.5, discounted_unit_price: 40 })).toBe(40)
    expect(purchaseUnitPrice({ actual_unit_price: '42.5', discounted_unit_price: null })).toBe(42.5)
    expect(purchaseUnitPrice({ actual_unit_price: '42.5' })).toBe(42.5)
    expect(purchaseUnitPrice({ actual_unit_price: '42.5', discounted_unit_price: '' })).toBe(42.5)
  })

  it('is 0 for nothing at all, never NaN', () => {
    expect(purchaseUnitPrice({ actual_unit_price: null })).toBe(0)
    expect(purchaseUnitPrice({ actual_unit_price: 'abc' })).toBe(0)
  })
})

describe('hasDiscount', () => {
  it('is true only when a price after discount is recorded', () => {
    expect(hasDiscount({ actual_unit_price: '10', discounted_unit_price: '9' })).toBe(true)
    expect(hasDiscount({ actual_unit_price: '10', discounted_unit_price: null })).toBe(false)
    expect(hasDiscount({ actual_unit_price: '10' })).toBe(false)
    expect(hasDiscount({ actual_unit_price: '10', discounted_unit_price: '' })).toBe(false)
  })
})

describe('discountProblem', () => {
  it('an empty box is no discount: nothing is wrong', () => {
    expect(discountProblem('42.5', '')).toBeNull()
    expect(discountProblem('42.5', '   ')).toBeNull()
  })

  it('a lower price and an equal one are fine', () => {
    expect(discountProblem('42.5', '40')).toBeNull()
    expect(discountProblem('42.5', '42.5')).toBeNull()
    expect(discountProblem(42.5, '0.01')).toBeNull()
  })

  it('zero, a negative and text are "zero"; a higher price is "high"', () => {
    expect(discountProblem('42.5', '0')).toBe('zero')
    expect(discountProblem('42.5', '-1')).toBe('zero')
    expect(discountProblem('42.5', 'abc')).toBe('zero')
    expect(discountProblem('42.5', '43')).toBe('high')
  })

  it('with no quoted price to compare against, only zero is wrong', () => {
    expect(discountProblem('', '5')).toBeNull()
    expect(discountProblem(null, '0')).toBe('zero')
  })
})

describe('discountPercent', () => {
  it('is the saving per unit as a share of the quoted price', () => {
    expect(discountPercent(100, 90)).toBeCloseTo(10, 6)
    expect(discountPercent('42.5', '40')).toBeCloseTo((2.5 / 42.5) * 100, 6)
  })

  it('is 0 when there is no saving or nothing to compare', () => {
    expect(discountPercent(100, 100)).toBe(0)
    expect(discountPercent(100, 120)).toBe(0)
    expect(discountPercent(100, null)).toBe(0)
    expect(discountPercent(0, 5)).toBe(0)
  })
})

describe('the page and the server say the same thing', () => {
  const dir = __dirname
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(dir, ...parts), 'utf8')

  it('both refuse a price after discount of zero or less and one above the quoted price, with the same tolerance', () => {
    const server = read(
      '..',
      '..',
      '..',
      '..',
      '..',
      'services',
      'gateway',
      'src',
      'lib',
      'purchaseDiscount.ts',
    )
    const web = read('..', 'purchaseDiscount.ts')
    expect(
      server.includes('!(d > 0)'),
      'the server refuses a price after discount of zero or less',
    ).toBe(true)
    expect(
      server.includes('d > l + 0.00005'),
      'the server refuses one above the quoted price',
    ).toBe(true)
    expect(web.includes('!(d > 0)'), 'the page marks zero or less').toBe(true)
    expect(web.includes('d > q + 0.00005'), 'the page marks one above the quoted price').toBe(true)
  })
})
