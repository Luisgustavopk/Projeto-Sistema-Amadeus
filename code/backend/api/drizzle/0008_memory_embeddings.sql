CREATE TABLE memory_embeddings (
  fact_id TEXT PRIMARY KEY NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  fact_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  vector TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER memory_embeddings_invalidate AFTER UPDATE ON memory_facts
BEGIN
  DELETE FROM memory_embeddings WHERE fact_id = NEW.id;
END;
