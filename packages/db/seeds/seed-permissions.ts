import { query } from '../src/index.js'
import { ALL_PERMISSIONS, PERMISSION_REGISTRY } from '../../permissions/src/registry.js'

async function seedPermissions(): Promise<void> {
  console.log('[seed-permissions] Upserting permissions registry...')

  let inserted = 0
  let skipped = 0

  for (const perm of ALL_PERMISSIONS) {
    // Derive module / submodule from the key (format: module.submodule.action)
    const parts = perm.key.split('.')
    const module = parts[0]
    const submodule = parts[1]
    const action = parts.slice(2).join('.')

    const result = await query(
      `INSERT INTO permissions (key, module, submodule, action, label, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE
         SET label = EXCLUDED.label,
             sort_order = EXCLUDED.sort_order`,
      [perm.key, module, submodule, action, perm.label, perm.sortOrder],
    )

    if ((result.rowCount ?? 0) > 0) inserted++
    else skipped++
  }

  console.log(`[seed-permissions] Done. ${inserted} upserted, ${skipped} skipped`)
  console.log(`[seed-permissions] Total permissions in registry: ${ALL_PERMISSIONS.length}`)

  // Seed system role templates
  await seedRoleTemplates()
}

async function seedRoleTemplates(): Promise<void> {
  console.log('[seed-permissions] Seeding role templates...')

  const templates: Array<{
    name: string
    description: string
    permissions: Array<{ key: string; level: string }>
  }> = [
    {
      name: 'Read Only',
      description: 'Can view all modules but cannot make changes',
      permissions: ALL_PERMISSIONS
        .filter((p) => p.key.endsWith('.view') || p.key.endsWith('.export'))
        .map((p) => ({ key: p.key, level: 'view' })),
    },
    {
      name: 'Project Manager',
      description: 'Full access to Projects module; view-only finance and reporting',
      permissions: [
        ...PERMISSION_REGISTRY.find((m) => m.key === 'projects')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: p.key.includes('.approve') || p.key.includes('.issue') || p.key.includes('.void') ? 'approve' : 'edit' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'finance')!
          .submodules.find((s) => s.key === 'reports')!
          .permissions.map((p) => ({ key: p.key, level: 'view' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'reporting')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'view' })),
      ],
    },
    {
      name: 'Finance Officer',
      description: 'Full access to Finance module; view-only projects and reporting',
      permissions: [
        ...PERMISSION_REGISTRY.find((m) => m.key === 'finance')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'approve' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'projects')!
          .submodules.find((s) => s.key === 'invoices')!
          .permissions.map((p) => ({ key: p.key, level: 'view' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'reporting')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'view' })),
      ],
    },
    {
      name: 'Operations Manager',
      description: 'Full access to Manufacturing and Rental; view-only others',
      permissions: [
        ...PERMISSION_REGISTRY.find((m) => m.key === 'manufacturing')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'approve' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'rental')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'approve' })),
        ...PERMISSION_REGISTRY.find((m) => m.key === 'reporting')!
          .submodules.flatMap((s) => s.permissions)
          .map((p) => ({ key: p.key, level: 'view' })),
      ],
    },
  ]

  for (const tmpl of templates) {
    // Upsert the template
    const tmplResult = await query<{ id: string }>(
      `INSERT INTO role_templates (name, description, is_system)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO UPDATE
         SET description = EXCLUDED.description
       RETURNING id`,
      [tmpl.name, tmpl.description],
    )
    const templateId = tmplResult.rows[0]?.id
    if (!templateId) continue

    // Clear existing permissions for idempotent re-run
    await query(`DELETE FROM role_template_permissions WHERE template_id = $1`, [templateId])

    // Insert template permissions
    for (const perm of tmpl.permissions) {
      // Skip if permission key doesn't exist in registry (safety check)
      const exists = await query(
        `SELECT 1 FROM permissions WHERE key = $1`,
        [perm.key],
      )
      if ((exists.rowCount ?? 0) === 0) continue

      await query(
        `INSERT INTO role_template_permissions (template_id, permission_key, access_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (template_id, permission_key) DO UPDATE
           SET access_level = EXCLUDED.access_level`,
        [templateId, perm.key, perm.level],
      )
    }

    console.log(`[seed-permissions]   Template "${tmpl.name}" seeded with ${tmpl.permissions.length} permissions`)
  }
}

seedPermissions()
  .then(() => {
    console.log('[seed-permissions] Complete')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[seed-permissions] Failed:', err)
    process.exit(1)
  })
