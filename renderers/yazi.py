"""Render the yazi theme format from shared colors."""


import pathlib
import tomllib


def yazi_flavor(colors: dict[str, str]) -> str:
    """Build a local flavor for Yazi 26.9 and its TextMate code preview."""
    c = colors

    def style(fg: str, bg: str | None = None, **attributes: bool) -> str:
        parts = [f'fg = "{c[fg]}"']
        if bg:
            background = "reset" if bg == "reset" else c[bg]
            parts.append(f'bg = "{background}"')
        parts.extend(
            f"{key} = true" for key, enabled in attributes.items() if enabled
        )
        return "{ " + ", ".join(parts) + " }"

    sections = {
        "app": {"overall": '{ bg = "reset" }'},
        "mgr": {
            "cwd": style("preprocessor"),
            "find_keyword": style(
                "warning", bold=True, italic=True, underline=True
            ),
            "find_position": style("constant", "reset", bold=True, italic=True),
            "symlink_target": style("comment", italic=True),
            "marker_copied": style("added", "added"),
            "marker_cut": style("deleted", "deleted"),
            "marker_marked": style("preprocessor", "preprocessor"),
            "marker_selected": style("warning", "warning"),
            "count_copied": style("background", "added"),
            "count_cut": style("background", "deleted"),
            "count_selected": style("background", "warning"),
            "border_symbol": '"│"',
            "border_style": style("comment"),
        },
        "indicator": {
            "parent": "{ reversed = true }",
            "current": "{ reversed = true }",
            "preview": "{ underline = true }",
        },
        "tabs": {
            "active": style("background", "type", bold=True),
            "inactive": style("type", "raised"),
        },
        "mode": {
            "normal_main": style("type", "reset", bold=True),
            "normal_alt": style("muted", "reset"),
            "select_main": style("keyword", "reset", bold=True),
            "select_alt": style("muted", "reset"),
            "unset_main": style("string", "reset", bold=True),
            "unset_alt": style("muted", "reset"),
        },
        "status": {
            "overall": '{ fg = "' + c["muted"] + '", bg = "reset" }',
            "perm_type": style("type"),
            "perm_read": style("warning"),
            "perm_write": style("error"),
            "perm_exec": style("added"),
            "perm_sep": style("comment"),
            "progress_label": style("foreground", bold=True),
            "progress_normal": style("added", "border"),
            "progress_error": style("warning", "error"),
        },
        "iris-nocturne-status": {
            "normal": style("type", "reset", bold=True),
            "select": style("keyword", "reset", bold=True),
            "unset": style("string", "reset", bold=True),
            "text": style("muted", "reset"),
            "modified": style("string", "reset"),
            "divider": style("subtle", "reset"),
            "accent": style("member", "reset"),
            "selected": style("warning", "reset"),
            "copied": style("added", "reset"),
            "cut": style("deleted", "reset"),
        },
        "which": {
            "border": style("type"),
            "mask": "{}",
            "cand": style("preprocessor"),
            "rest": style("muted"),
            "desc": style("constant"),
            "separator": '"  "',
            "separator_style": style("subtle"),
        },
        "confirm": {
            "border": style("type"),
            "title": style("type"),
            "body": "{}",
            "list": "{}",
            "btn_yes": "{ reversed = true }",
            "btn_no": "{}",
        },
        "spot": {
            "border": style("type"),
            "title": style("type"),
            "tbl_col": style("preprocessor"),
            "tbl_cell": style("constant", "border"),
        },
        "notify": {
            "title_info": style("added"),
            "title_warn": style("warning"),
            "title_error": style("error"),
        },
        "pick": {
            "border": style("type"),
            "active": style("constant", bold=True),
            "inactive": "{}",
        },
        "input": {
            "border": style("type"),
            "title": "{}",
            "value": "{}",
            "selected": "{ reversed = true }",
        },
        "cmp": {
            "border": style("type"),
            "active": "{ reversed = true }",
            "inactive": "{}",
        },
        "tasks": {
            "border": style("type"),
            "title": "{}",
            "hovered": style("constant", bold=True),
        },
        "help": {
            "border": style("type"),
            "chord": style("preprocessor"),
            "action": style("constant"),
            "hovered": "{ reversed = true, bold = true }",
        },
    }
    lines = [
        "# Iris Nocturne dark flavor. Generated from palette.json.",
        "# Matchers: Catppuccin; file icons: Yazi 26.9.1 (MIT).",
        "#:schema https://yazi-rs.github.io/schemas/theme.json",
    ]
    for section, values in sections.items():
        lines.extend(["", f"[{section}]"])
        lines.extend(f"{key} = {value}" for key, value in values.items())
    lines.extend(["", "[filetype]", "rules = ["])
    # Preserve the retained flavor's filetype matchers and order.
    for rule, role in [
        ('mime = "**/image/*"', "preprocessor"),
        ('mime = "**/{audio,video}/*"', "warning"),
        (
            'mime = "**/application/{zip,rar,7z*,tar,gzip,xz,zstd,bzip*,'
            'lzma,compress,archive,cpio,arj,xar,ms-cab*}"',
            "constant",
        ),
        ('mime = "**/application/{pdf,doc,rtf}"', "added"),
        ('mime = "vfs/{absent,stale}"', "muted"),
        ('url = "*"', "foreground"),
        ('url = "*/"', "type"),
    ]:
        lines.append(f'  {{ {rule}, fg = "{c[role]}" }},')
    lines.extend(
        [
            "]",
            "",
            "[icon]",
            "dirs = [",
        ]
    )
    for name, text, role in [
        (".config", "", "type"),
        (".git", "", "type"),
        (".github", "", "type"),
        (".npm", "", "type"),
        ("Desktop", "", "type"),
        ("Development", "", "type"),
        ("Documents", "", "type"),
        ("Downloads", "", "type"),
        ("Library", "", "type"),
        ("Movies", "", "type"),
        ("Music", "", "type"),
        ("Pictures", "", "type"),
        ("Public", "", "type"),
        ("Videos", "", "type"),
    ]:
        lines.append(
            f'  {{ name = "{name}", text = "{text}", fg = "{c[role]}" }},'
        )
    lines.append("]")
    icon_path = pathlib.Path(__file__).resolve().parents[1] / "assets/yazi-icons.toml"
    icons = tomllib.loads(icon_path.read_text(encoding="utf-8"))
    for category in ("files", "exts"):
        lines.append(f"{category} = [")
        for icon in icons[category]:
            lines.append(
                f'  {{ name = "{icon["name"]}", text = "{icon["text"]}", '
                f'fg = "{icon["fg"]}" }},'
            )
        lines.append("]")
    lines.append("conds = [")
    for condition, text, role in [
        ("orphan", "", "foreground"),
        ("link", "", "comment"),
        ("block", "", "number"),
        ("char", "", "number"),
        ("fifo", "", "number"),
        ("sock", "", "number"),
        ("sticky", "", "number"),
        ("dummy", "", "error"),
        ("dir & hovered", "", "type"),
        ("dir", "", "type"),
        ("exec", "", "added"),
        ("!dir", "", "foreground"),
    ]:
        lines.append(
            f'  {{ if = "{condition}", text = "{text}", fg = "{c[role]}" }},'
        )
    lines.append("]")
    return "\n".join(lines) + "\n"

