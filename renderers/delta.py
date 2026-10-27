"""Render the delta theme format from shared colors."""


def delta_feature(colors: dict[str, str]) -> str:
    """Build a delta feature that uses bat's installed TextMate theme."""
    c = colors
    styles = {
        "minus-style": f"syntax {c['diff_delete']}",
        "minus-emph-style": f"bold syntax {c['diff_delete_emphasis']}",
        "plus-style": f"syntax {c['diff_add']}",
        "plus-emph-style": f"bold syntax {c['diff_add_emphasis']}",
        "minus-empty-line-marker-style": f"normal {c['diff_delete']}",
        "plus-empty-line-marker-style": f"normal {c['diff_add']}",
        "zero-style": "syntax",
        "line-numbers-minus-style": c["deleted"],
        "line-numbers-plus-style": c["added"],
        "line-numbers-zero-style": c["subtle"],
        "line-numbers-left-style": c["subtle"],
        "line-numbers-right-style": c["subtle"],
        "file-style": f"bold {c['type']}",
        "file-decoration-style": f"underline {c['border']}",
        "hunk-header-style": "line-number syntax",
        "hunk-header-decoration-style": f"box {c['border']}",
        "commit-style": f"bold {c['keyword']}",
        "commit-decoration-style": "none",
        "whitespace-error-style": f"reverse {c['error']}",
        "grep-file-style": c["member"],
        "grep-line-number-style": c["subtle"],
        "grep-match-line-style": f"syntax {c['diff_add']}",
        "grep-match-word-style": f"syntax {c['diff_add_emphasis']}",
        "blame-palette": " ".join(
            (c["terminal_surface"], c["terminal_blame_cool"], c["terminal_blame_warm"])
        ),
    }
    lines = [
        "# Iris Nocturne dark. Install the bat TextMate theme first.",
        '[delta "iris-nocturne"]',
        "    dark = true",
        "    syntax-theme = iris-nocturne",
    ]
    lines.extend(f'    {key} = "{value}"' for key, value in styles.items())
    return "\n".join(lines) + "\n"

