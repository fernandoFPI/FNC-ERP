-- 100: Bank Reconciliation
-- Uses recon_ prefix to avoid conflicts with the existing bank_accounts (invoice payee) table.
-- recon_bank_accounts = company's own bank accounts (for reconciling)
-- recon_statements    = monthly bank statements
-- recon_lines         = individual statement transactions
-- recon_matches       = links between statement lines and GL journal lines

CREATE TABLE recon_bank_accounts (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID          NOT NULL,
  name                    VARCHAR(255)  NOT NULL,
  account_number          VARCHAR(100),
  bank_name               VARCHAR(255),
  branch                  VARCHAR(255),
  swift_code              VARCHAR(20),
  iban                    VARCHAR(50),
  currency_code           VARCHAR(3)    NOT NULL DEFAULT 'IQD',
  gl_account_id           UUID,
  opening_balance         NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_active               BOOLEAN       NOT NULL DEFAULT true,
  last_reconciled_date    DATE,
  last_reconciled_balance NUMERIC(18,2),
  notes                   TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE recon_statements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID          NOT NULL,
  bank_account_id UUID          NOT NULL REFERENCES recon_bank_accounts(id) ON DELETE RESTRICT,
  period          VARCHAR(7)    NOT NULL,
  statement_date  DATE          NOT NULL,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,2) NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_progress','reconciled')),
  reconciled_at   TIMESTAMPTZ,
  reconciled_by   UUID,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(bank_account_id, period)
);

CREATE TABLE recon_lines (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id     UUID          NOT NULL REFERENCES recon_statements(id) ON DELETE CASCADE,
  company_id       UUID          NOT NULL,
  line_number      INTEGER       NOT NULL DEFAULT 1,
  transaction_date DATE          NOT NULL,
  value_date       DATE,
  description      TEXT          NOT NULL,
  reference        VARCHAR(255),
  debit            NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_after    NUMERIC(18,2),
  is_reconciled    BOOLEAN       NOT NULL DEFAULT false,
  reconciled_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE recon_matches (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL,
  statement_line_id UUID        NOT NULL REFERENCES recon_lines(id) ON DELETE CASCADE,
  journal_line_id   UUID,
  journal_entry_id  UUID,
  match_type        VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (match_type IN ('manual','auto','created')),
  notes             TEXT,
  matched_by        UUID,
  matched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_accounts_company  ON recon_bank_accounts(company_id);
CREATE INDEX idx_recon_stmts_account     ON recon_statements(bank_account_id);
CREATE INDEX idx_recon_stmts_company     ON recon_statements(company_id, period);
CREATE INDEX idx_recon_lines_statement   ON recon_lines(statement_id);
CREATE INDEX idx_recon_lines_reconciled  ON recon_lines(statement_id, is_reconciled);
CREATE INDEX idx_recon_matches_line      ON recon_matches(statement_line_id);
CREATE INDEX idx_recon_matches_jl        ON recon_matches(journal_line_id);
