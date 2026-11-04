// Every requisition notice the gateway can send must have a handler in the worker, and must reach it with the id key the
// handler reads.
//
// Regression background (found on production, 2026-11-04):
//  - The worker's notification switch has a `default:` that only logs "unknown notification event"; the event is then marked
//    delivered. REQ_INVENTORY_CHECK_REQUIRED and REQ_STORE_PRICING_REQUIRED had no case, so those notices were silently
//    dropped (53 inventory-check events "delivered", no store keeper ever notified).
//  - The REQ_* handlers read `payload.requisitionId`. "Price verification required" was sent through notifyUserGW, which
//    carries `poId`, so every one failed ("invalid input syntax for type uuid: "undefined"", 192 times) and none arrived.
//
// This reads the two source trees as text, the way other guard tests in this repo do, because the worker's dispatch is not
// exported and its tests mock the database.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'

const here = (rel: string) => new URL(rel, import.meta.url)

const gatewaySources = (readdirSync(here('../../gateway/src'), { recursive: true }) as string[])
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(new URL(`../../gateway/src/${f.replace(/\\/g, '/')}`, import.meta.url), 'utf8'))
const gateway = gatewaySources.join('\n')
const worker = readFileSync(here('../src/jobs/outbox-processor.ts'), 'utf8')

const sent = [...new Set([...gateway.matchAll(/type:\s*'(REQ_[A-Z_]+)'/g)].map((m) => m[1]!))].sort()
const handled = new Set([...worker.matchAll(/case\s+'(REQ_[A-Z_]+)'/g)].map((m) => m[1]!))

describe('requisition notices: gateway and worker agree', () => {
  it('finds the notices the gateway sends, so the checks below cannot pass on an empty list', () => {
    expect(sent.length).toBeGreaterThanOrEqual(7)
    for (const t of ['REQ_INVENTORY_CHECK_REQUIRED', 'REQ_STORE_PRICING_REQUIRED', 'REQ_PRICE_VERIFICATION_REQUIRED'])
      expect(sent).toContain(t)
  })

  it.each(sent)('the worker has a case for %s (an unknown type is only logged and then marked delivered)', (type) => {
    expect(handled.has(type)).toBe(true)
  })

  it('no REQ_* notice is sent through notifyUserGW, which carries poId where the worker reads requisitionId', () => {
    const offenders: string[] = []
    let from = 0
    for (;;) {
      const at = gateway.indexOf('notifyUserGW(', from)
      if (at < 0) break
      from = at + 1
      const end = gateway.indexOf('})', at)
      const call = gateway.slice(at, end < 0 ? at + 400 : end)
      const m = /type:\s*'(REQ_[A-Z_]+)'/.exec(call)
      if (m) offenders.push(m[1]!)
    }
    expect(offenders).toEqual([])
  })
})
