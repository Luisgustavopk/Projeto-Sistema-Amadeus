ALTER TABLE call_turns ADD COLUMN initiative_kind TEXT DEFAULT NULL CHECK (initiative_kind IS NULL OR initiative_kind IN ('greeting', 'initiative'));
