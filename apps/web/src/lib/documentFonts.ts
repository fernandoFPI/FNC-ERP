// Inter for printed documents (invoices), as STATIC fonts served from our own site (apps/web/public/fonts).
//
// Why not Google Fonts: it serves Inter as a VARIABLE font, and Chrome cannot embed a variable font in a PDF. It writes
// the text as Type 3 fonts instead, split into a separate run at every space and punctuation mark (the payment line of
// an invoice came out as 32 pieces, and a PDF of one invoice held 29 to 98 Type 3 fonts). A PDF program that re-flows
// text then misplaces glyphs at those switches: the invoice number "NY-INV-2026-0005" printed with the "Y-I" on top of
// each other. A static font is embedded as a real font, the line stays one piece of text, and the file is about 4 times
// smaller. The letters are the same Inter: page breaks were identical for 1 to 30 rows, and line widths differed by
// under 1.4 pt (playbook #68).
//
// The files are the latin and latin-ext subsets (latin-ext carries the Kurdish and Turkish letters such as the s with a
// cedilla); the browser downloads a subset only when a character in its range is used. Anything else (Arabic, Greek,
// Cyrillic, arrows) falls back to Arial, exactly as before.
//
// The URL is root-relative: an iframe given srcDoc, and a document written into a new window, both resolve it against the
// app's own address. Keep the files in apps/web/public/fonts, with the same names (a test checks they exist).

export const INTER_WEIGHTS = [400, 500, 600, 700] as const

// Same ranges Google Fonts uses for these two subsets.
export const INTER_SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const

export const INTER_FONT_DIR = '/fonts/'

export function interFontFile(subset: keyof typeof INTER_SUBSETS, weight: number): string {
  return `inter-${subset}-${weight}-normal.woff2`
}

// The @font-face rules to put inside a document's <style>. Latin-ext first so that latin wins where they overlap.
export const INTER_FONT_FACES: string = (
  Object.keys(INTER_SUBSETS) as (keyof typeof INTER_SUBSETS)[]
)
  .slice()
  .reverse()
  .flatMap((subset) =>
    INTER_WEIGHTS.map(
      (weight) =>
        `@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${weight}; font-display: swap; ` +
        `src: url('${INTER_FONT_DIR}${interFontFile(subset, weight)}') format('woff2'); unicode-range: ${INTER_SUBSETS[subset]}; }`,
    ),
  )
  .join('\n    ')
