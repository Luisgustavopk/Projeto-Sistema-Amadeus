ALTER TABLE memory_facts ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE memory_summaries ADD COLUMN permission TEXT NOT NULL DEFAULT 'local-only';
--> statement-breakpoint
ALTER TABLE memory_summaries ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE memory_resumptions (session_id TEXT PRIMARY KEY NOT NULL REFERENCES call_sessions(id), previous_session_id TEXT REFERENCES call_sessions(id) ON DELETE SET NULL, last_client_seq INTEGER NOT NULL, created_at INTEGER NOT NULL);
