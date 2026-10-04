import re
import unicodedata


def words(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFC", text).casefold())


def word_error_rate(reference, hypothesis):
    expected, actual = words(reference), words(hypothesis)
    if not expected:
        raise ValueError("Expected transcript must contain words")
    rows = [list(range(len(actual) + 1))]
    for i, expected_word in enumerate(expected, 1):
        row = [i]
        for j, actual_word in enumerate(actual, 1):
            row.append(
                min(
                    rows[-1][j] + 1,
                    row[-1] + 1,
                    rows[-1][j - 1] + (expected_word != actual_word),
                )
            )
        rows.append(row)
    errors = rows[-1][-1]
    return {
        "referenceWords": len(expected),
        "wordErrors": errors,
        "wer": errors / len(expected),
    }
