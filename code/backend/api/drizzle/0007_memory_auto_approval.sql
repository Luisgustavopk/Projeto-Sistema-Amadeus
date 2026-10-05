ALTER TABLE memory_policy ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0 CHECK (auto_approve IN (0, 1));
