// The screen's mirror of "only an administrator may change an approved requisition or purchase order" (playbook #112), and the places it has to
// agree with the server and the translations.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  EDIT_ADMIN_ROLES,
  PO_STATUSES_BEFORE_APPROVAL,
  REQUISITION_STATUSES_BEFORE_APPROVAL,
  isEditAdminRole,
  poNeedsAdminToChange,
  requisitionNeedsAdminToChange,
} from '../approvedEdit'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'

const server = readFileSync(
  path.resolve(__dirname, '../../../../../services/gateway/src/lib/poEditApproval.ts'),
  'utf8',
)
const listIn = (source: string, name: string): string[] => {
  const m = new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source)
  if (!m) throw new Error(`${name} not found in the server file`)
  return [...(m.at(1) ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x.at(1) ?? '')
}

describe('who counts as an administrator', () => {
  it('is the three roles that could already approve an edit request, and nobody else', () => {
    expect([...EDIT_ADMIN_ROLES]).toEqual(['system_admin', 'company_admin', 'module_admin'])
    for (const r of EDIT_ADMIN_ROLES) expect(isEditAdminRole(r)).toBe(true)
    for (const r of ['user', 'manager', '', 'SYSTEM_ADMIN', null, undefined])
      expect(isEditAdminRole(r)).toBe(false)
  })
})

describe('when only an administrator may change a document', () => {
  it('is every requisition status after approval, and nothing before it', () => {
    for (const s of REQUISITION_STATUSES_BEFORE_APPROVAL)
      expect(requisitionNeedsAdminToChange(s)).toBe(false)
    for (const s of ['approved', 'items_bought', 'sourcing', 'completed', 'cancelled'])
      expect(requisitionNeedsAdminToChange(s)).toBe(true)
  })
  it('is every purchase order status after approval, the requisition-split child statuses included', () => {
    for (const s of PO_STATUSES_BEFORE_APPROVAL) expect(poNeedsAdminToChange(s)).toBe(false)
    for (const s of [
      'approved',
      'ready_to_issue',
      'items_bought',
      'goods_received',
      'finance_audit',
      'invoiced',
      'completed',
      'cancelled',
      'bought',
      'finance_review',
      'payment_pending',
      'closed',
    ])
      expect(poNeedsAdminToChange(s)).toBe(true)
  })
  it('counts a status it does not know as after approval, so a new status is never open to everyone by omission', () => {
    expect(requisitionNeedsAdminToChange('some_future_status')).toBe(true)
    expect(poNeedsAdminToChange('some_future_status')).toBe(true)
  })
})

describe('the lists the server uses', () => {
  it('the administrator roles are the same', () => {
    expect(listIn(server, 'EDIT_ADMIN_ROLES')).toEqual([...EDIT_ADMIN_ROLES])
  })
  it('the requisition statuses before approval are the same', () => {
    expect(listIn(server, 'AUTO_APPLY_REQUISITION_STATUSES').sort()).toEqual(
      [...REQUISITION_STATUSES_BEFORE_APPROVAL].sort(),
    )
  })
  it('the purchase order statuses before approval are the same', () => {
    expect(listIn(server, 'AUTO_APPLY_PO_STATUSES').sort()).toEqual(
      [...PO_STATUSES_BEFORE_APPROVAL].sort(),
    )
  })
})

describe('the translations of the message', () => {
  const detail = (j: unknown, ns: 'req' | 'po'): Record<string, string | undefined> =>
    (j as Record<string, { detail: Record<string, string> } | undefined>)[ns]?.detail ?? {}
  it.each(['req', 'po'] as const)(
    '%s.detail.onlyAnAdminAfterApproval is in both languages, in the group the page reads',
    (ns) => {
      expect(detail(en, ns).onlyAnAdminAfterApproval).toMatch(
        /^Only an administrator can change an approved/,
      )
      expect((detail(ar, ns).onlyAnAdminAfterApproval ?? '').length).toBeGreaterThan(10)
    },
  )
  it('the two pages read exactly those keys (a key in the wrong group prints its raw dotted name)', () => {
    const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8')
    expect(read('../../pages/procurement/requisitions/RequisitionDetail.tsx')).toContain(
      "t('req.detail.onlyAnAdminAfterApproval')",
    )
    expect(read('../../pages/procurement/purchase-orders/PurchaseOrderDetail.tsx')).toContain(
      "t('po.detail.onlyAnAdminAfterApproval')",
    )
  })
})
