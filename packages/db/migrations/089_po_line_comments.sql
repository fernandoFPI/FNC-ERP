-- PO line-level comments
CREATE TABLE po_line_comments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_line_id     UUID NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  po_id          UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  comment        TEXT NOT NULL,
  created_by_name VARCHAR(200) NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_line_comments_line ON po_line_comments(po_line_id);
CREATE INDEX idx_po_line_comments_po   ON po_line_comments(po_id);

-- Backfill one "item added" comment per existing line
INSERT INTO po_line_comments (po_line_id, po_id, comment, created_by_name, created_at)
SELECT
  pl.id,
  pl.po_id,
  'item added',
  COALESCE(u.first_name || ' ' || u.last_name, u.email, 'System'),
  po.created_at
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id
LEFT JOIN users u ON u.id = po.created_by;
