"""Check shared lazygit mappings and native loading in an isolated terminal."""

from contextlib import redirect_stderr
import io
import json
import os
from pathlib import Path
import select
import shutil
import struct
import subprocess
import tempfile
import time
import unittest
from unittest import mock

if os.name == "posix":
    import fcntl
    import pty
    import termios

import build
from renderers import lazygit
import theme_source

THEME_PATH = ".config/lazygit/themes/iris-nocturne.yml"
SNACKS_PATH = Path(os.environ.get(
    "IRIS_SNACKS_PATH",
    str(Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
        / "nvim/lazy/snacks.nvim"),
))


def icon_entries(output: str, category: str) -> dict[str, dict[str, str]]:
    """Read the renderer's JSON inline maps, without parsing general YAML."""
    section = output.split(f"    {category}:\n", 1)[1]
    entries = {}
    for line in section.splitlines():
        if not line.startswith("      "):
            break
        entries.update(json.loads("{" + line.strip() + "}"))
    return entries


def terminal_rgb(color: str) -> bytes:
    """Format a palette RGB color as terminal escape parameters."""
    return ";".join(str(channel) for channel in bytes.fromhex(color[1:])).encode()


class LazygitThemeTest(unittest.TestCase):
    def test_selected_palette_and_shared_icon_precedence(self):
        output = build.generate()[THEME_PATH].decode()
        colors = theme_source.load_dark_theme()[0]["colors"]
        self.assertIn(
            f'activeBorderColor: ["{colors["accent"]}", "bold"]', output
        )
        self.assertIn(
            f'inactiveBorderColor: ["{colors["terminal_border"]}"]', output
        )
        self.assertIn('selectedLineFgColor: ["bold"]', output)
        self.assertIn(
            f'selectedLineBgColor: ["{colors["terminal_raised"]}"]', output
        )
        self.assertIn(
            f'inactiveViewSelectedLineBgColor: ["{colors["terminal_surface"]}"]',
            output,
        )
        self.assertIn('nerdFontsVersion: "3"', output)
        names = icon_entries(output, "filenames")
        extensions = icon_entries(output, "extensions")
        for name, glyph, role in (
            ("README.md", "\ueaa4", "warning"),
            ("Cargo.toml", "\ueb29", "preprocessor"),
        ):
            with self.subTest(name=name):
                self.assertEqual(
                    names[name], {"icon": glyph, "color": colors[role]}
                )
        self.assertEqual(extensions[".py"]["icon"], "\ue606")
        self.assertEqual(extensions[".cs"]["icon"], "\U000f031b")
        self.assertTrue(all(name.startswith(".") for name in extensions))
        self.assertNotIn("**/", output)
        # A regular file named build uses the directory purpose, as in lsd.
        self.assertEqual(names["build"]["icon"], "\ueb6d")

    def test_shared_changes_reach_icons_and_unknown_names_stay_native(self):
        colors = theme_source.load_dark_theme()[0]["colors"]
        icons = theme_source.load_file_icons(colors)
        for icon in icons["files"]:
            if icon["name"] == "readme.md":
                icon.update(text="X", fg="#123456")
        output = lazygit.lazygit_theme(
            colors, icons, ["README.md", "native.unknown"]
        )
        names = icon_entries(output, "filenames")
        self.assertEqual(names["README.md"], {"icon": "X", "color": "#123456"})
        self.assertNotIn("native.unknown", names)
        # Native named icons otherwise take precedence over shared extensions.
        output = lazygit.lazygit_theme(colors, icons, ["Native.PY"])
        self.assertEqual(
            icon_entries(output, "filenames")["Native.PY"]["icon"], "\ue606"
        )

    def test_invalid_spellings_fail_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "assets").mkdir()
            spellings = root / "assets/lazygit-filenames.toml"
            for value in (["same", "same"], ["nested/name"], [".."], [1]):
                spellings.write_text("filenames = " + json.dumps(value))
                with self.subTest(value=value):
                    with mock.patch.object(theme_source, "THEME_DIR", root):
                        with self.assertRaisesRegex(ValueError, "basenames"):
                            theme_source.load_lazygit_filenames()
            spellings.write_text('filenames = ["bad/name"]')
            output_root = root / "output"
            for name in (
                "palette.json", "textmate.json", "assets/yazi-icons.toml",
                "assets/purpose-icons.toml", "assets/lsd-icons.toml",
            ):
                shutil.copy2(theme_source.THEME_DIR / name, root / name)
            errors = io.StringIO()
            with (
                mock.patch.object(theme_source, "THEME_DIR", root),
                mock.patch("sys.argv", [
                    "build.py", "--output-root", str(output_root)
                ]),
                redirect_stderr(errors),
            ):
                self.assertEqual(build.main(), 1)
            self.assertIn("basenames", errors.getvalue())
            self.assertFalse(output_root.exists())


@unittest.skipUnless(
    os.name == "posix" and shutil.which("lazygit") and shutil.which("git"),
    "POSIX, lazygit and git required",
)
class LazygitIntegrationTest(unittest.TestCase):
    @unittest.skipUnless(
        shutil.which("nvim") and (SNACKS_PATH / "lua/snacks").is_dir(),
        "nvim and installed Snacks runtime required (IRIS_SNACKS_PATH)",
    )
    def test_snacks_theme_entrypoints_and_parent_editing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            env = {
                "PATH": os.environ.get("PATH", os.defpath),
                "HOME": directory,
                "XDG_CONFIG_HOME": str(root / "config"),
                "XDG_CACHE_HOME": str(root / "cache"),
                "XDG_STATE_HOME": str(root / "state"),
                "XDG_DATA_HOME": str(root / "data"),
                "CONFIG_DIR": str(root / "config/lazygit"),
                "NVIM_LOG_FILE": str(root / "nvim.log"),
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
                "TERM": "xterm-256color",
                "COLORTERM": "truecolor",
                "LANG": "en_US.UTF-8",
            }
            shutil.copytree(SNACKS_PATH, root / "snacks",
                            ignore=shutil.ignore_patterns(".git"))
            subprocess.run(
                ["git", "init", "-q", str(repo)], env=env, check=True
            )
            (repo / "README.md").write_text("original\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo, env=env, check=True)
            subprocess.run(
                ["git", "-c", "user.name=Iris", "-c",
                 "user.email=iris@example.invalid", "commit", "-qm", "fixture"],
                cwd=repo, env=env, check=True,
            )
            (repo / "README.md").write_text("updated\n", encoding="utf-8")
            (root / "theme.yml").write_bytes(build.generate()[THEME_PATH])
            (root / "base.yml").write_text(
                "disableStartupPopups: true\n"
                "gui:\n  language: en\n  colorScheme: dark\n"
                "git:\n  autoFetch: false\n  autoForwardBranches: none\n"
                "update:\n  method: never\nos:\n  editPreset: nvim-remote\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["nvim", "--headless", "-u", "NONE", "-l",
                 str(Path(__file__).with_name("lazygit_neovim_test.lua")),
                 str(root), str(root / "snacks")],
                cwd=root, env=env, capture_output=True, text=True, timeout=40,
            )
            output = result.stdout + result.stderr
            self.assertEqual(result.returncode, 0, output)
            self.assertIn("parent editing passed", output)

    @unittest.skipUnless(shutil.which("bat") and shutil.which("delta"),
                         "bat and delta required for native diff rendering")
    def test_native_theme_icons_search_and_renderer_switch(self):
        colors = theme_source.load_dark_theme()[0]["colors"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            env = {
                "PATH": os.environ.get("PATH", os.defpath),
                "HOME": directory,
                "XDG_CONFIG_HOME": str(root / ".config"),
                "XDG_CACHE_HOME": str(root / "cache"),
                "XDG_STATE_HOME": str(root / "state"),
                "XDG_DATA_HOME": str(root / "data"),
                "CONFIG_DIR": str(root / ".config/lazygit"),
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
                "TERM": "xterm-256color",
                "COLORTERM": "truecolor",
                "LANG": "en_US.UTF-8",
            }
            subprocess.run(
                ["git", "init", "-q", str(repo)], env=env, check=True
            )
            for name in (
                "README.md", "Cargo.toml", "src/main.py", "tests/test.py"
            ):
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("hello original world\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=repo, env=env, check=True)
            subprocess.run(
                ["git", "-c", "user.name=Iris", "-c",
                 "user.email=iris@example.invalid", "commit", "-qm", "fixture"],
                cwd=repo, env=env, check=True,
            )
            (repo / "README.md").write_text(
                "hello updated world\n", encoding="utf-8"
            )
            (repo / "Cargo.toml").write_text("updated\n", encoding="utf-8")
            outputs = build.generate()
            (root / "theme.yml").write_bytes(outputs[THEME_PATH])
            bat_source = root / "bat-source"
            (bat_source / "themes").mkdir(parents=True)
            (bat_source / "themes/iris-nocturne.tmTheme").write_bytes(
                outputs[".config/bat/themes/iris-nocturne.tmTheme"]
            )
            (root / "delta.gitconfig").write_bytes(
                outputs[".config/git/themes/iris-nocturne.gitconfig"]
            )
            (root / ".gitconfig").write_text(
                f'[include]\n  path = "{root}/delta.gitconfig"\n'
                '[delta]\n  features = iris-nocturne\n', encoding="utf-8",
            )
            env.update(
                GIT_CONFIG_GLOBAL=str(root / ".gitconfig"),
                BAT_CONFIG_PATH=os.devnull,
                BAT_CACHE_PATH=str(root / "bat-cache"),
            )
            subprocess.run(
                ["bat", "cache", "--build", "--source", str(bat_source)],
                env=env, check=True, capture_output=True,
            )
            (root / "base.yml").write_text(
                "disableStartupPopups: true\n"
                "gui:\n  language: en\n  colorScheme: dark\n"
                "git:\n  autoFetch: false\n  autoRefresh: false\n"
                "  autoForwardBranches: none\n"
                "  diffRenderers:\n    - name: delta\n"
                "      command: delta --paging=never\n"
                "    - name: raw\n      type: rawGit\n"
                "      args: [--word-diff]\n"
                "update:\n  method: never\n",
                encoding="utf-8",
            )
            env["LG_CONFIG_FILE"] = f"{root}/base.yml,{root}/theme.yml"
            master, slave = pty.openpty()
            fcntl.ioctl(
                slave, termios.TIOCSWINSZ, struct.pack("HHHH", 48, 160, 0, 0)
            )
            process = subprocess.Popen(
                ["lazygit", "-p", str(repo)], stdin=slave, stdout=slave,
                stderr=slave, env=env, start_new_session=True,
                preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0),
            )
            os.close(slave)
            output = bytearray()

            def wait_for(expected):
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if select.select([master], [], [], 0.1)[0]:
                        try:
                            chunk = os.read(master, 65536)
                        except OSError:
                            break
                        if not chunk:
                            break
                        output.extend(chunk)
                        if b"\x1b]11;?" in chunk:
                            os.write(
                                master, b"\x1b]11;rgb:1010/1111/2b2b\x1b\\"
                            )
                        if expected in output:
                            return
                self.fail(f"Missing {expected!r}; terminal: {output[-1500:]!r}")

            try:
                wait_for("\ueaa4".encode())  # Shared README book.
                wait_for("\ueb29".encode())  # Cargo.toml package purpose.
                self.assertIn(terminal_rgb(colors["accent"]), output)
                self.assertIn(terminal_rgb(colors["terminal_raised"]), output)
                os.write(master, b"/README\r")
                wait_for(b"Filter: matches")
                wait_for(terminal_rgb(colors["warning"]))
                wait_for(b"48;2;" + terminal_rgb(colors["diff_add"]))
                wait_for(b"48;2;" + terminal_rgb(colors["diff_add_emphasis"]))
                os.write(master, b"|")
                wait_for(b"{+updated+}")
                self.assertIn(b"[-original-]", output)
                os.write(master, b"qq")
                # Keep draining: terminal restoration can exceed the PTY buffer.
                deadline = time.monotonic() + 5
                while process.poll() is None and time.monotonic() < deadline:
                    if select.select([master], [], [], 0.1)[0]:
                        try:
                            os.read(master, 65536)
                        except OSError:
                            break
                process.wait(timeout=1)
                self.assertEqual(process.returncode, 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)
                os.close(master)


if __name__ == "__main__":
    unittest.main()
