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

1. Select **Iris Nocturne** with **Preferences: Color Theme**. If you run Enable
   Gradient while another theme is active, Iris opens this native picker and ends
   that command. Selecting a theme does not enable the gradient.
2. Once Iris is active, run **Iris Nocturne: Enable Gradient**. On first use,
   choose the default profile's Application `settings.json` and this profile's
   User `settings.json` in the file selectors. They may be the same file. You can
   open them through VS Code's Preferences commands to check their paths first.
3. If Iris prepares settings drafts, review them and save the files yourself.
   Iris never saves settings documents. Run **Enable Gradient** again to commit
   the background; saving or switching themes cannot resume the earlier command.
4. After the success notification, choose **Reload Window**, and reload the other
   open windows of this VS Code application.

Iris records the selected resource URIs and their resolved file paths with the
original setting values. Editor focus does not select a settings resource. If a
file identity or `applyToAllProfiles` routing changes, Iris stops and retains the
records instead of applying a backup to a different document. Existing settings
drafts must be saved or undone before a new review can be prepared.

Iris locates its own background, records the managed settings, backs up the
workbench, and merges the five transparent canvas overrides and custom title-bar
setting into the review drafts. Unrelated top-level settings and comments stay
in place; the edited color object is merged with its existing values. No CSS URL
or manual CSP editing is needed.

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

Select the Iris theme, then run **Iris Nocturne: Enable Gradient** with the old
loader still installed. Iris
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

To change managed CSS, edit **Iris Nocturne: Custom Css Imports**, select the Iris
theme, and run **Iris Nocturne: Reapply Background**. Like Enable Gradient, if
Reapply opens the theme picker, select Iris and run Reapply again. Remote CSS is fetched only during an
explicit enable, migration, or reapply operation, not on each startup.

## Disable or restore

| Goal | Command |
|---|---|
| Keep Iris with solid backgrounds | **Iris Nocturne: Disable Gradient** |
| Return to the appearance before enabling Iris | **Iris Nocturne: Restore Previous Appearance** |
| Switch to a different color theme | Choose it with **Preferences: Color Theme**; if cleanup needs settings changes, review/save them and run **Disable Gradient** to finish |

After any background change, reload this and other open windows. Disabling the
Iris gradient retains other CSS taken over during migration. A workbench patch
may therefore remain while those imports are still managed.

Disable, Restore and Reapply use the same review/save/re-run boundary as Enable.
Restore Previous Appearance opens the native theme picker only after its
background transaction completes. If a review is already pending, another
command cannot finish it: run the original command after saving, or undo the
reviewed settings edits and save before choosing a different command.

Your latest native theme choice is preserved. Cancelled pickers, delayed theme
commits, settings saves and startup Recover never resume an earlier Enable.
Startup does not open a theme picker. Theme reconciliation may prepare cleanup
drafts, but it does not save them or report the gradient disabled until you run
Disable Gradient to finish.

Restoration operates field by field. Values edited after enabling Iris are
preserved. A document edited before a review is applied rejects the whole stale
WorkspaceEdit. A new draft entered after application stays unsaved until you
choose to save it; Iris does not issue a save request. On the next explicit
command, it checks clean documents, saved contents, field values and resource
identities before committing the application files. Conflicts stop the operation
and retain its original records. Iris never writes the native theme setting,
including when reading older records that managed it.

These checks also run when no setting needs a text change. Unsaved drafts cannot
enable the background or cause Disable to discard original backups. Re-running a
review checks every managed field's resource and scope, including fields that
already had the desired value and needed no edit.
The fields to change and the fields to preserve are decided from the same clean
document snapshots. Iris checks their text and document versions again before
submitting the WorkspaceEdit, including unchanged documents when the delta is
empty. An edit followed by Undo still invalidates the captured version, even if
the text matches again. On a saved re-run, all participating documents are
checked together after the last file read, so a later read cannot hide an edit
to an earlier document. Closing and reopening a settings document also invalidates
any in-flight check holding the old document; new drafts remain untouched.

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
If a requested recovery cannot proceed, Iris displays the reason, including when
manual reconciliation is required.

The journal keeps the original workbench/state, the intended result, resource
identities and the settings review. Its existing per-field progress records
whether an edit started and whether the host confirmed its application. A
confirmed model edit is not a confirmed disk save. Only re-running the same
command can finish a review after a manual save. Recover cannot complete an old
Enable on your behalf.
Commands already waiting in the queue before a review finished also cannot serve
as that re-run. Each request also records which documents were unsaved when it
was issued; saving them while that request waits cannot authorize it to finish
the review or start a new transaction. This remains true if a preceding command
has already consumed the review. Issue a new command after saving. Read-only
theme checks ahead of that new command do not make it an older request.

If an edit result or completion checkpoint is uncertain, Iris leaves the current
drafts, settings and recovery records in place and stops. Matching a planned
value does not establish ownership. Older settings records without resource
identity also require manual reconciliation. Do not delete the journal to bypass
these checks.

If the later workbench/state commit fails, Iris rolls those files back and keeps
the review and original settings backups for retry. It does not undo or save the
user's manually saved settings. Completed legacy undo records are not replayed.

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

`assets/vscode/managed-appearance.json` defines the six managed appearance fields
in native settings format. The runtime and generator read this same definition;
the VSIX bundles it under `background/`, and the exported settings example adds
the manually selected theme as a reference. Conditional restoration and legacy
migration rules remain in the background manager.

## References

- [Install an extension from a VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#install-from-a-vsix)
- [Select a color theme](https://code.visualstudio.com/docs/configure/themes)
- [VS Code user settings](https://code.visualstudio.com/docs/configure/settings#user-settings)
- [Workbench extension restrictions](https://code.visualstudio.com/api/extension-capabilities/overview#restrictions)
- [Legacy Custom CSS and JS Loader](https://github.com/be5invis/vscode-custom-css)
