-- migration 032: add notification_preferences column to users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}';
