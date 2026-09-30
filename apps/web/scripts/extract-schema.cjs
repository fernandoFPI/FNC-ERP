// graphql-codegen (this version, in this monorepo's ESM setup) can't load a
// schema pointer of the form "*.ts:exportName" — @graphql-tools/load's
// pointer resolution doesn't transpile .ts on the fly the way the codegen
// config file itself does. Rather than fight that, extract the gateway's
// typeDefs SDL string to a static .graphql file codegen can just read.
// Re-run whenever services/gateway/src/graphql/schema.ts changes (this
// script is also chained automatically before `pnpm codegen`).
const fs = require('fs')
const path = require('path')

const schemaTsPath = path.join(__dirname, '../../../services/gateway/src/graphql/schema.ts')
const outPath = path.join(__dirname, '../schema.graphql')

const src = fs.readFileSync(schemaTsPath, 'utf8')
const match = /export const typeDefs = `([\s\S]*)`\s*$/.exec(src)
if (!match) {
  console.error('extract-schema: could not find `export const typeDefs = \\`...\\`` in schema.ts')
  process.exit(1)
}

fs.writeFileSync(outPath, match[1], 'utf8')
console.log(`extract-schema: wrote ${outPath}`)
