CREATE TABLE IF NOT EXISTS voice_profiles (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, reference_file TEXT NOT NULL, reference_sha256 TEXT NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS voice_profiles_active ON voice_profiles(owner_id) WHERE active = 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS call_sessions (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id), owner_id TEXT NOT NULL, voice_profile_id TEXT REFERENCES voice_profiles(id), started_at INTEGER NOT NULL, ended_at INTEGER, state TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS call_turns (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES call_sessions(id), conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id), client_turn_id INTEGER NOT NULL, response_id TEXT NOT NULL UNIQUE, data_class TEXT NOT NULL, user_text TEXT NOT NULL DEFAULT '', generated_text TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER, UNIQUE(session_id, client_turn_id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS call_turns_conversation ON call_turns(conversation_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS speech_segments (id TEXT PRIMARY KEY NOT NULL, response_id TEXT NOT NULL REFERENCES call_turns(response_id), position INTEGER NOT NULL, text TEXT NOT NULL, sample_count INTEGER NOT NULL DEFAULT 0, played_samples INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, UNIQUE(response_id, position));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS memory_work_pending (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES foundation_conversations(id), session_id TEXT NOT NULL UNIQUE REFERENCES call_sessions(id), status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
