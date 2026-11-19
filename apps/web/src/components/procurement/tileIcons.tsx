// The two icons of the "Apply to all items" tiles. Drawn in the current text colour, so the tile decides the colour.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** A shop front: the vendor. */
export function VendorTileIcon() {
  return (
    <svg {...base}>
      <path d="M4 9l1.5-5h13L20 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M4 9a3 3 0 0 0 5 2 3 3 0 0 0 6 0 3 3 0 0 0 5-2" />
    </svg>
  )
}

/** A till receipt: the receipt. */
export function ReceiptTileIcon() {
  return (
    <svg {...base}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}
