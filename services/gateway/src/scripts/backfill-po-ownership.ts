// One-off backfill (playbook #66): a purchase order forked from a requisition continues the requisition's
// ownership. Until the fork was changed it was created with `created_by` = whoever triggered Finish Buying (a
// buyer, or an admin approving the last purchase), so on production 250 of 297 requisition-linked POs named
// that person instead of the requisition's organizer. This sets `created_by` to the requisition's organizer.
//
// Only a PO whose created_by is a finisher of ITS OWN requisition (an actor of a `finish_buying` row in
// requisition_approval_log) is touched: that is what the fork wrote, and nothing else is rewritten (a PO
// somebody created by hand, or a legacy one moved onto a REQ-MIG requisition, keeps its creator). A requisition
// with no organizer has nobody to follow and is reported, not changed. `organizer_id` is never touched: it was
// already right on every PO.
//
// Dry run by default: reads, prints what it would change, writes nothing. `--apply` makes the change in ONE
// transaction, records the old and new created_by of every PO in audit_log (so it can be reversed from there),
// then re-reads the COMMITTED data and fails if anything is still wrong. Take scripts/backup-db.sh first.
//
// Run on the server, from the gateway folder, after sourcing the app's .env:
//   node dist/scripts/backfill-po-ownership.js                       (dry run, every company)
//   node dist/scripts/backfill-po-ownership.js --company "Nishtimani Yakam" --apply --actor-email you@company.com
/* eslint-disable no-console -- a command-line script: printing is its output */
import { pathToFileURL } from 'node:url'
import { pool, type PoolClient } from '@fnc-erp/db'

export interface BackfillOptions {
  apply: boolean
  actorEmail?: string
  // A company id or its exact name; omitted means every company.
  company?: string
}

export interface OwnershipRow {
  po_id: string
  company_id: string
  company: string
  po_number: string
  requisition_number: string
  status: string
  old_created_by: string
  old_email: string | null
  new_created_by: string
  new_email: string | null
}

export interface OwnershipPlan {
  change: OwnershipRow[]
  alreadyOrganizer: number
  noOrganizer: number
  // created_by differs from the organizer but is not a finisher of that requisition: left as it is.
  notAFinisher: number
}

export interface BackfillReport {
  applied: boolean
  plan: OwnershipPlan
}

type Exec = Pick<PoolClient, 'query'>

const companyFilter = `($1::text IS NULL OR co.id::text = $1 OR lower(co.name) = lower($1))`

export async function planOwnership(
  exec: Exec,
  company: string | undefined,
): Promise<OwnershipPlan> {
  const c = company ?? null
  const change = await exec.query<OwnershipRow>(
    `SELECT po.id AS po_id, co.id AS company_id, co.name AS company, po.po_number, r.requisition_number,
            po.status, po.created_by AS old_created_by, ou.email AS old_email,
            r.organizer_id AS new_created_by, nu.email AS new_email
       FROM purchase_orders po
       JOIN requisitions r ON r.id = po.requisition_id AND r.company_id = po.company_id
       JOIN companies co ON co.id = po.company_id
       LEFT JOIN users ou ON ou.id = po.created_by
       LEFT JOIN users nu ON nu.id = r.organizer_id
      WHERE r.organizer_id IS NOT NULL
        AND po.created_by <> r.organizer_id
        AND EXISTS (SELECT 1 FROM requisition_approval_log l
                     WHERE l.requisition_id = r.id AND l.action = 'finish_buying' AND l.actor_id = po.created_by)
        AND ${companyFilter}
      ORDER BY co.name, po.po_number`,
    [c],
  )
  const counts = await exec.query<{ already: string; no_organizer: string; not_finisher: string }>(
    `SELECT count(*) FILTER (WHERE r.organizer_id IS NOT NULL AND po.created_by = r.organizer_id)::text AS already,
            count(*) FILTER (WHERE r.organizer_id IS NULL)::text AS no_organizer,
            count(*) FILTER (WHERE r.organizer_id IS NOT NULL AND po.created_by <> r.organizer_id
                               AND NOT EXISTS (SELECT 1 FROM requisition_approval_log l
                                                WHERE l.requisition_id = r.id AND l.action = 'finish_buying'
                                                  AND l.actor_id = po.created_by))::text AS not_finisher
       FROM purchase_orders po
       JOIN requisitions r ON r.id = po.requisition_id AND r.company_id = po.company_id
       JOIN companies co ON co.id = po.company_id
      WHERE ${companyFilter}`,
    [c],
  )
  const k = counts.rows[0] // an aggregate without GROUP BY always returns exactly one row
  return {
    change: change.rows,
    alreadyOrganizer: parseInt(k.already, 10),
    noOrganizer: parseInt(k.no_organizer, 10),
    notAFinisher: parseInt(k.not_finisher, 10),
  }
}

export async function backfillPoOwnership(opts: BackfillOptions): Promise<BackfillReport> {
  if (!opts.apply) return { applied: false, plan: await planOwnership(pool, opts.company) }
  if (!opts.actorEmail)
    throw new Error('--apply needs --actor-email <the administrator making this change>')
  const actor = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [opts.actorEmail],
  )
  if (!actor.rows[0]) throw new Error(`No user with the email ${opts.actorEmail}`)
  const actorId = actor.rows[0].id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const plan = await planOwnership(client, opts.company)

    if (plan.change.length > 0) {
      // Guarded again in the UPDATE itself, so a PO that changed between the plan and now is skipped, not forced.
      const updated = await client.query(
        `UPDATE purchase_orders po SET created_by = r.organizer_id
           FROM requisitions r
          WHERE po.id = ANY($1::uuid[]) AND r.id = po.requisition_id
            AND r.organizer_id IS NOT NULL AND po.created_by <> r.organizer_id`,
        [plan.change.map((x) => x.po_id)],
      )
      if (updated.rowCount !== plan.change.length)
        throw new Error(
          `Expected to change ${plan.change.length} purchase orders, changed ${updated.rowCount}`,
        )

      // Plain SQL, not logAudit: logAudit swallows its own errors, and a failed insert inside the transaction
      // would turn COMMIT into a silent ROLLBACK while this script printed APPLIED (playbook #48).
      for (const x of plan.change)
        await client.query(
          `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, old_values, new_values)
           VALUES ($1, $2, 'backfill_po_ownership', 'purchase_orders', $3, $4::jsonb, $5::jsonb)`,
          [
            actorId,
            x.company_id,
            x.po_id,
            JSON.stringify({ created_by: x.old_created_by }),
            JSON.stringify({ created_by: x.new_created_by }),
          ],
        )
    }
    await client.query('COMMIT')

    // Read the COMMITTED state on a different connection before saying it worked.
    const committed = await planOwnership(pool, opts.company)
    if (committed.change.length > 0)
      throw new Error(
        `${committed.change.length} purchase orders are still wrong after COMMIT; check the database`,
      )
    if (plan.change.length > 0) {
      const audited = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_log
          WHERE action = 'backfill_po_ownership' AND user_id = $1 AND record_id = ANY($2::uuid[])`,
        [actorId, plan.change.map((x) => x.po_id)],
      )
      if (parseInt(audited.rows[0]?.n ?? '0', 10) < plan.change.length)
        throw new Error('The audit rows are missing after COMMIT; check the database')
    }
    return { applied: true, plan }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

function printReport(r: BackfillReport): void {
  const p = r.plan
  console.log(
    `\nPurchase orders whose created_by becomes the requisition's organizer: ${p.change.length}`,
  )
  const byCompany = new Map<string, number>()
  for (const x of p.change) byCompany.set(x.company, (byCompany.get(x.company) ?? 0) + 1)
  for (const [k, v] of byCompany) console.log(`   ${k.padEnd(28)} ${String(v).padStart(4)}`)
  for (const x of p.change.slice(0, 25))
    console.log(
      `   ${x.po_number.padEnd(17)} ${x.requisition_number.padEnd(14)} ${x.status.padEnd(16)} ${(x.old_email ?? '?').padEnd(30)} -> ${x.new_email ?? '?'}`,
    )
  if (p.change.length > 25) console.log(`   ... and ${p.change.length - 25} more`)
  console.log(`\nAlready the organizer (left as is): ${p.alreadyOrganizer}`)
  console.log(`Requisition has no organizer (nobody to follow, left as is): ${p.noOrganizer}`)
  console.log(`created_by is not a finisher of its requisition (left as is): ${p.notAFinisher}`)
  console.log(
    `\n${r.applied ? 'APPLIED (verified by a second read)' : 'DRY RUN (nothing written)'}` +
      (r.applied ? '' : '. Re-run with --apply --actor-email <admin email> to make the change.'),
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const actorEmail = valueOf('--actor-email')
  const company = valueOf('--company')
  try {
    const report = await backfillPoOwnership({
      apply: args.includes('--apply'),
      ...(actorEmail ? { actorEmail } : {}),
      ...(company ? { company } : {}),
    })
    printReport(report)
    process.exitCode = 0
  } catch (e) {
    console.error(`\nFAILED: ${(e as Error).message}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
  process.exit()
}

// Runs only when started from the command line, never when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
