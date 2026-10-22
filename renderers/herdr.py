"""Render the herdr theme format from shared colors."""


def herdr_colors(colors: dict[str, str]) -> str:
    """Override supported herdr tokens without changing non-theme settings."""
    roles = {
        "panel_bg": "terminal_surface",
        "sidebar_bg": "reset",
        "active_row_bg": "terminal_raised",
        "selection_bg": "terminal_selection",
        "surface0": "terminal_raised",
        "surface1": "terminal_border",
        "surface_dim": "terminal_surface",
        "overlay0": "comment",
        "overlay1": "comment",
        "text": "foreground",
        "subtext0": "muted",
        "accent": "accent",
        "mauve": "keyword",
        "green": "added",
        "yellow": "warning",
        "red": "error",
        "blue": "type",
        "teal": "preprocessor",
        "peach": "string",
    }
    lines = ["[theme.custom]"]
    for key, role in roles.items():
        value = "reset" if role == "reset" else colors[role]
        lines.append(f'{key} = "{value}"  # {role}')
    return "\n".join(lines) + "\n"

