"""Exercise exported CLI themes through their consumers in temporary homes."""

from contextlib import redirect_stderr
import io
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import build
import theme_source


def terminal_rgb(color: str) -> str:
    """Format a palette color as terminal RGB parameters."""
    return ";".join(str(channel) for channel in bytes.fromhex(color[1:]))


@unittest.skipUnless(shutil.which("delta"), "delta required")
class DeltaBlameTest(unittest.TestCase):
    def test_blame_colors_cover_metadata_and_code(self):
        colors = theme_source.load_dark_theme()[0]["colors"]
        fixture = (
            "a1111111 (Alex 2025-01-01 12:00:00 +0000 1) first\n"
            "b2222222 (Sam  2025-01-02 12:00:00 +0000 2) second\n"
            "c3333333 (Lee  2025-01-03 12:00:00 +0000 3) third\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            config = home / ".gitconfig"
            config.write_bytes(
                build.generate()[".config/git/themes/iris-nocturne.gitconfig"]
                + b"\n[delta]\n  features = iris-nocturne\n"
            )
            env = os.environ | {
                "HOME": str(home),
                "XDG_CONFIG_HOME": str(home),
                "GIT_CONFIG_NOSYSTEM": "1",
                "TERM": "xterm-256color",
                "COLORTERM": "truecolor",
            }
            env.pop("BAT_THEME", None)
            env.pop("GIT_CONFIG_GLOBAL", None)
            result = subprocess.run(
                ["delta", "--paging=never", "--true-color=always", "--color-only"],
                cwd=home,
                env=env,
                input=fixture,
                capture_output=True,
                text=True,
                check=True,
            )
        for line, (role, content) in zip(
            result.stdout.splitlines(),
            [
                ("terminal_surface", "first"),
                ("terminal_blame_cool", "second"),
                ("terminal_blame_warm", "third"),
            ],
        ):
            with self.subTest(content=content):
                rgb = terminal_rgb(colors[role])
                self.assertTrue(line.startswith(f"\x1b[48;2;{rgb}m"))
                self.assertRegex(
                    line, rf"\x1b\[48;2;{rgb};38;2;[\d;]+m {content}"
                )
        self.assertEqual(len(result.stdout.splitlines()), 3)


@unittest.skipUnless(
    shutil.which("lsd") and shutil.which("zsh"), "lsd and zsh required"
)
class FileThemeTest(unittest.TestCase):
    def test_file_states_override_suffix_colors_and_icons_use_shared_glyphs(
        self,
    ):
        outputs = build.generate()
        colors = theme_source.load_dark_theme()[0]["colors"]
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            for relative in (
                ".config/ls-colors/iris-nocturne.sh",
                ".config/lsd/colors.yaml",
                ".config/lsd/icons.yaml",
            ):
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(outputs[relative])
            (home / ".config/lsd/config.yaml").write_text(
                "color:\n  theme: custom\n", encoding="utf-8"
            )
            files = home / "files"
            files.mkdir()
            (files / "plain.py").touch()
            (files / "run.py").touch(mode=0o755)
            (files / "picture.png").touch()
            (files / "archive.tar").touch()
            (files / "script.csx").touch()
            (files / "link.png").symlink_to("picture.png")
            (files / "broken.png").symlink_to("absent")
            env = os.environ | {
                "HOME": str(home),
                "XDG_CONFIG_HOME": str(home / ".config"),
                "TERM": "xterm-256color",
                "LS_COLORS": "di=31:*.png=31",
            }
            env.pop("NO_COLOR", None)
            result = subprocess.run(
                [
                    "zsh",
                    "-f",
                    "-c",
                    (
                        'source "$1"; lsd --color always '
                        "--icon always --oneline --no-symlink "
                        '--hyperlink never "$2"'
                    ),
                    "test",
                    str(home / ".config/ls-colors/iris-nocturne.sh"),
                    str(files),
                ],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(result.stderr, "")
            lines = {
                re.sub(r"\x1b\[[0-9;]*m", "", line).split()[-1]: line
                for line in result.stdout.splitlines()
            }
            for name, role in {
                "plain.py": "foreground",
                "run.py": "added",
                "picture.png": "preprocessor",
                "link.png": "comment",
                "broken.png": "error",
            }.items():
                with self.subTest(name=name):
                    self.assertIn("38;2;" + terminal_rgb(colors[role]), lines[name])
            self.assertIn("\ue606", lines["plain.py"])
            self.assertIn("\ueaea", lines["picture.png"])
            self.assertIn("\ueaef", lines["archive.tar"])
            self.assertIn("\U000f031b", lines["script.csx"])
            if shutil.which("fd"):
                result = subprocess.run(
                    [
                        "zsh",
                        "-f",
                        "-c",
                        'source "$1"; fd --color always . "$2"',
                        "test",
                        str(home / ".config/ls-colors/iris-nocturne.sh"),
                        str(files),
                    ],
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                broken = next(
                    line
                    for line in result.stdout.splitlines()
                    if "broken.png" in line
                )
                self.assertIn("38;2;" + terminal_rgb(colors["error"]), broken)
                self.assertEqual(result.stderr, "")


class ExportValidationTest(unittest.TestCase):
    def test_invalid_icon_input_is_rejected_before_any_export_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source"
            (source / "assets").mkdir(parents=True)
            for name in ("palette.json", "textmate.json"):
                shutil.copy2(theme_source.THEME_DIR / name, source / name)
            (source / "assets/yazi-icons.toml").write_text(
                'files = [{ name = "bad", text = "two glyphs", '
                'fg = "#123456" }]\n'
                "exts = []\n",
                encoding="utf-8",
            )
            errors = io.StringIO()
            with (
                mock.patch.object(theme_source, "THEME_DIR", source),
                mock.patch(
                    "sys.argv", ["build.py", "--output-root", str(root / "output")]
                ),
                redirect_stderr(errors),
            ):
                self.assertEqual(build.main(), 1)
            self.assertIn("single glyph", errors.getvalue())
            self.assertFalse((root / "output").exists())


@unittest.skipUnless(
    shutil.which("fzf") and shutil.which("zsh"), "fzf and zsh required"
)
class FzfThemeTest(unittest.TestCase):
    def test_color_fragment_is_consumable_without_changing_existing_options(
        self,
    ):
        data = build.generate()[".config/fzf/iris-nocturne.sh"]
        with tempfile.TemporaryDirectory() as directory:
            fragment = pathlib.Path(directory) / "fzf.sh"
            fragment.write_bytes(data)
            env = os.environ | {
                "FZF_DEFAULT_OPTS": "--layout=reverse --no-sort"
            }
            env.pop("FZF_DEFAULT_OPTS_FILE", None)
            env.pop("NO_COLOR", None)
            result = subprocess.run(
                [
                    "zsh",
                    "-f",
                    "-c",
                    (
                        'source "$1"; '
                        '[[ $FZF_DEFAULT_OPTS == '
                        '"--layout=reverse --no-sort" ]] || exit 1; '
                        'export FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS '
                        '$IRIS_NOCTURNE_FZF_COLORS"; '
                        "fzf --filter=needle"
                    ),
                    "test",
                    str(fragment),
                ],
                env=env,
                input="other\nneedle\n",
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(result.stdout, "needle\n")
            self.assertEqual(result.stderr, "")


@unittest.skipUnless(shutil.which("zsh"), "zsh required")
class ZshThemeTest(unittest.TestCase):
    def test_fragment_handles_missing_plugin_and_existing_theme_prefixes(self):
        data = build.generate()[".config/zsh/themes/iris-nocturne.zsh"]
        colors = theme_source.load_dark_theme()[0]["colors"]
        with tempfile.TemporaryDirectory() as directory:
            fragment = pathlib.Path(directory) / "theme.zsh"
            fragment.write_bytes(data)
            result = subprocess.run(
                [
                    "zsh",
                    "-f",
                    "-c",
                    """
source "$1"
print -r -- "without_plugin.exists=${+FAST_HIGHLIGHT_STYLES}"
print -r -- "without_plugin.suggestion=$ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE"
typeset -gA FAST_HIGHLIGHT_STYLES=(customdefault none freedefault none)
FAST_THEME_NAME=custom
source "$1"
print -r -- "with_plugin.theme=$FAST_THEME_NAME"
for key in ${(ok)FAST_HIGHLIGHT_STYLES}; do
  print -r -- "style.$key=${FAST_HIGHLIGHT_STYLES[$key]}"
done
""",
                    "test",
                    str(fragment),
                ],
                env=os.environ | {"HOME": directory, "ZDOTDIR": directory},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stderr, "")
            records = {}
            for line in result.stdout.splitlines():
                key, separator, value = line.partition("=")
                self.assertTrue(separator and key, f"Invalid record: {line!r}")
                self.assertNotIn(key, records, f"Duplicate record: {key}")
                records[key] = value
            self.assertEqual(records["without_plugin.exists"], "0")
            self.assertEqual(
                records["without_plugin.suggestion"], f'fg={colors["subtle"]}'
            )
            self.assertEqual(records["with_plugin.theme"], "custom")
            self.assertEqual(records["style.customsecondary"], "iris-nocturne")
            expected = {
                "freecomment": "comment",
                "iris-nocturnedefault": "foreground",
                "customhere-string-text": "string",
                "command": "function_reference",
                "customcase-condition": "string",
                "customoptarg-string": "string",
                "customoptarg-number": "number",
                "iris-nocturnerecursive-base": "foreground",
            }
            for prefix in ("", "custom", "free", "iris-nocturne"):
                for key in (
                    "command", "builtin", "function", "alias", "suffix-alias",
                    "global-alias", "precommand", "hashed-command", "subcommand",
                ):
                    expected[prefix + key] = "function_reference"
                expected[prefix + "reserved-word"] = "keyword"
                expected[prefix + "path"] = "member"
            for key, role in expected.items():
                with self.subTest(key=key):
                    self.assertEqual(records["style." + key], f"fg={colors[role]}")
            self.assertEqual(
                list(pathlib.Path(directory).iterdir()), [fragment]
            )


if __name__ == "__main__":
    unittest.main()
