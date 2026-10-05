ALTER TABLE memory_facts ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact';
--> statement-breakpoint
ALTER TABLE memory_facts ADD COLUMN expires_at INTEGER;
--> statement-breakpoint
ALTER TABLE memory_facts ADD COLUMN supersedes_id TEXT REFERENCES memory_facts(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE memory_facts ADD COLUMN supersedes_version INTEGER;
--> statement-breakpoint
CREATE INDEX memory_facts_expiration ON memory_facts(owner_id, expires_at);
