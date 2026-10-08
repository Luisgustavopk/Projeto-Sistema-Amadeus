CREATE TABLE persona_reference_documents (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('style', 'lore', 'lore-source')),
  reviewed INTEGER NOT NULL CHECK (reviewed IN (0, 1)),
  payload TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE persona_reference_embeddings (
  reference_id TEXT NOT NULL REFERENCES persona_reference_documents(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector TEXT NOT NULL,
  PRIMARY KEY (reference_id, model_key)
);
