CREATE TABLE memory_policy (owner_id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, personal_enabled INTEGER NOT NULL DEFAULT 0, extraction TEXT NOT NULL DEFAULT 'local', retention_days INTEGER, epoch INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE memory_jobs (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id), session_id TEXT NOT NULL REFERENCES call_sessions(id), idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_run INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, last_error TEXT, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE memory_job_sources (job_id TEXT NOT NULL REFERENCES memory_jobs(id) ON DELETE CASCADE, turn_id TEXT NOT NULL REFERENCES call_turns(id) ON DELETE CASCADE, PRIMARY KEY (job_id, turn_id), UNIQUE(turn_id));
--> statement-breakpoint
CREATE TABLE memory_facts (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, text TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL, data_class TEXT NOT NULL, permission TEXT NOT NULL DEFAULT 'local-only', version INTEGER NOT NULL DEFAULT 1, fingerprint TEXT NOT NULL, origin TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id, fingerprint));
--> statement-breakpoint
CREATE TABLE memory_fact_sources (fact_id TEXT NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE, turn_id TEXT NOT NULL REFERENCES call_turns(id) ON DELETE CASCADE, evidence TEXT NOT NULL, PRIMARY KEY(fact_id, turn_id));
--> statement-breakpoint
CREATE TABLE memory_entities (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, label TEXT NOT NULL, normalized TEXT NOT NULL, UNIQUE(owner_id, normalized));
--> statement-breakpoint
CREATE TABLE memory_relations (fact_id TEXT PRIMARY KEY NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE, subject_id TEXT NOT NULL REFERENCES memory_entities(id), predicate TEXT NOT NULL, object_id TEXT NOT NULL REFERENCES memory_entities(id));
--> statement-breakpoint
CREATE INDEX memory_relations_object ON memory_relations(object_id);
--> statement-breakpoint
CREATE TABLE memory_summaries (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id), job_id TEXT NOT NULL UNIQUE REFERENCES memory_jobs(id) ON DELETE CASCADE, content TEXT NOT NULL, data_class TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE memory_blocked_turns (owner_id TEXT NOT NULL, turn_id TEXT NOT NULL REFERENCES call_turns(id) ON DELETE CASCADE, reason TEXT NOT NULL, PRIMARY KEY(owner_id, turn_id));
--> statement-breakpoint
CREATE TABLE memory_tombstones (owner_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(owner_id, fingerprint));
--> statement-breakpoint
CREATE INDEX memory_jobs_ready ON memory_jobs(owner_id, status, next_run);
--> statement-breakpoint
CREATE INDEX memory_facts_owner ON memory_facts(owner_id, status, updated_at);
