ALTER TABLE memory_facts ADD COLUMN equivalence_key TEXT;
--> statement-breakpoint
CREATE INDEX memory_facts_equivalence ON memory_facts(owner_id, equivalence_key, data_class);
