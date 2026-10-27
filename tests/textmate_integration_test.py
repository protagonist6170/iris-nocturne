"""Check real grammar output with an isolated bat theme and cache."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

import theme_source
from renderers import textmate

FIXTURES = Path(__file__).with_name("fixtures")


def colored_lines(output):
    """Read the actual foreground attached to every emitted character."""
    plain, colors, color, end = "", [], None, 0
    for match in re.finditer(r"\x1b\[([0-9;]*)m", output):
        chunk = output[end:match.start()]
        plain += chunk
        colors.extend([color] * len(chunk))
        codes = [int(code) for code in match[1].split(";") if code]
        index = 0
        while index < len(codes):
            if codes[index:index + 2] == [38, 2]:
                color = "#%02X%02X%02X" % tuple(codes[index + 2:index + 5])
                index += 4
            elif codes[index] in (0, 39):
                color = None
            index += 1
        end = match.end()
    plain += output[end:]
    colors.extend([color] * len(output[end:]))
    lines, offset = [], 0
    for line in plain.splitlines(keepends=True):
        lines.append((line, colors[offset:offset + len(line)]))
        offset += len(line)
    return lines


@unittest.skipUnless(shutil.which("bat"), "bat is not installed")
class TextMateIntegrationTest(unittest.TestCase):
    def test_real_grammars_preserve_symbol_and_structure_categories(self):
        palette, rules = theme_source.load_dark_theme()
        cases = [
            ("python", 'def build(param=factory(key="text")):\n'
             '    return np.asarray(param, dtype=int), len(param), 2\n', [
                 (1, "build", "function_reference"),
                 (1, "factory", "function_reference"),
                 (1, "param", "parameter_reference"),
                 (1, "key", "parameter_reference"),
                 (2, "asarray", "function_reference"),
                 (2, "len", "function_reference"),
                 (2, "dtype", "parameter_reference"), (2, "int", "builtin_type"),
                 # bat leaves these argument references at the default foreground.
                 (2, "param", "foreground"), (2, "return", "keyword"),
             ]),
            ("python", (FIXTURES / "syntax.py").read_text(), [
                # bat's grammar classifies self in this declaration as a parameter.
                (2, "import", "keyword"), (10, "self", "parameter_reference"),
                (10, "int", "builtin_type"),
                (10, "nodes", "parameter_reference"),
                (11, "Return", "documentation"), (16, "for", "keyword"),
                (17, "=", "operator"), (17, ",", "punctuation"),
                (18, "if", "keyword"), (18, "not", "keyword"),
                (18, "in", "keyword"), (18, "and", "keyword"),
                (19, "try", "keyword"), (20, "self", "builtin_variable"),
                (20, "+", "operator"),
                (20, "\\n", "preprocessor"), (24, "except", "keyword"),
                (26, "finally", "keyword"), (32, "await", "keyword"),
            ]),
            ("markdown", (FIXTURES / "syntax.md").read_text(), [
                (1, "Syntax", "type"), (3, ">", "parameter_reference"),
                (5, "https", "member"), (6, "inline_code", "string"),
            ]),
            ("json", (FIXTURES / "syntax.json").read_text(), [
                (2, "enabled", "field_reference"), (2, "true", "constant"),
                (3, "16", "number"), (4, "graph", "string"),
            ]),
            ("yaml", (FIXTURES / "syntax.yaml").read_text(), [
                (1, "defaults", "field_reference"),
                (1, "base", "namespace_reference"),
                (2, "true", "constant"), (3, "16", "number"),
                (4, "base", "namespace_reference"),
            ]),
            ("toml", (FIXTURES / "syntax.toml").read_text(), [
                (1, "filter", "namespace_reference"), (2, "enabled", "field_reference"),
                (2, "=", "operator"), (2, "true", "constant"),
                (3, "16", "number"), (4, "2026", "number"),
            ]),
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            themes = root / "themes"
            themes.mkdir()
            (themes / "iris-nocturne.tmTheme").write_bytes(
                textmate.textmate_theme(palette["colors"], rules)
            )
            env = os.environ | {
                "BAT_CONFIG_PATH": os.devnull,
                "BAT_CACHE_PATH": str(root / "cache"),
                "COLORTERM": "truecolor",
            }
            subprocess.run(
                ["bat", "cache", "--build", "--source", str(root)],
                env=env, check=True, capture_output=True,
            )
            for language, source, checks in cases:
                result = subprocess.run(
                    ["bat", "--color=always", "--style=plain", "--paging=never",
                     "--theme=iris-nocturne", "--language=" + language],
                    input=source, text=True, env=env, check=True,
                    capture_output=True,
                )
                lines = colored_lines(result.stdout)
                for row, word, role in checks:
                    line, colors = lines[row - 1]
                    pattern = re.escape(word)
                    if word.isidentifier() or word.isdecimal():
                        pattern = r"(?<!\w)" + pattern + r"(?!\w)"
                    matches = list(re.finditer(pattern, line))
                    self.assertTrue(matches, (language, row, word))
                    for match in matches:
                        with self.subTest(language=language, row=row,
                                          word=word, column=match.start()):
                            self.assertEqual(
                                set(colors[match.start():match.end()]),
                                {palette["colors"][role]},
                            )


if __name__ == "__main__":
    unittest.main()
