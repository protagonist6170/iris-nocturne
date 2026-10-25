# Iris Nocturne for Visual Studio Code

A dark theme with iris-blue symbols, violet surfaces, and an optional
purple-to-blue workbench gradient. Iris covers the editor, sidebars, integrated
terminal, and Jupyter Notebook. Fonts, file icons, product icons, keybindings,
language services, and workspace layout remain under your control.

**Version 0.1.0** includes the theme, iris icon, embedded background, background
manager, settings example, this guide, and the MIT license. Share only
`iris-nocturne.vsix`: no source checkout, build tools, image download, or separate
CSS loader is needed.

## Compatibility

The native theme requires VS Code `^1.90.0`. Background management supports
**official macOS VS Code Stable**, validated with **1.143.1**. It modifies the
application's workbench file because VS Code does not offer an official API for
workbench CSS. Application write access is required. Installation-integrity
warnings remain enabled; the original Content Security Policy (CSP) is retained.

The patch is application-wide. Use the same profile to manage the background
that enabled it, and reload other windows after changing it. Different windows
do not have independent gradient switches. The native solid theme remains usable
without enabling the gradient, including on unsupported platforms.

Python, C++, and TypeScript/TSX are the primary language targets. Semantic detail
depends on your installed language providers. Notebook renderer-owned content
and extension-owned webviews retain their own styling.

## Install the theme

1. In VS Code, press `Cmd+Shift+X` to open Extensions.
2. Open **... > Install from VSIX...** and select `iris-nocturne.vsix`.
3. Reload if prompted. Run **Preferences: Color Theme** from the command palette
   (`Cmd+Shift+P`) and select **Iris Nocturne**.

The solid theme is ready. Installing the extension and selecting its theme do
not patch the application. To read this guide later, select Iris in Extensions
and open **Details**. It is also installed as the extension's `README.md`.

This package retains the version number 0.1.0 from the earlier theme-only build.
If VS Code refuses to replace that build, uninstall the old Iris extension and
install this VSIX, then reload. The existing injected background stays in place
until you run the migration command below; do not uninstall the old CSS loader
yet. Record your previous theme if you wish to return to it later.

## Enable the gradient

1. Run **Iris Nocturne: Enable Gradient**.
2. Wait for the success notification, then choose **Reload Window**.
3. Reload any other open windows of this VS Code application.

Iris locates its own background, records the current settings, backs up the
workbench, selects its theme, and merges the five transparent canvas overrides
and custom title-bar setting. Other preferences and color customizations stay
in place. No CSS URL or manual CSP editing is needed.

The five canvas overrides are `terminal.background`, `minimap.background`,
`editorGutter.background`, `notebook.cellEditorBackground`, and
`notebook.outputContainerBackgroundColor`, scoped to `[Iris Nocturne]` inside
`workbench.colorCustomizations`. The packaged `background/settings.example.json`
is an inspection reference, not a replacement for your `settings.json`.

If Workspace settings override the managed settings, Iris stops and identifies
the conflicting key. Adjust that override yourself before retrying. Permission
or compatibility errors also stop the operation; Iris does not elevate its
permissions or make broad ownership changes.

## Migrate an existing CSS Loader installation

Run **Iris Nocturne: Enable Gradient** with the old loader still installed. Iris
recognizes **Custom CSS and JS Loader 7.5.1** application markers and reads its
original workbench backup. It checks all imports before changing anything.

- The old Iris import is replaced with the bundled background in the same order.
- Other CSS is retained in order and recorded in **Iris Nocturne: Custom Css
  Imports** (`irisNocturne.customCssImports`), a machine-local setting.
- The old loader's Imports array is cleared after the transaction succeeds.
  The loader is left installed; uninstall it later if no longer needed.
- JavaScript imports, unreadable CSS, missing original backups, and unknown
  patches stop migration. Nothing is silently dropped.

CSS imports can be local `file:` URLs or HTTP/HTTPS URLs. The loader's URL
variables, including `${userHome}` and `${env:NAME}`, are resolved when you
explicitly apply the background. Imported CSS is embedded with the same relative
URL behavior as the legacy loader. CSP continues to constrain external resources;
Iris never relaxes the policy to make an import work. Iris does not execute
custom JavaScript. Do not enable the old loader again after migration.

After Iris reports success and the window has reloaded, uninstall **Custom CSS
and JS Loader** from Extensions. You can then remove its empty
`vscode_custom_css.imports` and unused `vscode_custom_css.statusbar` settings;
preserve all other settings. Do not run the old loader’s restore command after
Iris has taken over the application. Iris keeps its own original-workbench and
settings records in local extension storage, so neither the old extension nor
its old backup is required after successful migration. Keep Iris’s recovery
records while it manages the background.

To change managed CSS, edit **Iris Nocturne: Custom Css Imports** and run
**Iris Nocturne: Reapply Background**. Remote CSS is fetched only during an
explicit enable, migration, or reapply operation, not on each startup.

## Disable or restore

| Goal | Command |
|---|---|
| Keep Iris with solid backgrounds | **Iris Nocturne: Disable Gradient** |
| Return to the appearance before enabling Iris | **Iris Nocturne: Restore Previous Appearance** |
| Switch to a different color theme | Choose it with **Preferences: Color Theme**; Iris automatically disables its gradient and prompts for reload |

After any background change, reload this and other open windows. Disabling the
Iris gradient retains other CSS taken over during migration. A workbench patch
may therefore remain while those imports are still managed.

Restoration operates field by field. A value edited by you after enabling Iris
is preserved rather than overwritten. If the previous theme was already Iris,
its earlier history cannot be inferred; Restore Previous Appearance opens the
theme selector for you to choose a replacement.

**Before uninstalling Iris**, run Restore Previous Appearance. If other managed
CSS remains and you want to remove all Iris-managed injection, clear
`irisNocturne.customCssImports`, run Reapply Background, and then run Restore
Previous Appearance again. Once the workbench is clean, Iris can be uninstalled.
Uninstalling an extension alone does not remove CSS already injected into the
application.

## Updates and recovery

Iris detects a changed VS Code version or workbench and offers **Reapply
Background**. It does not patch a new installation automatically. Reapply checks
and backs up the current version; it never restores an older workbench over a
newer application. Internal UI selectors can change, so recheck the visual
result after updates. Run Reapply Background after installing new Iris assets
as well, even when the package version remains 0.1.0.

Original workbench bytes, application identity, expected hashes, settings, and
recovery records live in Iris’s machine-local extension storage, outside the
versioned extension and application folders. They survive extension and application
updates. The application’s `.iris-nocturne/` directory holds the shared operation
lock. Keep these recovery records while Iris manages the installation. The manager
uses an application lock and a recovery journal; an interrupted operation offers
**Recover** at the next startup. Manage recovery from the original profile.
Never delete an active lock or recovery journal to bypass an error.

If Iris reports an external modification, stop and restore that modification
with its own tool before retrying. If the application cannot be restored, quit
VS Code and replace the application with an official clean copy. Your settings
are stored separately. Compare the saved settings records before changing them,
and preserve unrelated edits. Never copy an older version's workbench HTML into
a newer application.

## Check the result

Inspect single and split editors, switch focus, and open Python, C++, TSX, the
terminal, and a Notebook with existing output. Sidebars and editor groups should
progress from purple to blue, with a subtle veil over inactive editor groups.
Hover, Sticky Scroll, notification, and status-bar colors remain coordinated.
Settings, modal editors, Peek, suggestions, menus, and hovers cover underlying
code. The gradient changes rendered surfaces, not desktop/window transparency.

## Package and development

The generator packages this guide verbatim as the installed README. A source
checkout builds four files under `dist/vscode/`: `iris-nocturne.vsix`,
`iris-nocturne-color-theme.json`, `iris-nocturne.css`, and `settings.example.json`.
Only the VSIX needs to be distributed.

The native theme reuses shared TextMate rules, semantic categories, and all
16 terminal ANSI colors. The extension icon is a 256 by 256 PNG. Its editable
source is `assets/vscode/icon.svg`. Builds use Python's standard library; the
background manager uses VS Code and Node built-ins, with no runtime package
dependencies. Local validation fixtures are excluded from the VSIX.

## References

- [Install an extension from a VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#install-from-a-vsix)
- [Select a color theme](https://code.visualstudio.com/docs/configure/themes)
- [VS Code user settings](https://code.visualstudio.com/docs/configure/settings#user-settings)
- [Workbench extension restrictions](https://code.visualstudio.com/api/extension-capabilities/overview#restrictions)
- [Legacy Custom CSS and JS Loader](https://github.com/be5invis/vscode-custom-css)
