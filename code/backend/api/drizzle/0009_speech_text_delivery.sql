ALTER TABLE speech_segments ADD COLUMN text_sent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE speech_segments SET text_sent = 1 WHERE sample_count > 0;
