"""TextMate exports preserve ordered syntax rules and category colors."""

import plistlib
import unittest

import theme_source
from renderers import textmate


class SyntaxTest(unittest.TestCase):
    def test_native_syntax_distinguishes_calls_from_values_and_types(self):
        palette, rules = theme_source.load_dark_theme()
        xml = plistlib.loads(textmate.textmate_theme(palette["colors"], rules))
        expected = {
            "Function references": "#8F9FFF",
            "Function declarations": "#8F9FFF",
            "Function calls": "#8F9FFF",
            "Library functions": "#8F9FFF",
            "Variables": "#F4F2F9",
            "Parameters": "#EBA0AC",
            "Fields and properties": "#8ACFF5",
            "Namespaces and modules": "#FFD18A",
            "Value declarations": "#F4F2F9",
            "Library values": "#F4F2F9",
            "Type references": "#4DC5FD",
            "Library types": "#4DC5FD",
            "Primitive types": "#C9A1FE",
            "Type declarations": "#85BAFE",
            "Word operators": "#C9A1FE",
            "Python logical operators": "#C9A1FE",
            "Symbol operators": "#7EDBD0",
            "Punctuation": "#B1B6D0",
            "Builtin variables": "#FF7C96",
            "Documentation strings": "#7EDBD0",
            "Decorators and attributes": "#FF8F7D",
            "Regular expressions": "#EBA0AC",
        }
        by_name = {rule["name"]: rule["settings"] for rule in xml["settings"][1:]}
        for name, color in expected.items():
            with self.subTest(name=name):
                self.assertEqual(by_name[name]["foreground"], color)
                self.assertEqual(by_name[name]["fontStyle"], "")

    def test_textmate_preserves_rule_order_and_empty_styles(self):
        palette, _ = theme_source.load_dark_theme()
        colors = palette["colors"] | {
            "keyword": "#123456", "string": "#654321"
        }
        rules = theme_source.resolve_token_rules(
            colors,
            [
                {
                    "name": "generic",
                    "scopes": ["variable", "source.python variable"],
                    "role": "keyword",
                    "style": "",
                },
                {
                    "name": "override",
                    "scopes": ["source.python variable"],
                    "role": "string",
                    "style": "bold",
                },
            ],
        )
        expected = [
            {
                "name": "generic",
                "scope": "variable, source.python variable",
                "settings": {"foreground": "#123456", "fontStyle": ""},
            },
            {
                "name": "override",
                "scope": "source.python variable",
                "settings": {"foreground": "#654321", "fontStyle": "bold"},
            },
        ]
        xml = plistlib.loads(textmate.textmate_theme(colors, rules))
        self.assertEqual(xml["settings"][1:], expected)
        self.assertEqual(
            xml["settings"][0]["settings"]["background"],
            colors["background"],
        )
        self.assertEqual(rules, expected)


if __name__ == "__main__":
    unittest.main()
