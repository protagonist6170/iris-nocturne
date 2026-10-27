# Validation

[README](../README.md) · [Application setup](applications.md) · [Integration examples](examples.md)

Test the generator and adapters, compare exports, then review the theme in each
application. Run commands from the project root. Tests use installed tools and
temporary resources; they do not install dependencies or deploy themes.

## Python test suite

Use Python 3.11+; the Python code requires only the standard library:

```sh
python3 -B -m unittest discover -s tests -p '*_test.py' -v
```

| Test file | Coverage |
|---|---|
| `theme_source_test.py` | Color values, ANSI palette, and syntax input validation |
| `syntax_test.py` | TextMate rule order, category-to-palette roles using distinct test colors, and explicit empty font styles |
| `build_test.py` | VS Code delivery files, shared XML, representative terminal-role isolation and export mappings, TOML parsing, and configuration preservation |
| `vscode_test.py` | Reproducible VSIX and local runtime, 256-pixel PNG icon and manifest parity, bundled-resource and canonical README parity, background transactions, recovery and extension lifecycle, settings limited to Iris, shared syntax/semantics, ANSI, opaque native fallback, and native/CSS floating-surface agreement |
| `textmate_integration_test.py` | Actual Python, Markdown, JSON, YAML, and TOML syntax categories against palette roles in an isolated bat cache |
| `cli_adapters_test.py` | delta blame backgrounds, lsd/fd attribute precedence and icons, fzf option preservation, Zsh styles, and invalid-input failure before writes |
| `lazygit_test.py` | A palette, shared icons and aliases, invalid-input failure before writes, native PTY/delta rendering, and isolated Snacks parent editing |

Invalid-input checks call the build entry point with minimal temporary source
files, while the Zsh check reads actual shell state for Python assertions. The
lsd/fd fixture writes only the exports those consumers use.

Integration coverage depends on tools available through `PATH`:

| Dependency | Behavior when unavailable |
|---|---|
| Node.js | Skip background transaction/recovery checks; native theme and package checks still run |
| bat | Skip actual TextMate color checks |
| delta | Skip the standalone blame-rendering check |
| lsd and zsh | Skip file-state and icon integration checks if either is missing |
| fd | Omit fd checks within the file-tool test; the rest of that test still runs |
| fzf and zsh | Skip fzf option integration checks if either is missing |
| zsh | Skip the standalone Zsh style-loading check |
| lazygit, git, bat, delta, and a POSIX PTY | Skip native lazygit/delta checks when tools are unavailable; PTY access is required when running them |
| Neovim and an installed Snacks runtime | Skip Snacks checks if unavailable; set `IRIS_SNACKS_PATH` for a nonstandard plugin location |

Read the skip messages: a passing suite does not verify unavailable tools. bat
uses an isolated cache and disables its config file; Zsh runs with `-f`.
Adapter versions and constraints are listed in the [CLI guide](cli-adapters.md).

## Export consistency

Build and compare the exports in an empty temporary directory:

```sh
(
  output=$(mktemp -d)
  trap 'rm -rf "$output"' EXIT
  python3 -B build.py --output-root "$output"
  python3 -B build.py --output-root "$output" --check
)
```

The build currently produces 17 configuration resources and four `vscode/`
delivery files; the Python suite checks the VS Code files and identical bat,
Yazi, and Codex CLI XML.
`--check` compares each complete file against its
expected bytes and returns nonzero for missing or different files. It ignores
extra files in the destination.

To validate full Starship or Herdr files against an existing mirror, supply
`--source-root` as described in [merging configuration blocks](applications.md#merging-configuration-blocks).
Even formatting changes inside a generated block produce a mismatch. Edit the
shared inputs and regenerate to change colors.

## lazygit integration

Run the focused checks with the installed native tools:

```sh
python3 -B -m unittest discover -s tests -p 'lazygit_test.py' -v
```

The native test creates its own HOME, XDG directories, Git config, bat cache,
and repository. It loads the generated overlay after a base config, checks
actual color escapes and shared glyphs, searches for README, verifies Iris
delta backgrounds and word emphasis, then switches to rawGit word diff.
It disables auto-fetch and update checks. `lazygit --config` prints defaults
and is not evidence that a theme loaded. A sandbox denying `/dev/tty` must allow
the isolated PTY check; do not silently treat that failure as a successful check.

The Snacks test copies the installed plugin runtime into a temporary directory
and starts Neovim with `-u NONE`. It checks real lazygit output, unchanged parent
environment, absence of a generated overriding theme, and `e` opening the file
in the same Neovim server. The cwd, log, and file-history entrypoint arguments
are checked separately. No LazyVim bootstrap, plugin updates, daily Neovim
configuration, or user caches are loaded. For a nonstandard plugin installation:

```sh
IRIS_SNACKS_PATH=/path/to/snacks.nvim \
  python3 -B -m unittest discover -s tests -p 'lazygit_test.py' -v
```

The dotfiles checkout also provides a focused loading-order check. Run it
from that checkout without loading daily Neovim configuration or plugins:

```sh
nvim --headless -u NONE -i NONE -l tests/lazygit_overlays.lua
```

It uses temporary HOME and XDG directories and calls the actual Zsh environment
module and Neovim override. It compares both entrypoints for unset/empty lists,
empty entries, Iris in different positions, repeated Iris entries, paths with
spaces, and missing files. Other entries keep their relative order, Iris appears
once at the end, and the Neovim parent environment stays unchanged.

Validated versions on macOS: lazygit **0.66.2**, Neovim **0.12.6**, Snacks
**2.31.0** (commit `882c996cf28183f4d63640de0b4c02ec886d01f2`), delta **0.20.1**,
and bat **0.26.1**. The integration does not claim an older minimum version.
The native checks require real terminal access and use the standard library.
Also review focus changes, search, copied/rebase-marked commits, modal dialogs,
narrow windows and staged/unstaged split diffs in the terminal.

The 2026-10-26 isolated run passed all 22 Python cases without skips. Additional
PTY acceptance covered staged/unstaged split diffs, copied commit hash colors,
the native rebase annotation, the help popup, and resizing to 92 columns.
The rebase annotation uses native ANSI yellow in 0.66.2, rather than the exposed
marked-base background fields; see [rendering limits](applications.md#colors-and-icons).

## VS Code integration

The background manager modifies application files. Isolate the application bundle,
user-data directory, extensions, shared storage, and sample workspace. A profile
alone is insufficient. The daily application, installed Iris, and settings must
not be changed by validation.

The Python suite also runs
`node --test tests/vscode_background_test.cjs tests/vscode_extension_test.cjs`
when Node.js is available. Background checks cover idempotence, conditional
restoration, CSS migration/order, resource failures, application locks, version
reapplication and read-only inspection. Fault injection exercises progress
checkpoints, uncertain edits, partial file rollback and retries that must preserve
later personal values and original backups.

The extension tests run the shipped entry point and adapter with a controlled
VS Code host. Each settings document has separate draft and disk contents;
effective configuration and notifications advance only when explicitly delivered
from saved contents. Fixture operations explicitly edit drafts, save documents,
or deliver configuration; saved-setting changes combine these steps. A shared
test helper injects selected rename failures and restores the filesystem method.
WorkspaceEdit preparation models the native active editor's
minimization: unannotated empty edits disappear and lose their final version
constraint, while metadata retains the constraint without changing text. Original
edit counts determine the RPC result. Closing a document retains its old text
and version; reopening creates a distinct model at the same URI. Production
`document.save` and unguarded `configuration.update` calls are rejected by the host.

Focused scenarios cover user drafts entered after edit application, manual saves
that cannot awaken an old command, Restore/Enable interleavings, independent
application/profile files, scope changes before configuration delivery, focus on
an unrelated settings.json, and retargeted file identities. They also verify
JSONC local edits, Reapply backups, startup recovery errors and pending cleanup
notifications. The native theme remains outside background writes. All files
live in temporary directories removed after the tests.

Zero-delta Enable and Disable tests keep the model dirty while its fields appear
to need no edits; both must reject without committing the background or deleting
backups. Another test changes the scope of an unchanged managed field before
re-running a review. Queue tests distinguish a command issued before a new review
was ready from a fresh command after saving that only waits behind read-only
theme checks. No new journal progress states are used for admission timing.
Undo tests pause journal persistence after planning, perform a real edit and
Undo, and assert identical text with two version increments. Both empty and
nonempty deltas must reject that snapshot. Another zero-delta Disable test
changes skipped fields at the same boundary and verifies that original backups
survive for retry. Admission tests delay journal reads and save after commands
were issued: neither an absent journal nor one consumed by an earlier Enable
can admit an old request. Saved-review tests pause profile IO after application
settings were checked, then either save a new managed value or enter a draft in
the application document; both must retain the review without committing files.
Native-preparation tests change an active document while the RPC is preparing
both an empty delta and a partial edit with an unchanged routing document. They
verify rejection across all resources and preserve original backups for retry.
Close/reopen tests pause planning, stage document opens and saved-review reads;
they verify that old closed references cannot approve an operation or overwrite
the new model's draft. Already restored settings after restart need no empty RPC.

The optional GUI validation fixture has an explicit user-save simulation for
its isolated scenario commands: it checks that every document is under the
validation user-data root and exactly matches the prepared review before saving.
This helper is excluded from the distributed extension; runtime commands never
save a settings document.

Build, prepare a fresh root, and extract an official macOS Stable application
archive under `app/`:

```sh
sandbox=/absolute/path/to/iris-vscode-validation
python3 -B tests/vscode_integration/prepare.py \
  --root "$sandbox" --export-root dist
code_copy="$sandbox/app/Visual Studio Code.app/Contents/Resources/app/bin/code"

"$code_copy" --user-data-dir "$sandbox/user-data" \
  --extensions-dir "$sandbox/extensions" --shared-data-dir "$sandbox/shared-data" \
  --install-extension "$PWD/dist/vscode/iris-nocturne.vsix" \
  --install-extension be5invis.vscode-custom-css@7.5.1 \
  --install-extension ms-python.vscode-pylance@2026.4.1 \
  --install-extension llvm-vs-code-extensions.vscode-clangd@0.6.0

IRIS_VSCODE_VALIDATION_ROOT="$sandbox" "$code_copy" \
  --user-data-dir "$sandbox/user-data" --shared-data-dir "$sandbox/shared-data" \
  --extensions-dir "$sandbox/extensions" \
  --extensionDevelopmentPath="$PWD/tests/vscode_integration" \
  --new-window "$sandbox/workspace"
```

The legacy loader is installed only to exercise migration; Iris does not depend
on it. Preparation uses the native Iris theme with no manual canvas overrides
or CSS imports. Test settings disable updates, Sync-adjacent auto-update behavior,
telemetry, and workspace trust for the sample only. None of those switches ships
as daily configuration. `clangd` must be available on PATH.

The reusable fixture is excluded from the VSIX. Its guards require the isolated
application, user data, extension directory and sample workspace. Reports go to
`$sandbox/results/`; inspect `failure.json` first. The command palette exposes
these **Iris Validation** scenarios:

| Scenario | Inspect |
|---|---|
| Enable Background | Calls the packaged Iris command, checks retained CSP, then reloads the test window |
| Restore Solid Fallback | Calls Restore Previous Appearance, checks the original workbench hash, and opens the native theme picker |
| Migrate Legacy CSS | Patches through the actual old loader, migrates Iris plus surrounding CSS, switches themes to test automatic disable, then restores the clean workbench |
| Open Split Editors / Open Diff | Gradient alignment, focus veil, selection and diff readability |
| Open Notebook | Existing cells and output without starting a kernel |
| Open Hover / Open Suggestions / Open Find | Opaque widget surfaces |
| Open Settings JSON / Open Settings UI / Open Peek Definition | Opaque editor surfaces |
| Show Sticky Scroll | Coordinated pinned code and line numbers |

Run Enable Background from a clean native-solid baseline, wait for the reloaded
`native-gradient.json`, then run Migrate Legacy CSS. Reports record actual
TypeScript, Pylance, and clangd semantic tokens, Notebook output, full packaged
CSS injection, CSP, migration order, configuration preservation, automatic
theme-switch handling, and complete workbench restoration. Visible windows and
successful installs alone do not establish a pass.

Select Iris before running Enable Background or Migrate Legacy CSS. If Enable
Background opens the native picker, select Iris and run the scenario again;
the first invocation ends without applying the gradient. Restore Solid Fallback
opens the native picker for your replacement theme. Migration validation checks
automatic theme-switch handling before explicitly selecting Iris for its isolated
cleanup, then returns the fixture to Light Modern. Production Iris never writes
the native theme setting itself.

A local `command.json` bridge accepts only a unique request ID and a command in
the fixture's scenario registry. It cannot execute arbitrary VS Code commands.
The production extension has no file-command bridge or test-only automation API.

The validation baseline is Iris **0.1.0**, official macOS VS Code Stable
**1.143.1**, and legacy loader **7.5.1**. The syntax, ANSI palette, gradient image,
and rendered CSS rules match the previous visual release. Runtime changes
require both transaction tests and the installed-extension lifecycle checks.
The 2026-10-25 isolated run passed the fresh enable/reload cycle and migration
through the actual legacy loader, including mixed CSS order, automatic disable
on theme switch, personal-setting preservation, and byte-identical workbench
restoration. Pylance 2026.4.1 emitted 68 Python semantic tokens, clangd 0.6.0
emitted 34 C++ tokens, and TypeScript emitted 29 TSX tokens; the Notebook
contained three cells and two existing outputs. The Python suite passed 17
cases, including the Node transaction/recovery tests.
Repeat [visual acceptance](#visual-acceptance) after VS Code updates because
internal selectors are not a stable extension API.

After verification, restore the test application, close it, and remove its root,
archive and reports. Keep reusable fixture source, not screenshots from every
run. Keep only the current generated exports in `dist/`. Recovery records
in Iris’s local extension storage are functional data and must remain while Iris
manages the background. The application-side `.iris-nocturne/` directory is the
shared lock location, not the settings or workbench backup store.

### Visual acceptance

Review these cases with the background enabled and repeat the relevant checks
with it disabled:

| Area | Acceptance criteria |
|---|---|
| Editor groups | Single and split views share gradient progress; switching focus moves the inactive veil without intercepting input |
| Native trees and section headers | Primary sidebar, secondary sidebar, and panel share transparent ordinary rows and section headers; hover uses `#A8A2EC1C`, active selection `#9DA9FF30`, inactive selection `#9DA9FF18`, and keyboard-only focus `#9DA9FF24` with the iris focus outline. Hover must not replace selection |
| Tree Sticky Scroll | SCM Changes and Explorer folder headers, including multiple pinned ancestors, paint the same opaque viewport-aligned gradient as their region (`0 0 / 100% 100vh fixed no-repeat`). No deep solid stripe, scrolling text bleed, or dark shadow; a thin `#A7A1CF3B` separator remains. Repeat in the secondary sidebar and with the tree moved to the panel |
| Tree drag and drop | Target feedback uses one `#9DA9FF40` layer, including selected targets and list/container targets, with iris insertion lines. Pinned targets retain their opaque gradient; active/inactive indentation guides use `#B1B6D040`/`#B1B6D01F` |
| Editor Sticky Scroll | Pinned code and line numbers retain the coordinated opaque background; editor hover behavior is unchanged |
| Other hover states | Common toolbars and unselected activity-bar icons retain `#37365F`; menus, quick input, suggestions, embedded Peek trees, Notebook, and extension webviews do not inherit the tree overrides |
| Multi-file Diff | Headers use opaque `#302B57` and `#45516D` borders; inserted/deleted lines retain their semantic colors |
| Floating content | Settings JSON, Settings UI, modal editors, Peek, suggestions, hovers, find, command input, action lists, menus, notifications, inline-chat affordances, editor/terminal voice widgets, and the browser pause message cover underlying content |
| Welcome onboarding | The card uses opaque `#2C3550`, including the editor-background role inherited by its nested controls. The outer `#0006` overlay and 8px blur remain native; blurred workbench content must not show through the card |
| Code | Python, C++, TS/TSX, Markdown, and configuration files preserve shared syntax categories and readable diagnostics and diffs |
| Terminal | ANSI colors, background-colored output, selection, and the panel gradient remain legible. Terminal Sticky Scroll keeps opaque `#2C3550` with `#38415D` hover |
| Notebook and Output Sticky Scroll | Notebook heading and Output pinned headers use opaque `#302B57`, matching editor Sticky Scroll. Other Notebook cells, focus/selection boundaries, Markdown, and existing output remain readable |
| Window changes | Resizing, changing panel height/visibility, scrolling, and relocating views preserve gradient alignment and usable controls |
| Solid fallback | With the gradient disabled, side/panel fixed tree headers use `surface` and section-header theme tokens use `raised`; selection, focus, and native popups remain usable. VS Code 1.143.1 Modern UI paints ordinary section headers with their region's `surface` instead |

A successful installation or byte comparison does not verify rendering. Repeat
visual review after VS Code upgrades because DOM selectors are not a stable
extension API.

In VS Code 1.143.1, Modern UI's native `!important` section-header rules use
`sideBar.background` or `panel.background`, overriding the section-header theme
tokens in solid mode. Verify those tokens and the actual regional surface
separately. The optional gradient CSS explicitly handles these headers; the
native fallback does not require CSS injection.

Native Modern UI may also paint popup backgrounds in a frosted-glass `::before`
layer while the popup element itself is transparent. Inspect that backing layer
and the theme color separately in solid mode. Gradient mode keeps its existing
opaque popup surfaces.

#### Floating-surface regression check

Launch the isolated application with `--remote-debugging-port=9333`, install the
generated Iris package, and enable its gradient. A fresh profile shows the native
welcome card. With Playwright available in the validation environment, run:

```sh
node tests/vscode_integration/surfaces.cjs \
  --root "$sandbox" --output "$sandbox/results/surfaces" --require-onboarding
```

If Playwright is bundled outside the checkout, set `NODE_PATH` to that environment's
`node_modules` directory. It is an optional validation dependency and is not
packaged with Iris. Omit `--require-onboarding` to check only the inert fixtures
after the welcome card has been dismissed.

The script checks the real welcome card and its backdrop. It also constructs
inert native-class fixtures inside the running workbench, so VS Code's installed
CSS and the generated Iris CSS determine their actual computed backgrounds.
These cover dictation, inline chat, terminal voice, action lists, browser pause
messages, Notebook/Output pinned headers, and the existing modal-editor exception.
No microphone capture, account sign-in, or assistant request is started. These
fixtures validate styling, not those features' interaction flows. The ordinary
editor canvas is a negative control and must remain transparent. Fixtures are
removed after inspection, and reports and screenshots go only to `--output`.

## Neovim integration

`tests/neovim_test.lua` checks highlights, Tree-sitter capture colors, semantic
classification, and completion kinds in a complete local integration. It checks
the Noice split, opaque float and plugin surfaces, and LSP reference backgrounds
with transparency both enabled and disabled. It checks Function/Method colors
separately from Event, constructors, macros, and decorators.
Include the [completion mappings](examples.md#semantic-roles-and-queries) in your
configuration copy.

Because this repository exports only the palette, provide three existing inputs:

- A complete Neovim configuration copy using the generated palette, with
  `iris_nocturne.load()`, `iris_nocturne.semantic`, and the query extensions.
- A parser runtime containing Python, C++, Rust, TOML, JSON, YAML, Markdown,
  Markdown inline, and the regex parser used for Python regex injection.
- A query runtime with matching highlight and injection queries.

Follow the [module layout](examples.md#neovim) and replace these placeholder paths:

```sh
(
  config_runtime=/path/to/nvim-config-copy
  parser_runtime=/path/to/parser-runtime
  query_runtime=/path/to/query-runtime
  scratch=$(mktemp -d)
  trap 'rm -rf "$scratch"' EXIT
  mkdir -p "$scratch/config" "$scratch/state/nvim" "$scratch/cache/nvim"
  XDG_CONFIG_HOME="$scratch/config" \
    XDG_STATE_HOME="$scratch/state" \
    XDG_CACHE_HOME="$scratch/cache" \
    nvim -u NONE -i NONE -n --headless -l tests/neovim_test.lua \
    "$config_runtime" "$parser_runtime" "$query_runtime"
)
```

The command loads the script and supplied modules/queries without running your
`init.lua` or plugin manager. It tests semantic-token logic without starting a
language server. The highlight checks read the loaded groups; they do not open
Noice, FzfLua, or other plugin windows. Supply the complete configuration and
runtimes before running; the script does not install them.

## Visual review

`--check` does not verify installation, theme selection, or rendering. After
changing integration settings, review the relevant applications:

| Application | Inspect |
|---|---|
| Ghostty | Foreground, cursor, selection, ANSI colors, and optional static background |
| VS Code | D gradients, split focus, primary/secondary/panel tree states and Sticky Scroll, drag targets, editor Sticky Scroll, multi-file Diff, opaque settings/modal/Peek/widgets, terminal Sticky Scroll and Notebook; repeat with CSS disabled |
| Neovim | Text and syntax; transparent message splits, opaque floating surfaces, reference highlights, statuslines, and switching to/from the fallback theme |
| Yazi and lsd | Directory and language icons, file categories, symlinks, executable states, Yazi inactive tabs, and statusline mode colors |
| fzf and fzf-tab | Matches, current row, multi-selection, previews, and colored completion filenames |
| Zsh | Actual command-line highlighting and autosuggestions |
| bat and delta | Rendered code and diffs; delta blame's whole-line commit colors |
| lazygit | A borders/selected rows, preserved status foregrounds, shared icons and case aliases, search and commit markers, narrow/split diff views, delta/rawGit switching, and Snacks editor return |
| Starship | Prompt colors with the existing module layout |
| btop and Herdr | Panel layers, btop meters and selected rows, active states, and transparency |
| Codex CLI and Claude Code | Theme selection and the syntax/interface areas each format supports |

Check glyphs with your actual Nerd Font and terminal. For isolated shell review,
use temporary HOME/XDG directories, a separate PTY, and `zsh -f`, loading installed
plugins directly. Inspect real terminal rendering as well as emitted control
sequences. Consult the [syntax guide](syntax.md) for classification limits.
