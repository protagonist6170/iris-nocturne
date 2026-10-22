"""Render the claude theme format from shared colors."""

import json


def claude_theme(colors: dict[str, str], ansi: list[str]) -> str:
    """Override documented Claude Code UI tokens on the built-in dark base."""
    roles = {
        "claude": "accent",
        "permission": "accent",
        "text": "foreground",
        "inverseText": "background",
        "inactive": "muted",
        "subtle": "comment",
        "suggestion": "member",
        "ide": "member",
        "briefLabelYou": "member",
        "remember": "keyword",
        "merged": "keyword",
        "effortUltra": "keyword",
        "success": "added",
        "autoAccept": "added",
        "error": "error",
        "warning": "warning",
        "bashBorder": "warning",
        "promptBorder": "terminal_border",
        "planMode": "preprocessor",
        "fastMode": "string",
        "diffAdded": "diff_add",
        "diffRemoved": "diff_delete",
        "diffAddedWord": "diff_add_emphasis",
        "diffRemovedWord": "diff_delete_emphasis",
        "diffAddedDimmed": "terminal_surface",
        "diffRemovedDimmed": "terminal_surface",
        "userMessageBackground": "terminal_surface",
        "bashMessageBackgroundColor": "terminal_surface",
        "memoryBackgroundColor": "terminal_surface",
        "composerSidebarBackground": "terminal_surface",
        "userMessageBackgroundHover": "terminal_raised",
        "selectionBg": "terminal_selection",
        "rate_limit_fill": "accent",
        "rate_limit_empty": "border",
        "briefLabelClaude": "accent",
        "claudeShimmer": "keyword",
        "permissionShimmer": "keyword",
        "promptBorderShimmer": "keyword",
        "fastModeShimmer": "keyword",
        "inactiveShimmer": "foreground",
    }
    overrides = {token: colors[role] for token, role in roles.items()}
    overrides["warningShimmer"] = ansi[11]  # ANSI bright yellow.
    return (
        json.dumps(
            {
                "name": "Iris Nocturne",
                "base": "dark",
                "overrides": overrides,
            },
            indent=2,
        )
        + "\n"
    )

