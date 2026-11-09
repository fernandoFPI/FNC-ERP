-- A unit of measure on every project invoice line (Ea, M, Lot, Roll, Set, Box, Kg, L, Pack, Pair, Day ...), printed in a
-- Unit column right after Qty.
--
-- NULL means "never set": every line made before this migration (189 on production, all typed by hand, none taken from a
-- source record that could say its unit). They are not guessed at and print as a dash. The application offers a list of
-- units but accepts any text up to 20 characters, so there is no CHECK against a fixed list (a list kept in two places
-- would drift); the only database rule is that a unit is either NULL or has some text in it.
ALTER TABLE project_invoice_lines
  ADD COLUMN IF NOT EXISTS uom VARCHAR(20);

ALTER TABLE project_invoice_lines
  ADD CONSTRAINT project_invoice_lines_uom_not_blank
  CHECK (uom IS NULL OR btrim(uom) <> '');
