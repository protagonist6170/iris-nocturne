# Integration examples

[README](../README.md) · [Application setup](applications.md) · [Validation](validation.md)

These examples show how to fit the generated resources into your configuration.
Adapt paths and module names to your layout.

## Export into a configuration workflow

A repository with a `home/` mirror can use the export paths directly:

```text
config-repository/
└── home/
    ├── .codex/themes/iris-nocturne.tmTheme
    ├── .claude/themes/iris-nocturne.json
    └── .config/
        ├── ghostty/themes/iris-nocturne
        ├── nvim/lua/iris_nocturne/palette.lua
        ├── yazi/flavors/iris-nocturne.yazi/
        ├── lazygit/themes/iris-nocturne.yml
        ├── fzf/iris-nocturne.sh
        ├── ls-colors/iris-nocturne.sh
        └── zsh/themes/iris-nocturne.zsh
```

The tree shows a subset of the [exports](../README.md#supported-applications).
Deploy them with copies, symlinks, or a tool such as Stow. The four `vscode/`
delivery files sit alongside these home-relative directories in the export;
keep them out of the home mirror and install the VSIX separately.

To review a merge before installation, read the mirror as input and write to a
separate export directory:

```sh
theme_project=/path/to/iris-nocturne
config_mirror=/path/to/config-repository/home
theme_export=/path/to/theme-export
python3 -B "$theme_project/build.py" \
  --source-root "$config_mirror" --output-root "$theme_export"
python3 -B "$theme_project/build.py" \
  --source-root "$config_mirror" --output-root "$theme_export" --check
```

`config_mirror` must exist. Any Starship and Herdr files in it need
[managed block markers](applications.md#merging-configuration-blocks). Review the
separate export before installing it. Writing directly into a mirror linked to
your active configuration makes changes immediately visible to applications.

After reviewing the export, copy only the configuration directories into the
mirror, preserving unrelated files:

```sh
rsync -a "$theme_export/.config/" "$config_mirror/.config/"
rsync -a "$theme_export/.codex/" "$config_mirror/.codex/"
rsync -a "$theme_export/.claude/" "$config_mirror/.claude/"
```

On migration from the earlier layout, update shell references to
`fzf/iris-nocturne.sh` and `ls-colors/iris-nocturne.sh` before removing their old
files and links. Remove the former `.config/iris-nocturne` directory only after
checking it contains no personal files; generation does not delete stale outputs.

## Neovim

The generated `palette.lua` is the input to a local theme implementation. A
complete integration can use the following structure, relative to the Neovim
configuration directory:

| File | Responsibility |
|---|---|
| `lua/iris_nocturne/palette.lua` | Generated colors, loaded with `require("iris_nocturne.palette")` |
| `lua/iris_nocturne/init.lua` | Core highlights, transparency options, and theme loading |
| `lua/iris_nocturne/integrations.lua` | Highlight mappings for enabled plugins |
| `lua/iris_nocturne/semantic.lua` | Semantic roles, theme predicate, and semantic-token callbacks |
| `after/queries/<language>/highlights.scm` | Theme-specific Tree-sitter query extensions |
| `lua/config/theme.lua` | Theme selection, lifecycle, and shared interface styles |
| `lua/plugins/themes.lua` | Plugin-manager entry points and fallback theme settings |
| `lua/plugins/noice.lua`, `lualine.lua` | Command-line, confirmation-dialog, and statusline layout and transparency |

Only `palette.lua` is generated. Supply the other modules and queries yourself.

The examples and checks use `iris-nocturne` as the theme ID, `iris_nocturne` as
the Lua namespace, `@iris_nocturne.*` for captures, and `IrisNocturne*` for
dedicated highlight groups.

A plugin manager can call the local Lua loader directly while preserving
`ColorSchemePre` and `ColorScheme` events. A local `colors/` entry point is
optional. Load a fallback such as Catppuccin through its own loader, and reuse or
clear autocommand groups when reloading to avoid duplicate callbacks.

### Semantic roles and queries

Use the [syntax roles](syntax.md) for Tree-sitter, LSP tokens, and completion
icons. Functions and methods use `function_reference` (`#8F9FFF`), including
definitions, calls, and built-ins. If your local highlight helper maps palette
roles to Blink kinds, include these entries:

```lua
local kinds = {
  function_reference = "Method Function",
  ["function"] = "Event",
  -- Keep the existing mappings for other kinds.
}
```

This is a local helper convention, not a native Blink option. Keep other kinds
and completion text styles in your existing mappings. Constructors use the type
color, macros the preprocessor color, and decorators the decorator color.

Queries for Python, C++, Rust, TOML, Markdown, and Markdown inline can extend the
installed runtime under `after/queries/`. Use `; extends` and gate theme-specific
captures with `#iris-nocturne?`. Register the predicate even when starting with a
fallback theme. On a theme switch, refresh semantic overrides and invalidate
theme-specific captures. The predicate and lifecycle handling are local code
that you must supply.

Neovim documents the [query extension modeline](https://neovim.io/doc/user/treesitter/#treesitter-query-modeline-extends)
and the [`runtimepath` search order](https://neovim.io/doc/user/options/#'runtimepath').
Once the integration is in place, run the [isolated Neovim checks](validation.md#neovim-integration)
with a configuration copy and installed parser/query runtimes.

### Transparency and fallback themes

Set transparency in local highlight and plugin configuration. For example, let
text areas, statuslines, Noice prompts, and unselected completion entries inherit
the terminal background while keeping selection, floating-window, search, and
diff backgrounds. Clear only the background when retaining a title's text style.

Shared UI mappings can keep layouts consistent with a fallback such as
Catppuccin. Let each theme load its own highlights, and check both after
switching or reloading.

## Shell load order

For Zsh with fzf-tab, autosuggestions, and fast-syntax-highlighting:

1. Source `ls-colors/iris-nocturne.sh` before completion initialization.
2. Source `fzf/iris-nocturne.sh` before fzf initialization and append its color
   argument to your existing options.
3. After loading fzf-tab, append the same argument to its effective `fzf-flags`
   context.
4. After loading autosuggestions and syntax highlighting, source
   `zsh/themes/iris-nocturne.zsh`.

Paths are relative to `XDG_CONFIG_HOME`. See the [CLI adapter guide](cli-adapters.md)
for snippets and option constraints.

## Ghostty background

Keep the static PNG alongside the Ghostty configuration, for example:

```text
home/.config/ghostty/
├── config.ghostty
├── themes/iris-nocturne
└── backgrounds/iris-nocturne-dark.png
```

Copy `assets/ghostty/iris-nocturne-dark.png` into `backgrounds/` and reference it
relative to your Ghostty config. Adjust `config.ghostty` to your configuration
filename. See the [background guide](../assets/ghostty/README.md) for settings,
provenance, and restoration; the PNG is separate from the generated export.
