const pg = require('c:\\Users\\PC\\OneDrive - Farage Printing Industries\\Desktop\\FNC ERP\\node_modules\\.pnpm\\pg@8.21.0\\node_modules\\pg')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
client.connect().then(async () => {
  for (const t of ['po_approval_log', 'po_receipts', 'po_receipt_lines', 'po_lines']) {
    const r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position", [t])
    console.log(t + ':', r.rows.map(x => x.column_name).join(', '))
  }
  await client.end()
}).catch(function(e){ console.error('ERR:', e.message); process.exit(1) })
