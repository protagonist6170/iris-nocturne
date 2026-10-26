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


class FileIcon(TypedDict):
    """A resolved glyph and color, matched by name or Yazi URL glob."""

    name: str
    text: str
    fg: str


def _file_icon(name: object, text: object, color: object) -> FileIcon:
    """Validate a named glyph before it reaches native renderers."""
    if (
        not isinstance(name, str)
        or not name
        or not name.isprintable()
        or not isinstance(text, str)
        or not _is_icon_glyph(text)
        or not isinstance(color, str)
        or not re.fullmatch(r"#[0-9a-fA-F]{6}", color)
    ):
        raise ValueError(
            "file icons require a name, single glyph and RGB color"
        )
    return {"name": name, "text": text, "fg": color}


def load_file_icons(colors: dict[str, str]) -> dict[str, list[FileIcon]]:
    """Apply shared purpose rules over the retained language icon mappings.

    Names are normalized for shared consumers. Yazi additionally receives globs;
    lsd uses explicit names, and lazygit adds known case-sensitive spellings.
    """
    source = tomllib.loads(
        (THEME_DIR / "assets/yazi-icons.toml").read_text(encoding="utf-8")
    )
    icons: dict[str, dict[str, FileIcon]] = {
        "dirs": {}, "files": {}, "exts": {}, "globs": {},
    }
    for category in ("files", "exts"):
        if not isinstance(source.get(category), list):
            raise ValueError(f"Yazi icons require a {category} list")
        for item in source[category]:
            if not isinstance(item, dict):
                raise ValueError("file icons require name, text and fg fields")
            icon = _file_icon(
                item.get("name"), item.get("text"), item.get("fg")
            )
            key = icon["name"].lower()
            if key in icons[category] and (
                icons[category][key]["text"] != icon["text"]
            ):
                raise ValueError(
                    f"conflicting case-insensitive icon name: {key}"
                )
            icon["name"] = key
            icons[category][key] = icon

    purposes = tomllib.loads(
        (THEME_DIR / "assets/purpose-icons.toml").read_text(encoding="utf-8")
    )
    overrides: dict[str, dict[str, FileIcon]] = {
        category: {} for category in icons
    }
    for purpose, rule in purposes.items():
        if (
            not isinstance(rule, dict)
            or set(rule) - {"text", "role", *icons}
            or not _is_icon_glyph(rule.get("text"))
            or not isinstance(rule.get("role"), str)
            or rule["role"] not in colors
        ):
            raise ValueError(f"invalid purpose icon rule: {purpose}")
        for category in icons:
            names = rule.get(category, [])
            if not isinstance(names, list):
                raise ValueError(f"{purpose}.{category} must be a list")
            for name in names:
                icon = _file_icon(
                    name, rule.get("text"), colors[rule["role"]]
                )
                key = icon["name"].lower()
                icon["name"] = key
                previous = overrides[category].get(key)
                if previous is not None and previous != icon:
                    raise ValueError(
                        f"conflicting purpose icon: {category}.{key}"
                    )
                overrides[category][key] = icon
    return {
        category: list((entries | overrides[category]).values())
        for category, entries in icons.items()
    }


def load_lsd_icons(
    file_icons: dict[str, list[FileIcon]],
) -> dict[str, dict[str, str]]:
    """Overlay shared glyphs on pinned lsd keys; directory names win ties.

    lsd uses one name table for files and directories, unlike Yazi. A known
    directory name must retain its purpose glyph even if a file shares it.
    """
    icons = tomllib.loads(
        (THEME_DIR / "assets/lsd-icons.toml").read_text(encoding="utf-8")
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
    for source, target in (
        ("files", "name"), ("exts", "extension"), ("dirs", "name")
    ):
        icons[target].update(
            (icon["name"], icon["text"]) for icon in file_icons[source]
        )
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


def load_lazygit_filenames() -> list[str]:
    """Load explicit native and common filename spellings for lazygit."""
    source = tomllib.loads(
        (THEME_DIR / "assets/lazygit-filenames.toml").read_text(
            encoding="utf-8"
        )
    )
    names = source.get("filenames")
    if (
        set(source) != {"filenames"}
        or not isinstance(names, list)
        or not all(
            isinstance(name, str)
            and name not in ("", ".", "..")
            and name.isprintable()
            and "/" not in name
            and "\\" not in name
            for name in names
        )
        or len(set(names)) != len(names)
    ):
        raise ValueError("lazygit filenames require unique plain basenames")
    return names


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
