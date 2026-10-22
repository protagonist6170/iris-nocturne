"""Render the textmate theme format from shared colors."""

import plistlib

import theme_source


def textmate_theme(
    colors: dict[str, str], rules: list[theme_source.TokenRule]
) -> bytes:
    """Serialize shared syntax rules with the TextMate default colors."""
    defaults = {
        "background": colors["background"],
        "foreground": colors["foreground"],
        "caret": colors["accent"],
        "selection": colors["selection"],
        "selectionForeground": colors["foreground"],
        "lineHighlight": colors["line"],
        "invisibles": colors["subtle"],
        "gutter": colors["background"],
        "gutterForeground": colors["subtle"],
        "findHighlight": colors["search"],
        "findHighlightForeground": colors["foreground"],
    }
    settings = [{"settings": defaults}, *rules]
    return plistlib.dumps(
        {
            "name": "Iris Nocturne",
            "author": "Protagonist",
            "settings": settings,
        },
        sort_keys=False,
    )

