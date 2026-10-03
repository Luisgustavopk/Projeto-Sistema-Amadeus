CREATE TABLE foundation_conversations (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX foundation_conversations_owner ON foundation_conversations(owner_id);
--> statement-breakpoint
CREATE TABLE foundation_tickets (hash TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id) ON DELETE CASCADE, owner_id TEXT NOT NULL, credential_hash TEXT NOT NULL, origin TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
--> statement-breakpoint
CREATE INDEX foundation_tickets_expiry ON foundation_tickets(expires_at);
--> statement-breakpoint
CREATE TABLE foundation_provider_config (owner_id TEXT PRIMARY KEY NOT NULL, config_json TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE foundation_usage (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL, provider_key TEXT NOT NULL, day TEXT NOT NULL, reserved_tokens INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER, state TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX foundation_usage_scope ON foundation_usage(owner_id, role, provider_key, day);
