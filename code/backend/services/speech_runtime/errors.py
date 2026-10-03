"""Expected inference outcomes, independent of HTTP transport."""


class NoSpeechDetected(ValueError):
    """The audio is valid but contains no recognizable speech."""
