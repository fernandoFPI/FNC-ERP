-- Migration 072: Add missing close_notes and closed_at to rental_contracts
ALTER TABLE rental_contracts
  ADD COLUMN IF NOT EXISTS close_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ;
