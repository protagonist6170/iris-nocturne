"""Load shared dark inputs and resolve syntax rules for native renderers."""

import json
import pathlib
import re
import tomllib
import unicodedata
from typing import TypedDict

THEME_DIR = pathlib.Path(__file__).resolve().parent


def _is_icon_glyph(value: object) -> bool:
    """Accept one printable character, including Nerd Font private-use icons."""
    return (
        isinstance(value, str)
        and len(value) == 1
        and (value.isprintable() or unicodedata.category(value) == "Co")
    )


def load_lsd_icons() -> dict[str, dict[str, str]]:
    """Load pinned lsd fallback keys and approved Yazi glyph overrides."""
    icons = tomllib.loads(
        (THEME_DIR / "assets/lsd-icons.toml").read_text(encoding="utf-8")
    )
    yazi_icons = tomllib.loads(
        (THEME_DIR / "assets/yazi-icons.toml").read_text(encoding="utf-8")
    )
    if set(icons) != {"name", "extension"}:
        raise ValueError(
            "lsd icon input requires only name and extension tables"
        )
    for category in ("name", "extension"):
        if not isinstance(icons.get(category), dict):
            raise ValueError(f"lsd icons require a {category} table")
        for key, glyph in icons[category].items():
            if (
                not isinstance(key, str)
                or not key
                or not key.isprintable()
                or not _is_icon_glyph(glyph)
            ):
                raise ValueError(
                    "lsd icons require string keys and single glyphs"
                )
    for source, target in (("files", "name"), ("exts", "extension")):
        if not isinstance(yazi_icons.get(source), list):
            raise ValueError(f"Yazi icons require a {source} list")
        seen: dict[str, str] = {}
        for item in yazi_icons[source]:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("name"), str)
                or not item["name"]
                or not item["name"].isprintable()
                or not _is_icon_glyph(item.get("text"))
                or not isinstance(item.get("fg"), str)
                or not re.fullmatch(r"#[0-9a-fA-F]{6}", item["fg"])
            ):
                raise ValueError(
                    "Yazi icons require a name, single glyph and RGB color"
                )
            key = item["name"].lower()
            if key in seen and seen[key] != item["text"]:
                raise ValueError(
                    f"conflicting case-insensitive icon name: {key}"
                )
            seen[key] = item["text"]
            icons[target][key] = item["text"]
    for name in (
        ".config",
        ".git",
        ".github",
        ".npm",
        "desktop",
        "development",
        "documents",
        "downloads",
        "library",
        "movies",
        "music",
        "pictures",
        "public",
        "videos",
    ):
        icons["name"][name] = "\uea83"
    icons["filetype"] = {
        "dir": "\uea83",
        "file": "\uea7b",
        "pipe": "\uea85",
        "socket": "\ueb2d",
        "executable": "\uea85",
        "device-char": "\uea85",
        "device-block": "\ueae8",
        "special": "\uea87",
        "symlink-dir": "\ueaee",
        "symlink-file": "\ueaee",
    }
    return icons


class TokenSettings(TypedDict):
    foreground: str
    fontStyle: str


class TokenRule(TypedDict):
    name: str
    scope: str
    settings: TokenSettings


def resolve_token_rules(
    colors: dict[str, str], tokens: list[dict]
) -> list[TokenRule]:
    """Resolve roles while preserving rule order and explicit empty styles."""
    if not isinstance(tokens, list):
        raise ValueError("syntax rules must be a list")
    rules: list[TokenRule] = []
    for token in tokens:
        if (
            not isinstance(token, dict)
            or not all(
                isinstance(token.get(key), str)
                for key in ("name", "role", "style")
            )
            or not isinstance(token.get("scopes"), list)
            or not all(isinstance(scope, str) for scope in token["scopes"])
        ):
            raise ValueError(
                "syntax rules require name, role, style, and scope strings"
            )
        if token["role"] not in colors:
            raise ValueError(f"unknown syntax color role: {token['role']}")
        rules.append(
            {
                "name": token["name"],
                "scope": ", ".join(token["scopes"]),
                "settings": {
                    "foreground": colors[token["role"]],
                    "fontStyle": token["style"],
                },
            }
        )
    return rules


def load_dark_theme() -> tuple[dict, list[TokenRule]]:
    """Load and validate shared dark data without rendering any application."""
    palette = json.loads(
        (THEME_DIR / "palette.json").read_text(encoding="utf-8")
    )
    colors, ansi = palette["colors"], palette["ansi"]
    if len(ansi) != 16 or not all(
        isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color)
        for color in [*colors.values(), *ansi]
    ):
        raise ValueError(
            "palette requires RGB hex colors and exactly 16 ANSI colors"
        )
    tokens = json.loads(
        (THEME_DIR / "textmate.json").read_text(encoding="utf-8")
    )
    return palette, resolve_token_rules(colors, tokens)
