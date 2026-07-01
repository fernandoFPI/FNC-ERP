import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Delete PO child records first (no CASCADE on these FKs)
    await client.query(`
      DELETE FROM po_receipt_lines
      WHERE po_line_id IN (
        SELECT pl.id FROM po_lines pl
        JOIN purchase_orders po ON po.id = pl.po_id
        WHERE po.po_number NOT IN ('PO-1781771509405','PO-1781602144650','PO-1781436605322')
      )`)

    await client.query(`
      DELETE FROM po_receipts
      WHERE po_id IN (
        SELECT id FROM purchase_orders
        WHERE po_number NOT IN ('PO-1781771509405','PO-1781602144650','PO-1781436605322')
      )`)

    await client.query(`
      DELETE FROM po_lines
      WHERE po_id IN (
        SELECT id FROM purchase_orders
        WHERE po_number NOT IN ('PO-1781771509405','PO-1781602144650','PO-1781436605322')
      )`)

    const poResult = await client.query(
      `DELETE FROM purchase_orders
       WHERE po_number NOT IN ('PO-1781771509405','PO-1781602144650','PO-1781436605322')
       RETURNING po_number`,
    )

    // Null out nullable project_id FKs on tables without ON DELETE CASCADE
    const toDelete = `SELECT id FROM projects WHERE code NOT IN ('BA-3437-2021','PRJ-31142397')`
    await client.query(`UPDATE rental_contracts             SET project_id = NULL        WHERE project_id        IN (${toDelete})`)
    await client.query(`UPDATE manufacturing_orders         SET project_id = NULL        WHERE project_id        IN (${toDelete})`)
    await client.query(`UPDATE purchase_orders              SET linked_project_id = NULL WHERE linked_project_id IN (${toDelete})`)
    await client.query(`UPDATE equipment_usage_logs         SET project_id = NULL        WHERE project_id        IN (${toDelete})`)
    await client.query(`UPDATE equipment_location_history   SET project_id = NULL        WHERE project_id        IN (${toDelete})`)
    await client.query(`UPDATE equipment_condition_reports  SET project_id = NULL        WHERE project_id        IN (${toDelete})`)

    // Delete rows where project_id is NOT NULL without CASCADE
    await client.query(`DELETE FROM manufacturing_requests WHERE project_id IN (${toDelete})`)

    const projResult = await client.query(
      `DELETE FROM projects
       WHERE code NOT IN ('BA-3437-2021','PRJ-31142397')
       RETURNING code`,
    )

    await client.query('COMMIT')

    console.log(`Deleted ${poResult.rowCount} purchase orders:`, poResult.rows.map((r: { po_number: string }) => r.po_number))
    console.log(`Deleted ${projResult.rowCount} projects:`, projResult.rows.map((r: { code: string }) => r.code))
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error, rolled back:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
