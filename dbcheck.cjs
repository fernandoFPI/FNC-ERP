const pg = require('pg')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
client.connect().then(async () => {
  const proj = await client.query("SELECT id, name, code, status, budget_amount, budget_currency, company_id FROM projects WHERE id = $1", ['30000000-0000-0000-0000-000000000001'])
  console.log('PROJECT:', JSON.stringify(proj.rows))
  if (proj.rows[0]) {
    const cid = proj.rows[0].company_id
    const vendors = await client.query("SELECT id, name FROM vendors WHERE company_id = $1 LIMIT 5", [cid])
    console.log('VENDORS:', JSON.stringify(vendors.rows))
    const emps = await client.query("SELECT e.id, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.company_id = $1 LIMIT 5", [cid])
    console.log('EMPLOYEES:', JSON.stringify(emps.rows))
    const poCheck = await client.query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE project_id = $1", ['30000000-0000-0000-0000-000000000001'])
    console.log('EXISTING POs on project:', poCheck.rows[0].cnt)
    const allPO = await client.query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE company_id = $1", [cid])
    console.log('TOTAL POs in company:', allPO.rows[0].cnt)
  }
  await client.end()
}).catch(e => { console.error(e.message); process.exit(1) })
