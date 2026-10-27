"""Checks for preserving managed application configuration."""

import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock

import build
import theme_source


class BuildTest(unittest.TestCase):
    def test_terminal_ui_roles_affect_only_consuming_exports(self):
        original = build.generate()
        palette, rules = theme_source.load_dark_theme()
        palette["colors"].update(
            (role, "#123456")
            for role in palette["colors"]
            if role.startswith("terminal_")
        )
        with mock.patch.object(
            theme_source, "load_dark_theme", return_value=(palette, rules)
        ):
            updated = build.generate()
        for name in (
            ".config/fzf/iris-nocturne.sh",
            ".config/nvim/lua/iris_nocturne/palette.lua",
            ".config/lazygit/themes/iris-nocturne.yml",
            ".config/yazi/flavors/iris-nocturne.yazi/flavor.toml",
        ):
            with self.subTest(name=name):
                self.assertNotEqual(original[name], updated[name])
        for name in (
            "vscode/iris-nocturne-color-theme.json",
            ".config/bat/themes/iris-nocturne.tmTheme",
            ".config/starship.toml",
        ):
            with self.subTest(name=name):
                self.assertEqual(original[name], updated[name])

    def test_generation_preserves_source_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            config = source / ".config/starship.toml"
            config.parent.mkdir()
            original = (
                'palette = "previous"\n'
                f"{build.BEGIN}\n{build.END}\n"
                '[character]\nsuccess_symbol = "keep"\n'
            )
            config.write_text(original, encoding="utf-8")
            outputs = build.generate(source)
            self.assertEqual(config.read_text(encoding="utf-8"), original)
        starship = outputs[".config/starship.toml"].decode("utf-8")
        self.assertTrue(starship.startswith('palette = "previous"\n'))
        self.assertTrue(
            starship.endswith('[character]\nsuccess_symbol = "keep"\n')
        )

    def test_exports_share_syntax_and_have_valid_formats(self):
        outputs = build.generate()
        self.assertTrue(
            {
                "vscode/iris-nocturne.vsix",
                "vscode/iris-nocturne-color-theme.json",
                "vscode/iris-nocturne.css",
                "vscode/settings.example.json",
            }.issubset(outputs),
        )
        xml = outputs[".config/bat/themes/iris-nocturne.tmTheme"]
        self.assertEqual(outputs[".codex/themes/iris-nocturne.tmTheme"], xml)
        self.assertEqual(
            outputs[".config/yazi/flavors/iris-nocturne.yazi/tmtheme.xml"],
            xml,
        )
        for name, data in outputs.items():
            if name.endswith(".toml"):
                with self.subTest(name=name):
                    tomllib.loads(data.decode("utf-8"))

    def test_representative_exports_use_palette_roles(self):
        outputs = build.generate()
        starship = outputs[".config/starship.toml"].decode("utf-8")
        starship_colors = tomllib.loads(starship)["palettes"]["iris-nocturne"]
        colors = theme_source.load_dark_theme()[0]["colors"]
        neovim_palette = outputs[
            ".config/nvim/lua/iris_nocturne/palette.lua"
        ].decode("utf-8")
        for role in (
            "terminal_surface", "terminal_raised", "terminal_selection",
            "terminal_border",
        ):
            self.assertIn(f'["{role}"] = "{colors[role]}"', neovim_palette)
        yazi_theme = tomllib.loads(
            outputs[".config/yazi/flavors/iris-nocturne.yazi/flavor.toml"].decode(
                "utf-8"
            )
        )
        self.assertEqual(
            yazi_theme["tabs"]["inactive"]["bg"], colors["terminal_surface"]
        )
        btop_theme = outputs[".config/btop/themes/iris-nocturne.theme"].decode(
            "utf-8"
        )
        for field, role in {
            "meter_bg": "terminal_surface",
            "selected_bg": "terminal_raised",
            "proc_follow_bg": "terminal_raised",
            "followed_bg": "terminal_raised",
            "upload_start": "function",
        }.items():
            self.assertIn(f'theme[{field}]="{colors[role]}"', btop_theme)
        for field, role in {
            "function_reference": "function_reference",
            "function": "function",
            "lavender": "function",
        }.items():
            self.assertEqual(starship_colors[field], colors[role])

    def test_herdr_disabled_block_preserves_comments_and_rejects_mixed_state(
        self,
    ):
        block = '[theme.custom]\ntext = "#123456"\n'
        prefix = f'title = "keep"\n{build.BEGIN}\n'
        suffix = f'{build.END}\n[other]\nvalue = "keep"\n'
        for header in (
            "# [theme.custom]",
            "# [theme.custom] # disabled temporarily",
            "  #\t[theme.custom]\t# 停用说明",
        ):
            with self.subTest(header=header):
                source = prefix + header + '\n# text = "#ffffff"\n' + suffix
                result = build.replace_block(
                    source, block, preserve_disabled=True
                )
                self.assertEqual(
                    result,
                    prefix + '# [theme.custom]\n# text = "#123456"\n' + suffix,
                )
                self.assertNotIn("theme", tomllib.loads(result))
                with self.assertRaisesRegex(ValueError, "fully commented"):
                    build.replace_block(
                        prefix + header + '\ntext = "#ffffff"\n' + suffix,
                        block,
                        preserve_disabled=True,
                    )
        active = build.replace_block(
            prefix + '[theme.custom] # enabled\ntext = "#ffffff"\n' + suffix,
            block,
            preserve_disabled=True,
        )
        self.assertEqual(
            tomllib.loads(active)["theme"]["custom"]["text"], "#123456"
        )


if __name__ == "__main__":
    unittest.main()
