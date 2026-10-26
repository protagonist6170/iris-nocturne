"""Check VS Code's package contract and shared syntax/semantic behavior."""

import io
import json
import re
import shutil
import struct
import subprocess
import unittest
import xml.etree.ElementTree as element_tree
import zipfile

import theme_source
from renderers import vscode


class VscodeTest(unittest.TestCase):
    def setUp(self):
        self.palette, self.rules = theme_source.load_dark_theme()
        self.outputs = vscode.resources(
            self.palette["colors"], self.palette["ansi"], self.rules
        )

    def test_vsix_installs_the_same_theme_and_bundles_the_background_manager(self):
        package = self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne.vsix"]
        self.assertEqual(
            package,
            vscode.resources(
                self.palette["colors"], self.palette["ansi"], self.rules
            )[f"{vscode.EXPORT_DIR}/iris-nocturne.vsix"],
        )
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            manifest = json.loads(archive.read("extension/package.json"))
            (contribution,) = manifest["contributes"]["themes"]
            path = "extension/" + contribution["path"].removeprefix("./")
            theme = archive.read(path)
            self.assertEqual(
                theme,
                self.outputs[
                    f"{vscode.EXPORT_DIR}/iris-nocturne-color-theme.json"
                ],
            )
            xml = element_tree.fromstring(
                archive.read("extension.vsixmanifest")
            )
            identity = xml.find("{*}Metadata/{*}Identity")
            self.assertEqual(identity.attrib["Version"], manifest["version"])
            self.assertEqual(
                identity.attrib["Publisher"], manifest["publisher"]
            )
            self.assertEqual(manifest["main"], "./background/extension.js")
            self.assertEqual(manifest["extensionKind"], ["ui"])
            for filename in (
                "extension.js", "background.js", "managed-appearance.json"
            ):
                self.assertEqual(
                    archive.read("extension/background/" + filename),
                    (theme_source.THEME_DIR / "assets/vscode" / filename).read_bytes(),
                )
            self.assertNotIn("browser", manifest)
            self.assertEqual(manifest["activationEvents"], ["onStartupFinished"])
            self.assertEqual(set(manifest["contributes"]), {"themes", "commands", "configuration"})
            self.assertEqual(len(manifest["contributes"]["commands"]), 4)
            icon_path = "extension/" + manifest["icon"]
            icon = archive.read(icon_path)
            self.assertEqual(
                icon,
                (theme_source.THEME_DIR / "assets/vscode/icon.png").read_bytes(),
            )
            self.assertEqual(icon[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", icon[16:24]), (256, 256))
            self.assertEqual(xml.find("{*}Metadata/{*}Icon").text, icon_path)
            self.assertTrue(any(
                asset.attrib.get("Type")
                == "Microsoft.VisualStudio.Services.Icons.Default"
                and asset.attrib.get("Path") == icon_path
                for asset in xml.findall("{*}Assets/{*}Asset")
            ))
            self.assertEqual(
                archive.read("extension/background/iris-nocturne.css"),
                self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne.css"],
            )
            settings = archive.read("extension/background/settings.example.json")
            self.assertEqual(
                settings,
                self.outputs[f"{vscode.EXPORT_DIR}/settings.example.json"],
            )
            readme = archive.read("extension/README.md")
            self.assertEqual(
                readme,
                (theme_source.THEME_DIR / "docs/vscode.md").read_bytes(),
            )
            self.assertIn("Iris Nocturne: Enable Gradient", readme.decode())
            content_types = element_tree.fromstring(
                archive.read("[Content_Types].xml")
            )
            self.assertTrue(any(
                entry.attrib.get("Extension") == "css"
                and entry.attrib.get("ContentType") == "text/css"
                for entry in content_types
            ))
            self.assertTrue(any(
                entry.attrib.get("Extension") == "png"
                and entry.attrib.get("ContentType") == "image/png"
                for entry in content_types
            ))

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for background transactions")
    def test_background_transactions_and_recovery(self):
        result = subprocess.run(
            [
                "node", "--test", "tests/vscode_background_test.cjs",
                "tests/vscode_extension_test.cjs",
            ],
            cwd=theme_source.THEME_DIR, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_semantic_rules_preserve_categories_and_only_type_constant_shades(
        self,
    ):
        theme = json.loads(
            self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne-color-theme.json"]
        )
        self.assertEqual(theme["tokenColors"], self.rules)
        self.assertTrue(theme["semanticHighlighting"])
        semantics = theme["semanticTokenColors"]
        colors = self.palette["colors"]
        for token, role in {
            "function": "function_reference",
            "method": "function_reference",
            "variable": "variable_reference",
            "parameter": "parameter_reference",
            "property": "field_reference",
            "namespace": "namespace_reference",
            "type": "type_reference",
            "enumMember": "member_reference",
        }.items():
            with self.subTest(token=token):
                self.assertEqual(semantics[token]["foreground"], colors[role])
                self.assertEqual(semantics[token]["fontStyle"], "")
        self.assertEqual(
            semantics["class.declaration"], colors["type_declaration"]
        )
        self.assertEqual(
            semantics["enumMember.definition"], colors["member_declaration"]
        )
        self.assertNotIn("variable.readonly", semantics)
        self.assertNotIn("function.defaultLibrary", semantics)
        self.assertNotIn("parameter.declaration", semantics)
        self.assertEqual(semantics["*.deprecated"], {"strikethrough": True})
        for index, name in enumerate(
            (
                "Black",
                "Red",
                "Green",
                "Yellow",
                "Blue",
                "Magenta",
                "Cyan",
                "White",
                "BrightBlack",
                "BrightRed",
                "BrightGreen",
                "BrightYellow",
                "BrightBlue",
                "BrightMagenta",
                "BrightCyan",
                "BrightWhite",
            )
        ):
            self.assertEqual(
                theme["colors"]["terminal.ansi" + name],
                self.palette["ansi"][index],
            )

    def test_optional_background_is_self_contained_and_keeps_native_fallback(
        self,
    ):
        stylesheet = self.outputs[
            f"{vscode.EXPORT_DIR}/iris-nocturne.css"
        ].decode()
        self.assertNotIn("{{", stylesheet)
        self.assertIn("data:image/png;base64,", stylesheet)
        self.assertNotIn("https://", stylesheet)
        self.assertIn(".editor-group-container:not(.active)::after", stylesheet)
        settings = json.loads(
            self.outputs[f"{vscode.EXPORT_DIR}/settings.example.json"]
        )
        self.assertEqual(settings["workbench.colorTheme"], "Iris Nocturne")
        self.assertEqual(set(settings), {
            "workbench.colorTheme", "window.titleBarStyle",
            "workbench.colorCustomizations",
        })
        self.assertEqual(set(settings["workbench.colorCustomizations"]), {
            "[Iris Nocturne]",
        })
        appearance = json.loads(
            (theme_source.THEME_DIR / "assets/vscode/managed-appearance.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertNotIn("workbench.colorTheme", appearance)
        self.assertEqual(
            settings,
            {"workbench.colorTheme": "Iris Nocturne", **appearance},
        )
        self.assertEqual(
            len(appearance) - 1
            + len(appearance["workbench.colorCustomizations"]["[Iris Nocturne]"]),
            6,
        )
        theme = json.loads(
            self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne-color-theme.json"]
        )
        for name, role in {
            "editor.background": "background",
            "terminal.background": "background",
            "sideBar.background": "surface",
            "panel.background": "surface",
        }.items():
            with self.subTest(surface=name):
                self.assertEqual(
                    theme["colors"][name], self.palette["colors"][role]
                )
        for name in (
            "toolbar.hoverBackground",
            "modernActivityBarItem.hoverBackground",
        ):
            with self.subTest(hover=name):
                self.assertEqual(theme["colors"][name], "#37365F")

    def test_floating_surfaces_match_between_native_theme_and_background(self):
        theme = json.loads(
            self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne-color-theme.json"]
        )["colors"]
        css = self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne.css"].decode()
        for name in (
            "editorWidget.background", "editorSuggestWidget.background",
            "editorHoverWidget.background", "quickInput.background",
            "menu.background", "notifications.background",
            "editorWidget.border", "editorSuggestWidget.border",
            "editorHoverWidget.border",
        ):
            with self.subTest(surface=name):
                variable = "--vscode-" + name.replace(".", "-")
                match = re.search(re.escape(variable) + r":\s*(#[0-9a-fA-F]+)", css)
                self.assertIsNotNone(match)
                self.assertEqual(match[1], theme[name])
                self.assertEqual(len(theme[name]), 7)
        self.assertEqual(
            theme["notificationCenterHeader.background"],
            theme["notifications.background"],
        )
        self.assertEqual(theme["button.secondaryBackground"], "#2C3550")
        self.assertEqual(theme["button.secondaryHoverBackground"], "#38415D")
        self.assertEqual(theme["statusBarItem.prominentBackground"], "#2C3550")
        self.assertEqual(theme["statusBarItem.prominentHoverBackground"], "#38415D")

    def test_tree_surfaces_have_solid_fallbacks_and_distinct_gradient_states(self):
        theme = json.loads(
            self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne-color-theme.json"]
        )["colors"]
        css = self.outputs[f"{vscode.EXPORT_DIR}/iris-nocturne.css"].decode()
        for region in ("sideBar", "panel"):
            with self.subTest(region=region):
                self.assertEqual(
                    theme[f"{region}StickyScroll.background"],
                    self.palette["colors"]["surface"],
                )
                self.assertEqual(
                    theme[f"{region}SectionHeader.background"],
                    self.palette["colors"]["raised"],
                )
                self.assertEqual(
                    theme[f"{region}StickyScroll.border"], "#A7A1CF3B"
                )
                self.assertEqual(
                    theme[f"{region}StickyScroll.shadow"], "#00000000"
                )
        for name, color in {
            "tree.indentGuidesStroke": "#B1B6D040",
            "tree.inactiveIndentGuidesStroke": "#B1B6D01F",
            "multiDiffEditor.headerBackground": "#302B57",
            "multiDiffEditor.border": "#45516D",
            "terminalStickyScroll.background": "#2C3550",
            "terminalStickyScrollHover.background": "#38415D",
        }.items():
            with self.subTest(color=name):
                self.assertEqual(theme[name], color)
        # Inspect the exported stylesheet, including expansion of every state.
        states = set(re.findall(
            r"--iris-row-state:\s*(#[0-9A-Fa-f]+)", css
        ))
        self.assertEqual(states, {
            "#A8A2EC1C", "#9DA9FF30", "#9DA9FF18", "#9DA9FF24",
            "#9DA9FF40",
        })
        self.assertNotIn("{{", css)
        # Scoped tree colors must not recolor floating list widgets globally.
        self.assertEqual(theme["list.hoverBackground"], "#38415D")
        self.assertEqual(theme["quickInputList.focusBackground"], "#363D70")


if __name__ == "__main__":
    unittest.main()
