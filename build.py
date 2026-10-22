"""Export theme resources to an explicit directory using Python 3.11+."""

import argparse
import pathlib
import re
import sys
import tomllib

import theme_source
from renderers import (
    btop,
    claude,
    delta,
    fzf,
    ghostty,
    herdr,
    ls_colors,
    lsd,
    neovim,
    starship,
    textmate,
    yazi,
    zsh,
)

BEGIN = "# BEGIN GENERATED iris-nocturne"
END = "# END GENERATED iris-nocturne"


def replace_block(
    config: str, block: str, *, preserve_disabled: bool = False
) -> str:
    """Replace one marked region, preserving the text outside its markers.

    With preserve_disabled, keep a fully commented Herdr override disabled.
    """
    lines = config.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == BEGIN]
    ends = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == END]
    if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
        raise ValueError("expected exactly one ordered BEGIN/END theme block")
    if preserve_disabled:
        body = lines[starts[0] + 1 : ends[0]]
        disabled = any(
            re.fullmatch(
                r"\s*#\s*\[theme\.custom\]\s*(?:#.*)?", line.rstrip("\r\n")
            )
            for line in body
        )
        if disabled:
            if any(
                line.strip() and not line.lstrip().startswith("#")
                for line in body
            ):
                raise ValueError("theme.custom must be fully commented out")
            block = "".join(
                "# " + line if line.strip() else line
                for line in block.splitlines(keepends=True)
            )
    result = "".join(lines[: starts[0] + 1]) + block + "".join(lines[ends[0] :])
    tomllib.loads(result)
    return result


def generate(source_home: pathlib.Path | None = None) -> dict[str, bytes]:
    """Render resources, preserving marked blocks in supplied configurations.

    Without an existing configuration, export a standalone marked theme block.
    All TOML is validated before any caller writes the returned resources.
    """
    palette, rules = theme_source.load_dark_theme()
    icons = theme_source.load_lsd_icons()
    # Keep terminal surfaces out of editor exports unless explicitly shared.
    colors = {
        role: color
        for role, color in palette["colors"].items()
        if not role.startswith("terminal_")
    }
    ansi = palette["ansi"]
    xml = textmate.textmate_theme(colors, rules)
    text_outputs = {
        ".config/zsh/themes/iris-nocturne.zsh": zsh.shell_styles(colors),
        ".config/iris-nocturne/fzf.sh": fzf.shell_colors(palette["colors"]),
        ".config/lsd/colors.yaml": lsd.color_theme(colors),
        ".config/lsd/icons.yaml": lsd.icon_theme(icons),
        ".config/iris-nocturne/ls-colors.sh": ls_colors.shell_colors(colors),
        ".claude/themes/iris-nocturne.json": claude.claude_theme(
            palette["colors"], ansi
        ),
        ".config/ghostty/themes/iris-nocturne": ghostty.ghostty_theme(
            colors, ansi
        ),
        ".config/nvim/lua/iris_nocturne/palette.lua": neovim.neovim_palette(
            colors | {"terminal_raised": palette["colors"]["terminal_raised"]},
            ansi,
        ),
        ".config/yazi/flavors/iris-nocturne.yazi/flavor.toml": (
            yazi.yazi_flavor(colors)
        ),
        ".config/btop/themes/iris-nocturne.theme": btop.btop_theme(colors),
        ".config/git/themes/iris-nocturne.gitconfig": delta.delta_feature(
            colors
        ),
    }
    for relative, block in {
        ".config/starship.toml": starship.starship_palette(colors, ansi),
        ".config/herdr/config.toml": herdr.herdr_colors(palette["colors"]),
    }.items():
        config_path = (
            source_home / relative if source_home is not None else None
        )
        config = (
            config_path.read_text(encoding="utf-8")
            if config_path is not None and config_path.exists()
            else f"{BEGIN}\n{END}\n"
        )
        try:
            text_outputs[relative] = replace_block(
                config,
                block,
                preserve_disabled=relative == ".config/herdr/config.toml",
            )
        except ValueError as error:
            raise ValueError(f"{relative}: {error}") from error
    for relative, config in text_outputs.items():
        if relative.endswith(".toml"):
            tomllib.loads(config)
    outputs = {
        name: text.encode("utf-8") for name, text in text_outputs.items()
    }
    outputs[".config/bat/themes/iris-nocturne.tmTheme"] = xml
    outputs[".config/yazi/flavors/iris-nocturne.yazi/tmtheme.xml"] = xml
    outputs[".codex/themes/iris-nocturne.tmTheme"] = xml
    return outputs


def main() -> int:
    """Check or export only within an explicitly named destination."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=pathlib.Path,
        required=True,
        help="export root for home-relative configs and theme packages",
    )
    parser.add_argument(
        "--source-root",
        type=pathlib.Path,
        help="read existing Starship/Herdr configs here (default: output root)",
    )
    parser.add_argument(
        "--check", action="store_true", help="compare without writing"
    )
    args = parser.parse_args()
    output_root = args.output_root.resolve()
    try:
        source_root = (args.source_root or output_root).resolve()
        if args.source_root is not None and not source_root.is_dir():
            raise ValueError(f"source root is not a directory: {source_root}")
        outputs = generate(source_root)
        different = []
        for relative, data in outputs.items():
            target = output_root / relative
            if target.is_file() and target.read_bytes() == data:
                continue
            different.append(relative)
        if args.check:
            if different:
                print(
                    "Theme output differs:\n  " + "\n  ".join(different),
                    file=sys.stderr,
                )
                return 1
            print(f"Theme outputs match ({len(outputs)} files).")
            return 0
        for relative in different:
            target = output_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(outputs[relative])
        print(f"Generated {len(different)} changed files in {output_root}.")
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Theme build failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
