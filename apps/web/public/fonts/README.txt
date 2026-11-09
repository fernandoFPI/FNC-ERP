Inter, STATIC instances (regular 400, medium 500, semibold 600, bold 700), latin and latin-ext subsets, woff2.
Source: the @fontsource/inter 5.0.19 package (Inter 4.0 by The Inter Project Authors, SIL Open Font License 1.1, see Inter-OFL.txt).

Why static and self-hosted: the printed invoice used Inter from Google Fonts, which is a VARIABLE font. Chrome cannot embed a
variable font in a PDF, so it writes the text as Type 3 fonts, split into a separate run at every space and punctuation mark.
PDF programs that re-flow text then misplace glyphs at those switches (the invoice number "NY-INV-2026-0005" printed with
the "Y-I" overlapping). A static font is embedded as a real font and the text stays in one piece. See docs/claude/playbook.md #68.

Used by apps/web/src/lib/documentFonts.ts. Do not replace these files with a variable font.
