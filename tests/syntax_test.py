"""TextMate exports preserve ordered syntax rules and category colors."""

import json
import plistlib
import unittest

import theme_source
from renderers import textmate


class SyntaxTest(unittest.TestCase):
    def test_native_syntax_distinguishes_calls_from_values_and_types(self):
        palette, _ = theme_source.load_dark_theme()
        colors = {
            role: f"#{index:06X}"
            for index, role in enumerate(palette["colors"], start=1)
        }
        tokens = json.loads(
            (theme_source.THEME_DIR / "textmate.json").read_text(encoding="utf-8")
        )
        rules = theme_source.resolve_token_rules(colors, tokens)
        xml = plistlib.loads(textmate.textmate_theme(colors, rules))
        expected = {
            "Function references": "function_reference",
            "Function declarations": "function_reference",
            "Function calls": "function_reference",
            "Library functions": "function_reference",
            "Variables": "variable_reference",
            "Parameters": "parameter_reference",
            "Fields and properties": "field_reference",
            "Namespaces and modules": "namespace_reference",
            "Value declarations": "variable_reference",
            "Library values": "variable_reference",
            "Type references": "type_reference",
            "Library types": "type_reference",
            "Primitive types": "builtin_type",
            "Type declarations": "type_declaration",
            "Word operators": "keyword",
            "Python logical operators": "keyword",
            "Symbol operators": "operator",
            "Punctuation": "punctuation",
            "Builtin variables": "builtin_variable",
            "Documentation strings": "documentation",
            "Decorators and attributes": "decorator",
            "Regular expressions": "regexp",
        }
        by_name = {rule["name"]: rule["settings"] for rule in xml["settings"][1:]}
        for name, role in expected.items():
            with self.subTest(name=name):
                self.assertEqual(by_name[name]["foreground"], colors[role])
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
