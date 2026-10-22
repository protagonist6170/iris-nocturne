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
| `build_test.py` | All 16 exports, shared XML, terminal-role isolation, and configuration preservation |
| `textmate_integration_test.py` | Actual Python, Markdown, JSON, YAML, and TOML colors in an isolated bat cache |
| `cli_adapters_test.py` | lsd/fd attribute precedence and icons, fzf option preservation, Zsh styles, and invalid-input failure before writes |

Integration coverage depends on tools available through `PATH`:

| Dependency | Behavior when unavailable |
|---|---|
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

The build produces 16 files; the Python suite also checks the count and identical
bat, Yazi, and Codex CLI XML. `--check` compares each complete file against its
expected bytes and returns nonzero for missing or different files. It ignores
extra files in the destination.

To validate full Starship or Herdr files against an existing mirror, supply
`--source-root` as described in [merging configuration blocks](applications.md#merging-configuration-blocks).
Even formatting changes inside a generated block produce a mismatch. Edit the
shared inputs and regenerate to change colors.

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
