// The upload areas of the project tabs (Bidding Stage, Attachments, Preliminary Engineering) rendered
// the raw key "proj.detail.dropZipHereOr" etc. on screen: those <Trans> keys had no text in either
// locale file (playbook #26). This renders the real components, in both languages, and checks the
// text is words, with the highlighted part where the component puts it.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Trans } from 'react-i18next'
import i18n from '../index'

const KEYS = [
  'proj.detail.dropZipHereOr',
  'proj.detail.dropFileOr',
  'proj.detail.dropFileHereOr',
  'proj.detail.willBeTaggedAsExcelPdf',
  'proj.detail.clickToAttachRevisedFile',
] as const

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe.each(['en', 'ar'])('upload area text in %s', (lang) => {
  it.each(KEYS)('%s is real text and keeps its highlighted word', async (key) => {
    await i18n.changeLanguage(lang)
    const values = { t: 'HIGHLIGHT', uploadCategory: 'HIGHLIGHT' }
    render(
      <p>
        <Trans i18nKey={key} values={values} components={[<span data-testid="hl" />]} />
      </p>,
    )
    // Not the raw key, and the highlighted word is inside the <0>…</0> span.
    expect(document.body.textContent).not.toContain('proj.detail')
    expect(screen.getByTestId('hl').textContent).toBe('HIGHLIGHT')
  })
})
