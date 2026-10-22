"""Validation of shared palettes and syntax inputs."""

import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

import theme_source

ROOT = Path(__file__).resolve().parents[1]


class ThemeSourceTest(unittest.TestCase):
    def test_invalid_syntax_rules_are_rejected_before_rendering(self):
        token = {
            "name": "keyword", "scopes": ["keyword"],
            "role": "keyword", "style": "",
        }
        invalid = [
            None, {}, [None], [{}],
            *[
                [{**token, key: value}]
                for key, value in (
                    ("name", None), ("role", None), ("style", None),
                    ("scopes", "keyword"), ("scopes", [1]),
                    ("role", "unknown"),
                )
            ],
        ]
        for tokens in invalid:
            with self.subTest(tokens=tokens):
                with self.assertRaises(ValueError):
                    theme_source.resolve_token_rules(
                        {"keyword": "#123456"}, tokens
                    )

    def test_shared_loader_keeps_rgb_and_ansi_validation(self):
        palette, _ = theme_source.load_dark_theme()
        invalid = [
            palette | {"ansi": palette["ansi"][:-1]},
            palette | {"colors": palette["colors"] | {"keyword": "bad"}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            shutil.copy2(ROOT / "textmate.json", source / "textmate.json")
            with mock.patch.object(theme_source, "THEME_DIR", source):
                for sample in invalid:
                    with self.subTest(palette=sample):
                        (source / "palette.json").write_text(
                            json.dumps(sample), encoding="utf-8"
                        )
                        with self.assertRaisesRegex(ValueError, "RGB.*16 ANSI"):
                            theme_source.load_dark_theme()


if __name__ == "__main__":
    unittest.main()
