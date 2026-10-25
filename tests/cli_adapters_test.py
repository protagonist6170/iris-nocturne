"""Exercise exported CLI themes through their consumers in temporary homes."""

import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import build


@unittest.skipUnless(
    shutil.which("lsd") and shutil.which("zsh"), "lsd and zsh required"
)
class FileThemeTest(unittest.TestCase):
    def test_file_states_override_suffix_colors_and_icons_use_shared_glyphs(
        self,
    ):
        outputs = build.generate()
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            for relative, data in outputs.items():
                target = home / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
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
            for name, rgb in {
                "plain.py": "244;242;249",
                "run.py": "145;214;162",
                "picture.png": "255;143;125",
                "link.png": "173;180;206",
                "broken.png": "255;124;150",
            }.items():
                with self.subTest(name=name):
                    self.assertIn("38;2;" + rgb, lines[name])
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
                self.assertIn("38;2;255;124;150", broken)
                self.assertEqual(result.stderr, "")


class ExportValidationTest(unittest.TestCase):
    def test_invalid_icon_input_is_rejected_before_any_export_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source"
            shutil.copytree(
                pathlib.Path(build.__file__).parent,
                source,
                ignore=shutil.ignore_patterns(
                    ".git", "dist", "__pycache__", ".ruff_cache"
                ),
            )
            (source / "assets/yazi-icons.toml").write_text(
                'files = [{ name = "bad", text = "two glyphs", '
                'fg = "#123456" }]\n'
                "exts = []\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(source / "build.py"),
                    "--output-root",
                    str(root / "output"),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("single glyph", result.stderr)
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
(( ! ${+FAST_HIGHLIGHT_STYLES} )) || exit 1
[[ $ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE == 'fg=#6F789D' ]] || exit 2
typeset -gA FAST_HIGHLIGHT_STYLES=(customdefault none freedefault none)
FAST_THEME_NAME=custom
source "$1"
[[ $FAST_THEME_NAME == custom ]] || exit 3
[[ $FAST_HIGHLIGHT_STYLES[customcommand] == 'fg=#8F9FFF' ]] || exit 4
[[ $FAST_HIGHLIGHT_STYLES[freecomment] == 'fg=#ADB4CE' ]] || exit 5
[[ $FAST_HIGHLIGHT_STYLES[iris-nocturnedefault] == 'fg=#F4F2F9' ]] || exit 6
[[ $FAST_HIGHLIGHT_STYLES[customsecondary] == iris-nocturne ]] || exit 7
[[ $FAST_HIGHLIGHT_STYLES[customhere-string-text] == 'fg=#FF981F' ]] || exit 8
[[ $FAST_HIGHLIGHT_STYLES[command] == 'fg=#8F9FFF' ]] || exit 9
[[ $FAST_HIGHLIGHT_STYLES[customcase-condition] == 'fg=#FF981F' ]] || exit 10
[[ $FAST_HIGHLIGHT_STYLES[customoptarg-string] == 'fg=#FF981F' ]] || exit 11
[[ $FAST_HIGHLIGHT_STYLES[customoptarg-number] == 'fg=#7DD300' ]] || exit 12
[[ $FAST_HIGHLIGHT_STYLES[iris-nocturnerecursive-base] == 'fg=#F4F2F9' ]] ||
  exit 13
for prefix in '' custom free iris-nocturne; do
  for key in command builtin function alias suffix-alias global-alias \\
      precommand hashed-command subcommand; do
    [[ $FAST_HIGHLIGHT_STYLES[${prefix}${key}] == 'fg=#8F9FFF' ]] || exit 14
  done
  [[ $FAST_HIGHLIGHT_STYLES[${prefix}reserved-word] == 'fg=#C9A1FE' ]] || exit 15
  [[ $FAST_HIGHLIGHT_STYLES[${prefix}path] == 'fg=#8ACFF5' ]] || exit 16
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
            self.assertEqual(result.stdout, "")
            self.assertEqual(result.stderr, "")
            self.assertEqual(
                list(pathlib.Path(directory).iterdir()), [fragment]
            )


if __name__ == "__main__":
    unittest.main()
