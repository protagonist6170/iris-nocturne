"""Render a native VS Code theme and the optional Direction D background."""

import base64
import io
import json
import zipfile

import theme_source

VERSION = "0.1.0"
EXPORT_DIR = "vscode"

# Direction D's application chrome is local to this adapter. Keep its native
# theme and optional stylesheet in agreement without changing shared colors.
D_CHROME = {
    "TITLEBAR": "#302A58",
    "TABS": "#2D2855",
    "ACTIVE_TAB": "#47416F",
    "UNFOCUSED_TAB": "#3A355F",
    "SCROLLBAR": "#A6B6E042",
    "SCROLLBAR_HOVER": "#A6B6E066",
    "SCROLLBAR_ACTIVE": "#B5C5EE8C",
    "SIDEBAR_TITLE": "#302B57",
    "SIDEBAR_HOVER": "#37365F",
    "TREE_HOVER": "#A8A2EC1C",
    "TREE_SELECTION": "#9DA9FF30",
    "TREE_INACTIVE_SELECTION": "#9DA9FF18",
    "TREE_FOCUS": "#9DA9FF24",
    "TREE_FOCUS_BORDER": "#9DA9FF",
    "TREE_DROP": "#9DA9FF40",
    "TREE_GUIDE": "#B1B6D040",
    "TREE_INACTIVE_GUIDE": "#B1B6D01F",
    "TREE_STICKY_BORDER": "#A7A1CF3B",
    "CURRENT_LINE": "#2E3457",
    "FLOATING_SURFACE": "#2C3550",
    "FLOATING_INPUT": "#253049",
    "FLOATING_HOVER": "#38415D",
    "FLOATING_BORDER": "#45516D",
}


def _json(data: object) -> bytes:
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()


def _workbench_colors(
    colors: dict[str, str], ansi: list[str]
) -> dict[str, str]:
    """Map native workbench roles; the stylesheet adds gradients separately."""
    roles = {
        "background": (
            "editor.background",
            "editorGroup.emptyBackground",
            "editorGutter.background",
            "terminal.background",
            "tab.activeBackground",
            "tab.unfocusedActiveBackground",
            "notebook.editorBackground",
            "minimap.background",
        ),
        "foreground": (
            "foreground",
            "editor.foreground",
            "terminal.foreground",
            "tab.activeForeground",
            "list.activeSelectionForeground",
            "list.inactiveSelectionForeground",
            "list.hoverForeground",
            "input.foreground",
            "dropdown.foreground",
            "menu.foreground",
            "button.foreground",
            "editorWidget.foreground",
            "editorSuggestWidget.foreground",
            "editorHoverWidget.foreground",
            "quickInput.foreground",
            "notifications.foreground",
            "descriptionForeground",
            "settings.headerForeground",
        ),
        "surface": (
            "sideBar.background",
            "activityBar.background",
            "panel.background",
            "statusBar.background",
            "statusBar.noFolderBackground",
            "statusBar.debuggingBackground",
            "titleBar.activeBackground",
            "titleBar.inactiveBackground",
            "editorGroupHeader.tabsBackground",
            "editorGroupHeader.noTabsBackground",
            "tab.inactiveBackground",
            "tab.unfocusedInactiveBackground",
            "notebook.cellEditorBackground",
            "breadcrumb.background",
            "sideBarStickyScroll.background",
            "panelStickyScroll.background",
        ),
        "raised": (
            "sideBarSectionHeader.background",
            "panelSectionHeader.background",
        ),
        "floating_surface": (
            "editorWidget.background",
            "editorSuggestWidget.background",
            "editorHoverWidget.background",
            "editorHoverWidget.statusBarBackground",
            "quickInput.background",
            "quickInputTitle.background",
            "dropdown.listBackground",
            "menu.background",
            "notifications.background",
            "notificationCenterHeader.background",
            "peekViewEditor.background",
            "peekViewResult.background",
            "peekViewTitle.background",
            "button.secondaryBackground",
            "terminalStickyScroll.background",
            "editorActionList.background",
            "editorMarkerNavigation.background",
            "listFilterWidget.background",
            "debugToolBar.background",
            "statusBarItem.prominentBackground",
        ),
        "floating_input": (
            "input.background",
            "dropdown.background",
            "settings.textInputBackground",
            "settings.dropdownBackground",
        ),
        "floating_hover": (
            "list.hoverBackground",
            "button.secondaryHoverBackground",
            "statusBarItem.prominentHoverBackground",
            "terminalStickyScrollHover.background",
        ),
        "border": (
            "sideBar.border",
            "panel.border",
            "statusBar.border",
            "titleBar.border",
            "editorGroup.border",
            "editorGroupHeader.tabsBorder",
            "tab.border",
            "notebook.cellBorderColor",
            "notebook.inactiveFocusedCellBorder",
            "notebook.inactiveSelectedCellBorder",
            "notebook.outputContainerBorderColor",
        ),
        "floating_border": (
            "input.border",
            "dropdown.border",
            "menu.border",
            "editorWidget.border",
            "editorSuggestWidget.border",
            "editorHoverWidget.border",
            "notifications.border",
            "notificationToast.border",
            "widget.border",
            "pickerGroup.border",
            "settings.textInputBorder",
            "settings.dropdownBorder",
            "debugToolBar.border",
        ),
        "muted": (
            "sideBar.foreground",
            "sideBarTitle.foreground",
            "sideBarSectionHeader.foreground",
            "activityBar.inactiveForeground",
            "tab.inactiveForeground",
            "tab.unfocusedActiveForeground",
            "tab.unfocusedInactiveForeground",
            "statusBar.foreground",
            "statusBar.noFolderForeground",
            "statusBar.debuggingForeground",
            "titleBar.activeForeground",
            "titleBar.inactiveForeground",
            "panelTitle.inactiveForeground",
            "breadcrumb.foreground",
            "editorSuggestWidgetStatus.foreground",
            "button.secondaryForeground",
            "terminalCursor.foreground",
            "gitDecoration.ignoredResourceForeground",
        ),
        "subtle": (
            "editorLineNumber.foreground",
            "editorWhitespace.foreground",
            "editorIndentGuide.background1",
            "editorRuler.foreground",
            "disabledForeground",
            "input.placeholderForeground",
            "terminalCommandDecoration.defaultBackground",
        ),
        "accent": (
            "focusBorder",
            "editorCursor.foreground",
            "editorLineNumber.activeForeground",
            "activityBar.foreground",
            "activityBar.activeBorder",
            "tab.activeBorderTop",
            "panelTitle.activeBorder",
            "panelTitle.activeForeground",
            "breadcrumb.activeSelectionForeground",
            "breadcrumb.focusForeground",
            "list.highlightForeground",
            "list.focusHighlightForeground",
            "list.focusOutline",
            "list.activeSelectionIconForeground",
            "editorSuggestWidget.highlightForeground",
            "textLink.foreground",
            "textLink.activeForeground",
            "pickerGroup.foreground",
            "progressBar.background",
            "notebook.focusedCellBorder",
            "notebook.focusedEditorBorder",
            "notebook.cellInsertionIndicator",
            "peekView.border",
            "settings.modifiedItemIndicator",
            "activityBarBadge.background",
            "badge.background",
        ),
        "selection": (
            "editor.selectionBackground",
            "editor.inactiveSelectionBackground",
            "terminal.selectionBackground",
            "terminal.inactiveSelectionBackground",
            "list.activeSelectionBackground",
            "list.inactiveSelectionBackground",
            "list.focusBackground",
            "editorSuggestWidget.selectedBackground",
            "quickInputList.focusBackground",
            "menu.selectionBackground",
            "notebook.selectedCellBackground",
            "button.background",
        ),
        "line": (
            "editor.lineHighlightBackground",
            "toolbar.hoverBackground",
            "notebook.focusedCellBackground",
            "notebook.cellHoverBackground",
            "notebook.cellStatusBarItemHoverBackground",
        ),
        "search": (
            "editor.findMatchBackground",
            "editor.findMatchHighlightBackground",
            "editor.findRangeHighlightBackground",
            "peekViewResult.selectionBackground",
        ),
        "error": (
            "errorForeground",
            "editorError.foreground",
            "editorGutter.deletedBackground",
            "gitDecoration.deletedResourceForeground",
            "gitDecoration.conflictingResourceForeground",
            "terminalCommandDecoration.errorBackground",
            "debugIcon.stopForeground",
            "inputValidation.errorBorder",
        ),
        "warning": (
            "editorWarning.foreground",
            "list.warningForeground",
            "editorLightBulb.foreground",
            "inputValidation.warningBorder",
            "gitDecoration.untrackedResourceForeground",
        ),
        "info": (
            "editorInfo.foreground",
            "inputValidation.infoBorder",
            "editorGutter.modifiedBackground",
            "gitDecoration.modifiedResourceForeground",
        ),
        "hint": ("editorHint.foreground", "debugIcon.startForeground"),
        "added": (
            "editorGutter.addedBackground",
            "gitDecoration.addedResourceForeground",
            "terminalCommandDecoration.successBackground",
        ),
    }
    workbench_colors = colors | {
        "floating_surface": D_CHROME["FLOATING_SURFACE"],
        "floating_input": D_CHROME["FLOATING_INPUT"],
        "floating_hover": D_CHROME["FLOATING_HOVER"],
        "floating_border": D_CHROME["FLOATING_BORDER"],
    }
    result = {
        name: workbench_colors[role]
        for role, names in roles.items()
        for name in names
    }
    result.update(
        {
            "activityBarBadge.foreground": colors["background"],
            "badge.foreground": colors["background"],
            "editorCursor.background": colors["background"],
            "terminalCursor.background": colors["background"],
            "editor.selectionHighlightBackground": colors["selection"] + "66",
            "editor.wordHighlightBackground": colors["selection"] + "66",
            "editor.wordHighlightStrongBackground": colors["selection"] + "99",
            "editor.findMatchBorder": colors["warning"] + "80",
            "editorOverviewRuler.errorForeground": colors["error"] + "B0",
            "editorOverviewRuler.warningForeground": colors["warning"] + "B0",
            "editorOverviewRuler.infoForeground": colors["info"] + "B0",
            "titleBar.activeBackground": D_CHROME["TITLEBAR"],
            "titleBar.inactiveBackground": D_CHROME["TITLEBAR"],
            "sideBarTitle.background": D_CHROME["SIDEBAR_TITLE"],
            "sideBarStickyScroll.border": D_CHROME["TREE_STICKY_BORDER"],
            "panelStickyScroll.border": D_CHROME["TREE_STICKY_BORDER"],
            "sideBarStickyScroll.shadow": "#00000000",
            "panelStickyScroll.shadow": "#00000000",
            "tree.indentGuidesStroke": D_CHROME["TREE_GUIDE"],
            "tree.inactiveIndentGuidesStroke": D_CHROME["TREE_INACTIVE_GUIDE"],
            "multiDiffEditor.headerBackground": D_CHROME["SIDEBAR_TITLE"],
            "multiDiffEditor.border": D_CHROME["FLOATING_BORDER"],
            "toolbar.hoverBackground": D_CHROME["SIDEBAR_HOVER"],
            "modernActivityBarItem.hoverBackground": D_CHROME["SIDEBAR_HOVER"],
            "editor.lineHighlightBackground": D_CHROME["CURRENT_LINE"],
            "editorStickyScroll.background": D_CHROME["SIDEBAR_TITLE"],
            "editorStickyScrollGutter.background": D_CHROME["SIDEBAR_TITLE"],
            "editorStickyScrollHover.background": D_CHROME["SIDEBAR_HOVER"],
            "editorGroupHeader.tabsBackground": D_CHROME["TABS"],
            "editorGroupHeader.noTabsBackground": D_CHROME["TABS"],
            "tab.activeBackground": D_CHROME["ACTIVE_TAB"],
            "tab.inactiveBackground": D_CHROME["TABS"],
            "tab.unfocusedActiveBackground": D_CHROME["UNFOCUSED_TAB"],
            "tab.unfocusedInactiveBackground": D_CHROME["TABS"],
            "commandCenter.background": "#B0A6DC16",
            "commandCenter.border": "#A7A1CF3B",
            "scrollbar.shadow": "#00000000",
            "editorOverviewRuler.background": "#00000000",
            "scrollbarSlider.background": D_CHROME["SCROLLBAR"],
            "scrollbarSlider.hoverBackground": D_CHROME["SCROLLBAR_HOVER"],
            "scrollbarSlider.activeBackground": D_CHROME["SCROLLBAR_ACTIVE"],
            "minimapSlider.background": D_CHROME["SCROLLBAR"],
            "minimapSlider.hoverBackground": D_CHROME["SCROLLBAR_HOVER"],
            "minimapSlider.activeBackground": D_CHROME["SCROLLBAR_ACTIVE"],
            "diffEditor.insertedLineBackground": colors["diff_add"] + "99",
            "diffEditor.removedLineBackground": colors["diff_delete"] + "99",
            "diffEditor.insertedTextBackground": colors["diff_add_emphasis"]
            + "B0",
            "diffEditor.removedTextBackground": colors["diff_delete_emphasis"]
            + "B0",
            "diffEditor.diagonalFill": colors["border"] + "66",
            "inputValidation.errorBackground": colors["diff_delete"],
            "inputValidation.warningBackground": colors["search"],
            "inputValidation.infoBackground": colors["diff_change"],
            "notebook.outputContainerBackgroundColor": colors["background"],
            "editorBracketMatch.background": colors["selection"] + "80",
            "editorBracketMatch.border": colors["accent"] + "80",
            "editorIndentGuide.activeBackground1": colors["border"],
            "button.hoverBackground": colors["border"],
            "widget.shadow": "#00000050",
        }
    )
    names = (
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
    result.update(
        ("terminal.ansi" + name, color)
        for name, color in zip(names, ansi, strict=True)
    )
    result.update(
        (f"editorBracketHighlight.foreground{index}", colors["muted"])
        for index in range(1, 7)
    )
    return result


def color_theme(
    colors: dict[str, str], ansi: list[str], rules: list[theme_source.TokenRule]
) -> bytes:
    """Keep TextMate rules intact and give semantic symbols the same roles."""
    semantic_roles = {
        "namespace": "namespace_reference",
        "type": "type_reference",
        "class": "type_reference",
        "interface": "type_reference",
        "struct": "type_reference",
        "enum": "type_reference",
        "typeParameter": "type_reference",
        "function": "function_reference",
        "method": "function_reference",
        "variable": "variable_reference",
        "parameter": "parameter_reference",
        "property": "field_reference",
        "enumMember": "member_reference",
        "keyword": "keyword",
        "operator": "operator",
        "string": "string",
        "number": "number",
        "regexp": "regexp",
        "decorator": "decorator",
        "macro": "preprocessor",
        "selfParameter": "builtin_variable",
        "clsParameter": "builtin_variable",
        "intrinsic": "builtin_type",
        "module": "namespace_reference",
        "magicFunction": "function_reference",
        "builtinConstant": "constant",
        "parenthesis": "punctuation",
        "curlybrace": "punctuation",
        "bracket": "punctuation",
        "colon": "punctuation",
        "semicolon": "punctuation",
        "arrow": "operator",
    }
    semantic: dict[str, object] = {
        token: {"foreground": colors[role], "fontStyle": ""}
        for token, role in semantic_roles.items()
    }
    for token in (
        "type",
        "class",
        "interface",
        "struct",
        "enum",
        "typeParameter",
    ):
        for modifier in ("declaration", "definition"):
            semantic[f"{token}.{modifier}"] = colors["type_declaration"]
    for modifier in ("declaration", "definition"):
        semantic[f"enumMember.{modifier}"] = colors["member_declaration"]
    semantic["comment"] = {"foreground": colors["comment"], "italic": True}
    semantic["*.deprecated"] = {"strikethrough": True}
    return _json(
        {
            "$schema": "vscode://schemas/color-theme",
            "name": "Iris Nocturne",
            "type": "dark",
            "semanticHighlighting": True,
            "colors": _workbench_colors(colors, ansi),
            "tokenColors": rules,
            "semanticTokenColors": semantic,
        }
    )


def _vsix(theme: bytes, stylesheet: bytes, settings: bytes) -> bytes:
    """Package the theme and local background manager reproducibly."""
    manifest = {
        "name": "iris-nocturne",
        "displayName": "Iris Nocturne",
        "description": "A blue-violet dark theme inspired by Neon Noir.",
        "version": VERSION,
        "publisher": "protagonist",
        "license": "MIT",
        "engines": {"vscode": "^1.90.0"},
        "categories": ["Themes"],
        "icon": "images/icon.png",
        "main": "./background/extension.js",
        "extensionKind": ["ui"],
        "activationEvents": ["onStartupFinished"],
        "contributes": {
            "commands": [
                {"command": "irisNocturne." + command,
                 "title": "Iris Nocturne: " + title}
                for command, title in (
                    ("enableGradient", "Enable Gradient"),
                    ("disableGradient", "Disable Gradient"),
                    ("restoreAppearance", "Restore Previous Appearance"),
                    ("reapplyBackground", "Reapply Background"),
                )
            ],
            "configuration": {
                "title": "Iris Nocturne",
                "properties": {
                    "irisNocturne.customCssImports": {
                        "type": "array", "items": {"type": "string"},
                        "default": [], "scope": "machine",
                        "description": "CSS URLs migrated from the legacy loader. Run Reapply Background after changes.",
                    },
                },
            },
            "themes": [
                {
                    "label": "Iris Nocturne",
                    "uiTheme": "vs-dark",
                    "path": "./themes/iris-nocturne-color-theme.json",
                }
            ]
        },
    }
    vsix_manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="iris-nocturne" Version="{VERSION}" Publisher="protagonist"/>
    <DisplayName>Iris Nocturne</DisplayName>
    <Description xml:space="preserve">A blue-violet dark theme inspired by Neon Noir.</Description>
    <Tags>theme,dark</Tags><Categories>Themes</Categories>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/></Properties>
    <License>extension/LICENSE</License>
    <Icon>extension/images/icon.png</Icon>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/images/icon.png" Addressable="true"/>
  </Assets>
</PackageManifest>
'''
    content_types = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="css" ContentType="text/css"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="" ContentType="text/plain"/>
</Types>
"""
    files = {
        "[Content_Types].xml": content_types.encode(),
        "extension.vsixmanifest": vsix_manifest.encode(),
        "extension/package.json": _json(manifest),
        "extension/themes/iris-nocturne-color-theme.json": theme,
        "extension/background/iris-nocturne.css": stylesheet,
        **{
            "extension/background/" + name: (
                theme_source.THEME_DIR / "assets/vscode" / name
            ).read_bytes()
            for name in (
                "extension.js", "background.js", "managed-appearance.json"
            )
        },
        "extension/background/settings.example.json": settings,
        "extension/images/icon.png": (
            theme_source.THEME_DIR / "assets/vscode/icon.png"
        ).read_bytes(),
        "extension/README.md": (
            theme_source.THEME_DIR / "docs/vscode.md"
        ).read_bytes(),
        "extension/LICENSE": (theme_source.THEME_DIR / "LICENSE").read_bytes(),
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(
        buffer, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        for name, data in files.items():
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    return buffer.getvalue()


def resources(
    colors: dict[str, str], ansi: list[str], rules: list[theme_source.TokenRule]
) -> dict[str, bytes]:
    """Bundle optional CSS in the VSIX and also export inspectable resources."""
    theme = color_theme(colors, ansi, rules)
    image = theme_source.THEME_DIR / "assets/ghostty/iris-nocturne-dark.png"
    template = theme_source.THEME_DIR / "assets/vscode/iris-nocturne.css"
    image_url = "data:image/png;base64," + base64.b64encode(
        image.read_bytes()
    ).decode("ascii")
    css = template.read_text(encoding="utf-8").replace(
        "{{BACKGROUND_IMAGE}}", image_url
    )
    for name, value in D_CHROME.items():
        css = css.replace("{{" + name + "}}", value)
    appearance = json.loads(
        (theme_source.THEME_DIR / "assets/vscode/managed-appearance.json").read_text(
            encoding="utf-8"
        )
    )
    settings = {"workbench.colorTheme": "Iris Nocturne", **appearance}
    stylesheet = css.encode()
    settings_bytes = _json(settings)
    return {
        f"{EXPORT_DIR}/iris-nocturne-color-theme.json": theme,
        f"{EXPORT_DIR}/iris-nocturne.vsix": _vsix(
            theme, stylesheet, settings_bytes
        ),
        f"{EXPORT_DIR}/iris-nocturne.css": stylesheet,
        f"{EXPORT_DIR}/settings.example.json": settings_bytes,
    }
