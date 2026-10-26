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
        self.assertEqual(
            {name for name in original if updated[name] != original[name]},
            {
                ".config/herdr/config.toml",
                ".config/nvim/lua/iris_nocturne/palette.lua",
                ".claude/themes/iris-nocturne.json",
                ".config/fzf/iris-nocturne.sh",
                ".config/lazygit/themes/iris-nocturne.yml",
            },
        )

    def test_exports_share_syntax_and_preserve_source_configuration(self):
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

        self.assertEqual(len(outputs), 21)
        self.assertEqual(
            {name.split("/", 1)[0] for name in outputs},
            {".config", ".codex", ".claude", "vscode"},
        )
        self.assertEqual(
            {name for name in outputs if name.startswith("vscode/")},
            {
                "vscode/iris-nocturne.vsix",
                "vscode/iris-nocturne-color-theme.json",
                "vscode/iris-nocturne.css",
                "vscode/settings.example.json",
            },
        )
        xml = outputs[".config/bat/themes/iris-nocturne.tmTheme"]
        self.assertEqual(outputs[".codex/themes/iris-nocturne.tmTheme"], xml)
        self.assertEqual(
            outputs[".config/yazi/flavors/iris-nocturne.yazi/tmtheme.xml"],
            xml,
        )
        starship = outputs[".config/starship.toml"].decode("utf-8")
        self.assertTrue(starship.startswith('palette = "previous"\n'))
        self.assertTrue(
            starship.endswith('[character]\nsuccess_symbol = "keep"\n')
        )
        starship_colors = tomllib.loads(starship)["palettes"]["iris-nocturne"]
        self.assertEqual(starship_colors["function_reference"], "#8F9FFF")
        self.assertEqual(starship_colors["function"], "#B3A9FF")
        self.assertEqual(starship_colors["lavender"], "#B3A9FF")
        self.assertIn(
            'theme[upload_start]="#B3A9FF"',
            outputs[".config/btop/themes/iris-nocturne.theme"].decode("utf-8"),
        )
        for name, data in outputs.items():
            if name.endswith(".toml"):
                with self.subTest(name=name):
                    tomllib.loads(data.decode("utf-8"))

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
