import type { CodegenConfig } from '@graphql-codegen/cli'

// schema.graphql is extracted from the gateway's own SDL string (see
// scripts/extract-schema.cjs, run automatically by `pnpm codegen`) — no
// running server needed, so generation is deterministic and doesn't depend
// on a live backend. Re-extracted from services/gateway/src/graphql/
// schema.ts's `typeDefs` export each time codegen runs, since graphql-tools'
// schema loader can't load a `.ts:exportName` pointer directly in this
// monorepo's ESM setup.
const config: CodegenConfig = {
  schema: 'schema.graphql',
  documents: [
    'src/graphql/**/*.ts',
    '!src/graphql/_known-broken.ts',
    '!src/graphql/generated.ts',
    '!src/graphql/schema-types.ts',
  ],
  generates: {
    // Split into two files rather than combining `typescript` +
    // `typescript-operations` into one `generates` target: when any
    // operation takes a named `input`/enum GraphQL type as a variable (e.g.
    // `mutation X($input: AccountInput!)` — true for most mutations here),
    // typescript-operations independently redeclares that type in its own
    // output (by design, so its output can stand alone without the schema
    // file) using its own scalar formatting, which collides with
    // typescript's declaration of the same name and produces real
    // `TS2300: Duplicate identifier` errors — @graphql-codegen/core
    // concatenates plugin outputs for one target verbatim, with no
    // content-level dedup. `importSchemaTypesFrom` is the documented way to
    // tell typescript-operations to import the base types instead of
    // redeclaring them.
    'src/graphql/schema-types.ts': {
      plugins: ['typescript'],
      config: {
        skipTypename: true,
        enumsAsTypes: true,
      },
    },
    'src/graphql/generated.ts': {
      plugins: ['typescript-operations'],
      config: {
        skipTypename: true,
        enumsAsTypes: true,
        // Resolved relative to cwd (like `generates` keys and `schema`
        // above), not relative to the output file — a bare './schema-types'
        // produced a wrong '../../schema-types' import in generated.ts.
        importSchemaTypesFrom: './src/graphql/schema-types',
      },
    },
  },
}

export default config
