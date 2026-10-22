"""Render the starship theme format from shared colors."""


def starship_palette(colors: dict[str, str], ansi: list[str]) -> str:
    """Build only colors, retaining the user's prompt and module settings."""
    ansi_names = (
        "black",
        "red",
        "green",
        "yellow",
        "blue",
        "purple",
        "cyan",
        "white",
        "bright-black",
        "bright-red",
        "bright-green",
        "bright-yellow",
        "bright-blue",
        "bright-purple",
        "bright-cyan",
        "bright-white",
    )
    aliases = {
        "mauve": "keyword",
        "lavender": "function",
        "pink": "constant",
        "peach": "string",
        "rosewater": "string",
        "maroon": "number",
        "flamingo": "number",
        "teal": "preprocessor",
        "sky": "member",
        "sapphire": "type",
        "base": "background",
        "crust": "background",
        "mantle": "surface",
        "surface0": "raised",
        "surface1": "border",
        "surface2": "selection",
        "overlay0": "subtle",
        "overlay1": "comment",
        "overlay2": "muted",
        "subtext0": "comment",
        "subtext1": "muted",
        "text": "foreground",
    }
    lines = [
        "[palettes.iris-nocturne]",
        "# Shared semantic colors.",
    ]
    lines.extend(f'{key} = "{value}"' for key, value in colors.items())
    lines.extend(["", "# ANSI 0-15, shared with the terminal theme."])
    lines.extend(
        f'{key} = "{value}"  # ansi[{index}]'
        for index, (key, value) in enumerate(zip(ansi_names, ansi, strict=True))
    )
    lines.extend(
        [
            f'magenta = "{ansi[5]}"  # ansi[5], alias of purple',
            f'bright-magenta = "{ansi[13]}"'
            "  # ansi[13], alias of bright-purple",
            "",
            "# Compatibility aliases for existing Catppuccin style strings.",
        ]
    )
    lines.extend(
        f'{key} = "{colors[role]}"  # {role}' for key, role in aliases.items()
    )
    return "\n".join(lines) + "\n"

