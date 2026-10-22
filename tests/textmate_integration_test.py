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
                 (1, "build", "#8F9FFF"), (1, "factory", "#8F9FFF"),
                 (1, "param", "#EBA0AC"), (1, "key", "#EBA0AC"),
                 (2, "asarray", "#8F9FFF"), (2, "len", "#8F9FFF"),
                 (2, "dtype", "#EBA0AC"), (2, "int", "#C9A1FE"),
                 (2, "param", "#F4F2F9"), (2, "return", "#C9A1FE"),
             ]),
            ("python", (FIXTURES / "syntax.py").read_text(), [
                # bat's grammar classifies self in this declaration as a parameter.
                (2, "import", "#C9A1FE"), (10, "self", "#EBA0AC"),
                (10, "int", "#C9A1FE"), (10, "nodes", "#EBA0AC"),
                (11, "Return", "#7EDBD0"), (16, "for", "#C9A1FE"),
                (17, "=", "#7EDBD0"), (17, ",", "#B1B6D0"),
                (18, "if", "#C9A1FE"), (18, "not", "#C9A1FE"),
                (18, "in", "#C9A1FE"), (18, "and", "#C9A1FE"),
                (19, "try", "#C9A1FE"), (20, "self", "#FF7C96"),
                (20, "+", "#7EDBD0"),
                (20, "\\n", "#FF8F7D"), (24, "except", "#C9A1FE"),
                (26, "finally", "#C9A1FE"), (32, "await", "#C9A1FE"),
            ]),
            ("markdown", (FIXTURES / "syntax.md").read_text(), [
                (1, "Syntax", "#9CBFFF"), (3, ">", "#EBA0AC"),
                (5, "https", "#8ACFF5"), (6, "inline_code", "#FF981F"),
            ]),
            ("json", (FIXTURES / "syntax.json").read_text(), [
                (2, "enabled", "#8ACFF5"), (2, "true", "#D2B5FF"),
                (3, "16", "#7DD300"), (4, "graph", "#FF981F"),
            ]),
            ("yaml", (FIXTURES / "syntax.yaml").read_text(), [
                (1, "defaults", "#8ACFF5"), (1, "base", "#FFD18A"),
                (2, "true", "#D2B5FF"), (3, "16", "#7DD300"),
                (4, "base", "#FFD18A"),
            ]),
            ("toml", (FIXTURES / "syntax.toml").read_text(), [
                (1, "filter", "#FFD18A"), (2, "enabled", "#8ACFF5"),
                (2, "=", "#7EDBD0"), (2, "true", "#D2B5FF"),
                (3, "16", "#7DD300"), (4, "2026", "#7DD300"),
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
                for row, word, expected in checks:
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
                                {expected},
                            )


if __name__ == "__main__":
    unittest.main()
