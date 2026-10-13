"""Spot risky events, so the farm can warn about them.

Watch only: this never blocks Claude. The server just adds
"danger": true and a short "reason" to the event before sending it on.
"""

import os
import re

# (pattern, reason) - a pattern is a regular expression: a small
# search language. \b means "start or end of a word", \s+ "one or more
# spaces", [a-z]* "any letters, or none", and (a|b) "a or b".
COMMAND_RULES = [
    (r"\brm\s+-[a-z]*(r[a-z]*f|f[a-z]*r)", "Deletes files for good"),
    (r"\bgit\s+push\b.*(--force|\s-f\b)", "Overwrites history on GitHub"),
    (r"\bgit\s+reset\s+--hard\b", "Throws away uncommitted changes"),
    (r"\bchmod\s+(-R\s+)?777\b", "Lets anyone change the file"),
    (r"\b(curl|wget)\b.*\|\s*(sudo\s+)?(sh|bash|zsh)\b", "Runs a script from the internet"),
    (r"\bsudo\b", "Runs with admin rights"),  # last: the first rule that matches wins
]


def is_env_file(path):
    """.env, .env.local, config/.env ... -> True"""
    name = os.path.basename(path)
    return name == ".env" or name.startswith(".env.")


def find_danger(event):
    """Return a short reason if the event looks risky, or None if it is fine."""
    if event.file and is_env_file(event.file):
        if event.action == "edit":
            return "Changes secret settings"
        if event.action == "read":
            return "Reads secret settings"

    if event.command:
        for pattern, reason in COMMAND_RULES:
            if re.search(pattern, event.command, re.IGNORECASE):
                return reason

    return None
