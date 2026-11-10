import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  BID_PACKAGE_KINDS,
  BID_PACKAGE_KINDS_HIDDEN_FROM_TECHNICAL,
  isBidPackageKind,
  visibleBidPackageKinds,
} from '../bidPackageTabs'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'

const serverSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../../services/gateway/src/lib/bidPackages.ts'),
  'utf8',
)

// The block between "BID_PACKAGE_TYPES = {" and "} as const".
const typesBlock = /BID_PACKAGE_TYPES = \{([\s\S]*?)\n\} as const/.exec(serverSource)?.[1] ?? ''
const serverKinds = [...typesBlock.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])
const serverRestricted = [
  ...typesBlock.matchAll(/^ {2}(\w+): \{[\s\S]*?apiHiddenFromTechnicalMembers: (true|false)/gm),
]
  .filter((m) => m[2] === 'true')
  .map((m) => m[1])

describe('bid package tabs', () => {
  it('lists the four areas in the order the sub-tabs appear', () => {
    expect([...BID_PACKAGE_KINDS]).toEqual([
      'technical',
      'commercial',
      'cost_analysis',
      'clarifications',
    ])
  })

  it('shows every area to someone who may see pricing', () => {
    expect(visibleBidPackageKinds(true)).toEqual([
      'technical',
      'commercial',
      'cost_analysis',
      'clarifications',
    ])
  })

  it('hides Commercial and Cost Analysis from a technical-only member, and keeps Technical and Clarifications', () => {
    expect(visibleBidPackageKinds(false)).toEqual(['technical', 'clarifications'])
  })

  it('recognises only the four kinds', () => {
    for (const k of BID_PACKAGE_KINDS) expect(isBidPackageKind(k)).toBe(true)
    for (const bad of ['tq', 'pricing', '', 'Technical', null, undefined])
      expect(isBidPackageKind(bad)).toBe(false)
  })

  describe('pinned to the gateway', () => {
    it('reads the same four kinds, in the same order, as the server', () => {
      expect(serverKinds).toEqual([...BID_PACKAGE_KINDS])
    })

    it('hides exactly what the server refuses to a technical member', () => {
      expect(serverRestricted).toEqual(['commercial', 'cost_analysis'])
      expect([...BID_PACKAGE_KINDS_HIDDEN_FROM_TECHNICAL]).toEqual(serverRestricted)
    })
  })

  describe.each([
    ['en', en],
    ['ar', ar],
  ] as const)('%s text', (_name, locale) => {
    const detail = locale.proj.detail as Record<string, unknown>

    it('has a tab label, a heading and a "none yet" word for every area', () => {
      for (const key of [
        'technicalBid',
        'commercialBid',
        'costAnalysis',
        'clarificationsBid',
        'technicalBidPackage',
        'commercialBidPackage',
        'costAnalysisPackage',
        'clarificationsPackage',
      ])
        expect(typeof detail[key], key).toBe('string')
      const areas = detail.bidFileArea as Record<string, string>
      for (const kind of BID_PACKAGE_KINDS)
        expect(typeof areas[kind], `bidFileArea.${kind}`).toBe('string')
    })

    it('keeps no text for the removed Technical Queries screen', () => {
      for (const key of [
        'raiseTq',
        'raiseFirstTq',
        'closeTq',
        'raiseTechnicalQuery',
        'tqCreated',
        'tqUpdated',
        'noTechnicalQueries',
      ])
        expect(key in detail, key).toBe(false)
    })
  })
})
