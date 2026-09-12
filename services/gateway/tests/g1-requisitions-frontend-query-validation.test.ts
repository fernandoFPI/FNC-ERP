// G1 Phase 3 Milestone A — every GraphQL document apps/web/src/graphql/
// requisitions.ts exports, statically validated against this gateway's own
// schema. Exists because the frontend's own component tests mock useQuery/
// useMutation entirely (necessarily — they're testing rendering logic, not
// wiring), so a query selecting a field that doesn't actually exist on the
// schema (e.g. `line_number` on POLine — a real bug this exact check would
// have caught immediately, found instead by manual click-through) sails
// through every other check: tsc --noEmit doesn't touch gql`` template
// contents, and a mocked useQuery never asks the real schema whether the
// selection is even valid.
import { describe, it, expect } from 'vitest'
import { buildASTSchema, parse, validate, type DocumentNode } from 'graphql'
import { typeDefs } from '../src/graphql/schema.js'
import * as requisitionDocs from '../../../apps/web/src/graphql/requisitions.js'

const schema = buildASTSchema(parse(typeDefs), { assumeValidSDL: true })

function isDocumentNode(value: unknown): value is DocumentNode {
  return !!value && typeof value === 'object' && (value as { kind?: string }).kind === 'Document'
}

describe('frontend GraphQL documents (requisitions.ts) validate against the gateway schema', () => {
  const entries = Object.entries(requisitionDocs).filter(([, v]) => isDocumentNode(v))

  it('found at least the documents this file is expected to export (sanity check the import itself worked)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15)
  })

  for (const [name, doc] of entries) {
    it(`${name} selects only real fields/args on the schema`, () => {
      const errors = validate(schema, doc as DocumentNode)
      expect(errors.map((e) => e.message)).toEqual([])
    })
  }
})
