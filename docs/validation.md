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
| `syntax_test.py` | TextMate rule order, category colors, and explicit empty font styles |
| `build_test.py` | All 20 exports, shared XML, terminal-role isolation, and configuration preservation |
| `vscode_test.py` | Reproducible VSIX and local runtime, 256-pixel PNG icon and manifest parity, bundled-resource and canonical README parity, background transactions and recovery, settings limited to Iris, shared syntax/semantics, ANSI, opaque native fallback, and native/CSS floating-surface agreement |
| `textmate_integration_test.py` | Actual Python, Markdown, JSON, YAML, and TOML colors in an isolated bat cache |
| `cli_adapters_test.py` | lsd/fd attribute precedence and icons, fzf option preservation, Zsh styles, and invalid-input failure before writes |

Integration coverage depends on tools available through `PATH`:

| Dependency | Behavior when unavailable |
|---|---|
| Node.js | Skip background transaction/recovery checks; native theme and package checks still run |
| bat | Skip actual TextMate color checks |
| lsd and zsh | Skip file-state and icon integration checks if either is missing |
| fd | Omit fd checks within the file-tool test; the rest of that test still runs |
| fzf and zsh | Skip fzf option integration checks if either is missing |
| zsh | Skip the standalone Zsh style-loading check |

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

The build produces 16 configuration resources and four `vscode/` delivery files;
the Python suite checks this split and identical bat, Yazi, and Codex CLI XML.
`--check` compares each complete file against its
expected bytes and returns nonzero for missing or different files. It ignores
extra files in the destination.

To validate full Starship or Herdr files against an existing mirror, supply
`--source-root` as described in [merging configuration blocks](applications.md#merging-configuration-blocks).
Even formatting changes inside a generated block produce a mismatch. Edit the
shared inputs and regenerate to change colors.

## VS Code integration

The background manager modifies application files. Isolate the application bundle,
user-data directory, extensions, shared storage, and sample workspace. A profile
alone is insufficient. The daily application, installed Iris, and settings must
not be changed by validation.

The Python suite also runs `node --test tests/vscode_background_test.cjs` when
Node.js is available. These focused tests cover idempotence, conditional settings
restoration, CSS migration order, JS rejection, missing resources/backups,
configuration and post-write failures, interrupted transaction recovery,
application locks, external modifications, and version-safe reapplication. All
filesystem fixtures are temporary and removed after their tests.

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
| Restore Solid Fallback | Calls Restore Previous Appearance and checks original workbench hash and previous theme |
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
cases, including the Node runner’s six transaction/recovery cases.
Repeat [visual acceptance](#visual-acceptance) after VS Code updates because
internal selectors are not a stable extension API.

After verification, restore the test application, close it, and remove its root,
archive and reports. Keep reusable fixture source, not screenshots from every
run. `dist/` contains only the current 20 generated exports. Recovery records
in Iris’s local extension storage are functional data and must remain while Iris
manages the background. The application-side `.iris-nocturne/` directory is the
shared lock location, not the settings or workbench backup store.

### Visual acceptance

Review these cases with the background enabled and repeat the relevant checks
with it disabled:

| Area | Acceptance criteria |
|---|---|
| Editor groups | Single and split views share gradient progress; switching focus moves the inactive veil without intercepting input |
| Hover states | Primary-sidebar rows and section headers, common toolbars, and unselected activity-bar icons use `#37365F`; selection and focus remain distinct |
| Sticky Scroll | Pinned code and line numbers use the coordinated opaque background |
| Floating content | Settings JSON, Settings UI, modal editors, Peek, suggestions, hovers, find, command input, menus, and notifications cover underlying code |
| Code | Python, C++, TS/TSX, Markdown, and configuration files preserve shared syntax categories and readable diagnostics and diffs |
| Terminal | ANSI colors, background-colored output, selection, and the panel gradient remain legible |
| Notebook | Code cells, focus and selection boundaries, Markdown, and existing output remain readable |
| Window changes | Resizing and changing panel visibility preserve gradient alignment and usable controls |

A successful installation or byte comparison does not verify rendering. Repeat
visual review after VS Code upgrades because DOM selectors are not a stable
extension API.

## Neovim integration

`tests/neovim_test.lua` checks highlights, Tree-sitter capture colors, semantic
classification, and completion kinds in a complete local integration. It checks
Function/Method colors separately from Event, constructors, macros, and decorators.
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
language server. Supply the complete configuration and runtimes before running;
the script does not install them.

## Visual review

`--check` does not verify installation, theme selection, or rendering. After
changing integration settings, review the relevant applications:

| Application | Inspect |
|---|---|
| Ghostty | Foreground, cursor, selection, ANSI colors, and optional static background |
| VS Code | D gradients, split focus, sidebar hover, Sticky Scroll, opaque settings/modal/Peek/widgets, terminal and Notebook; repeat with CSS disabled |
| Neovim | Text, syntax, active/inactive statuslines, plugin interfaces, transparency, and switching to/from the fallback theme |
| Yazi and lsd | Directory and language icons, file categories, symlinks, executable states, and Yazi statusline mode colors |
| fzf and fzf-tab | Matches, current row, multi-selection, previews, and colored completion filenames |
| Zsh | Actual command-line highlighting and autosuggestions |
| bat and delta | Rendered code and diffs |
| Starship | Prompt colors with the existing module layout |
| btop and Herdr | Panel layers, active states, and transparency |
| Codex CLI and Claude Code | Theme selection and the syntax/interface areas each format supports |

Check glyphs with your actual Nerd Font and terminal. For isolated shell review,
use temporary HOME/XDG directories, a separate PTY, and `zsh -f`, loading installed
plugins directly. Inspect real terminal rendering as well as emitted control
sequences. Consult the [syntax guide](syntax.md) for classification limits.
