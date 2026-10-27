"""Render the btop theme format from shared colors."""


def btop_theme(colors: dict[str, str]) -> str:
    """Build btop colors with blue/violet graphs and distinct warning colors."""
    roles = {
        "main_bg": "background",
        "main_fg": "foreground",
        "title": "foreground",
        "hi_fg": "accent",
        "selected_bg": "terminal_raised",
        "selected_fg": "foreground",
        "inactive_fg": "subtle",
        "graph_text": "comment",
        "meter_bg": "terminal_surface",
        "proc_misc": "member",
        "cpu_box": "accent",
        "mem_box": "type",
        "net_box": "preprocessor",
        "proc_box": "keyword",
        "div_line": "border",
        "proc_pause_bg": "warning",
        "proc_follow_bg": "terminal_raised",
        "proc_banner_bg": "keyword",
        "proc_banner_fg": "background",
        "followed_bg": "terminal_raised",
        "followed_fg": "foreground",
    }
    gradients = {
        "temp": ("preprocessor", "warning", "error"),
        "cpu": ("type", "keyword", "error"),
        "free": ("added", "preprocessor", "member"),
        "cached": ("member", "type", "keyword"),
        "available": ("added", "preprocessor", "type"),
        "used": ("type", "keyword", "error"),
        "download": ("preprocessor", "member", "type"),
        "upload": ("function", "keyword", "constant"),
        "process": ("type", "keyword", "error"),
    }
    for metric, gradient in gradients.items():
        roles.update(
            {
                f"{metric}_{position}": role
                for position, role in zip(("start", "mid", "end"), gradient)
            }
        )
    lines = ["# Iris Nocturne dark. Generated from palette.json."]
    lines.extend(
        f'theme[{key}]="{colors[role]}"' for key, role in roles.items()
    )
    return "\n".join(lines) + "\n"

