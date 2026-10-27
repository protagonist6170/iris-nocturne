# Application setup

[README](../README.md) · [Integration examples](examples.md) · [Validation](validation.md)

Build and check the theme as described in the [README](../README.md#build-the-theme).
Paths below are relative to the export root; copy commands assume `dist/`.
Install each resource in its application's configuration directory, then select
or load it as described below. Layouts and keybindings stay in your local config.

For lsd, fd, fzf, fzf-tab, and Zsh, follow the [CLI adapter guide](cli-adapters.md).
For Starship and Herdr, read [merging configuration blocks](#merging-configuration-blocks)
before exporting into existing files.

## Ghostty

Install `.config/ghostty/themes/iris-nocturne` under `themes/` in the Ghostty
configuration directory, then select:

```ini
theme = iris-nocturne
```

The generated theme defines background, foreground, cursor, selection, and 16 ANSI
colors. Keep font, window, keybinding, and opacity settings in your Ghostty config.

The optional [Neon Noir gradient](../assets/ghostty/README.md) uses explicit
background overrides that remain in effect when changing themes.

## Neovim

The export is a palette: `.config/nvim/lua/iris_nocturne/palette.lua`. Install it
in your Neovim configuration and load it with `require("iris_nocturne.palette")`.
It supplies shared semantic colors, ANSI colors, and terminal surface colors:
`terminal_surface` (`#2D2B60`), `terminal_raised` (`#37336E`),
`terminal_selection` (`#443E7E`), and `terminal_border` (`#584F8B`).

Supply highlight groups, plugin mappings, semantic tokens, queries, loading, and
transparency in your configuration. The palette is not a complete colorscheme.

See the [module layout](examples.md#neovim), [syntax roles](syntax.md), and
[isolated checks](validation.md#neovim-integration) for a complete integration.

## bat

Install `.config/bat/themes/iris-nocturne.tmTheme` in bat's theme directory,
rebuild bat's cache, and select `--theme="iris-nocturne"` in your bat configuration.
The filename registers the ID `iris-nocturne`; the display name inside the file
is `Iris Nocturne`. For a single invocation, use `bat --theme=iris-nocturne`.

Rebuild the cache after theme updates. delta uses the same `iris-nocturne` ID for
its `syntax-theme`.

## Yazi

Install `.config/yazi/flavors/iris-nocturne.yazi/`, including both `flavor.toml`
and `tmtheme.xml`, under `flavors/` in the Yazi configuration directory. Select
it in `theme.toml`:

```toml
[flavor]
dark = "iris-nocturne"
light = "iris-nocturne"
```

Custom statusline Lua remains in your Yazi config.

### File icons

Ordinary directories keep the Codicons folder glyph in `type` blue (`#9CBFFF`);
the generic hovered-directory rule uses an open folder. Special directories use
purpose symbols: code for `src`, a beaker for `tests`, a book for `docs`, a package
for dependencies, and tools for build outputs. Named directory icons keep their
purpose symbol when hovered. All glyphs come from the user's Nerd Font; no font
assets are bundled.

[`assets/purpose-icons.toml`](../assets/purpose-icons.toml) shares purpose glyphs
and palette roles with lsd. It also distinguishes README, licenses, dependency
manifests, lockfiles, Docker, Git, environment, and tool configuration files.
Yazi-only globs cover families such as `.env.*`, `README.*`, and `Dockerfile.*`.
Globs precede directory names, file names, extensions, and generic conditions;
the supplied globs match files only. Names are normalized to lowercase so both
lowercase and uppercase spellings can use the purpose icons.

[`assets/yazi-icons.toml`](../assets/yazi-icons.toml) retains base filename and
extension mappings from Yazi 26.9.1. Purpose rules override those mappings;
other language and framework glyphs retain their original colors. Layout,
filename colors, and file-state rules are separate from icon selection.

### Flavor styles and statusline API

File-type matchers follow the retained Catppuccin rules and order. Read, write,
and execute permissions use `warning`, `error`, and `added`; images, media,
archives, and documents use `preprocessor`, `warning`, `constant`, and `added`.
Tabs and table cells have explicit backgrounds, and selections use reversed
styles. Confirmation bodies, shortcut-hint masks, and unselected menu entries
leave the background unset. Inactive tabs use `terminal_surface` (`#2D2B60`).

Custom statusline code on Yazi 26.9 can read the generated
`[iris-nocturne-status]` section as `th.iris_nocturne_status` at render time:

| Style | Palette role |
|---|---|
| `normal` | `type` |
| `select` | `keyword` |
| `unset`, `modified` | `string` |
| `text` | `muted` |
| `divider` | `subtle` |
| `accent` | `member` |
| `selected` | `warning` |
| `copied` | `added` |
| `cut` | `deleted` |

Every custom style sets `bg = "reset"`; the three mode styles are bold. Apply
`normal` to both the Normal icon and `N` in a custom statusline. Native
`mode.normal_main` uses the same blue.

Read `th` again after a theme switch rather than caching its child tables. Your
Lua code supplies the layout and fallback styles for other flavors.

## btop

Install `.config/btop/themes/iris-nocturne.theme` under `themes/` in the btop
configuration directory and select `color_theme = "iris-nocturne"`. Keep panel
layout, transparency, and save-on-exit settings in your btop config. Meters
use `terminal_surface` (`#2D2B60`), and selected or followed process rows use
`terminal_raised` (`#37336E`). Set `theme_background = false` in btop's config
to let its main area inherit the terminal background.

## delta

Install bat's theme and rebuild its cache first. Then include
`.config/git/themes/iris-nocturne.gitconfig` from your Git configuration and set
`delta.features` to `iris-nocturne`. Resolve the include path relative to your
actual Git configuration layout.

Context lines and hunk headers have no explicit background; headers include line
numbers and syntax highlighting. Added/deleted lines use shared diff backgrounds,
with bold word emphasis. When blame output is sent through delta, it keeps delta's
default whole-line grouping using `#2D2B60`, `#343A62`, and `#3B325B`. The
colors repeat when more than three commits are displayed. Keep paging and
feature selection in your Git config.

## lazygit

The adapter targets **lazygit 0.66.2**. Install the generated overlay in the
directory reported by `lazygit --print-config-dir`:

```sh
lazygit_config_dir="$(lazygit --print-config-dir)"
mkdir -p "$lazygit_config_dir/themes"
cp dist/.config/lazygit/themes/iris-nocturne.yml \
  "$lazygit_config_dir/themes/iris-nocturne.yml"
lazygit --use-config-file="$lazygit_config_dir/config.yml,$lazygit_config_dir/themes/iris-nocturne.yml"
```

The example assumes an existing `config.yml`; otherwise list only the theme.
On macOS the default directory can be under `~/Library/Application Support`;
with `XDG_CONFIG_HOME` set, this local setup uses `~/.config/lazygit`.
Files in `themes/` are not discovered automatically.

### Colors and icons

The selected A design uses bold `accent` (`#9DA9FF`) for active borders,
`terminal_border` (`#584F8B`) for inactive borders, `terminal_raised` (`#37336E`)
for active selected rows, and `terminal_surface` (`#2D2B60`) for inactive
selections. Selection adds bold without replacing status foregrounds. Search
borders use `warning`. Copied commit hashes use a `member` background with dark
text. Main surfaces inherit the terminal.

The overlay also supplies `markedBaseCommitBgColor`/`FgColor` as warning/dark,
as exposed by the native theme interface. However, 0.66.2's commit list renders
the rebase base marker with fixed ANSI yellow text instead of those fields.
Copied-commit coloring applies to hashes, not entire rows; a cursor selection
can take precedence. See the pinned
[commit presentation](https://github.com/jesseduffield/lazygit/blob/v0.66.2/pkg/gui/presentation/commits.go).

The overlay enables Nerd Font 3 and file icons; your terminal font must supply
the glyphs. Language and purpose icons reuse the Yazi/lsd inputs, including
explicit spellings such as `README.md`, `Cargo.toml`, and `CMakeLists.txt`.
Unmatched names keep native fallbacks. See
[icon capabilities](cli-adapters.md#icon-mapping-and-consumer-limits) for details.
Keep layout, keybindings, editor selection, and diff renderers in the base config.

### Shell loading

`--use-config-file` loads comma-separated files in order. For normal shell use,
the same list can be supplied through `LG_CONFIG_FILE`. This Zsh example
ignores empty entries, removes every existing Iris entry, and appends Iris once.
The relative order of all other files is preserved. Iris loads last and can
override matching theme fields in custom overlays. An unset or empty list uses
the base config if readable; an existing custom list does not acquire an extra
base entry. An unavailable theme leaves the environment unchanged.

```zsh
lazygit_config_dir="$(lazygit --print-config-dir)"
if [[ -r "$lazygit_config_dir/themes/iris-nocturne.yml" ]]; then
  () {
    local theme="$lazygit_config_dir/themes/iris-nocturne.yml"
    local existing="${LG_CONFIG_FILE-}" config
    local -a configs=("${(@s:,:)existing}") overlays=()
    configs=("${(@)configs:#}")
    if (( ${#configs} == 0 )) &&
        [[ -r "$lazygit_config_dir/config.yml" ]]; then
      configs=("$lazygit_config_dir/config.yml")
    fi
    for config in "${configs[@]}"; do
      [[ "$config" == "$theme" ]] || overlays+=("$config")
    done
    overlays+=("$theme")
    export LG_CONFIG_FILE="${(j:,:)overlays}"
  }
fi
```

After changing the loading policy, restart Lazygit from a new configured shell.
Restart Neovim too so its terminal job environment is recomputed.

All listed files must exist. The explicit flag takes precedence over the
environment list. Commas delimit paths and cannot be escaped in this interface.
Existing `gui.darkTheme`/`gui.lightTheme` fields override corresponding
`gui.theme` fields; repository configuration may also override global settings.
Check these if a color does not match.

### Neovim / Snacks

Snacks normally generates a theme and appends it to the config list. Disable
that generation and pass the same files through the terminal job environment.
This LazyVim override preserves the root/cwd and history entrypoints:

```lua
return {
  {
    "folke/snacks.nvim",
    opts = function(_, opts)
      local result = vim.fn.system({ "lazygit", "--print-config-dir" })
      assert(vim.v.shell_error == 0, "Cannot find the lazygit config directory")
      local directory = vim.trim(result)
      local theme = directory .. "/themes/iris-nocturne.yml"
      assert(vim.fn.filereadable(theme) == 1, "Install the Iris lazygit theme first")
      opts.lazygit = opts.lazygit or {}
      local environment = opts.lazygit.env or {}
      local existing = environment.LG_CONFIG_FILE or vim.env.LG_CONFIG_FILE or ""
      local configs = vim.split(existing, ",", { trimempty = true })
      if #configs == 0 and vim.fn.filereadable(directory .. "/config.yml") == 1 then
        configs = { directory .. "/config.yml" }
      end
      configs = vim.tbl_filter(function(path)
        return path ~= "" and path ~= theme
      end, configs)
      table.insert(configs, theme)
      opts.lazygit.configure = false
      opts.lazygit.env = vim.tbl_extend("force", environment, {
        LG_CONFIG_FILE = table.concat(configs, ","),
      })
    end,
  },
}
```

Place this after existing Snacks settings. It moves Iris to the end without
changing `vim.env.LG_CONFIG_FILE`. Restart Neovim when migrating from a session
that already opened Snacks lazygit: the old generated path can remain in that
process environment. Remove that stale cache-file path from any saved list.
Do not set Snacks `theme_path` to the Iris file, which it could overwrite.

Disabling `configure` also disables Snacks' editor preset injection. Retain
this in the base config to edit in the parent Neovim instance:

```yaml
os:
  editPreset: nvim-remote
```

### Diffs and restoration

Install [bat](#bat) and [delta](#delta), rebuild bat's cache, and select
`delta.features = iris-nocturne` in Git. The theme leaves this base config alone:

```yaml
git:
  diffRenderers:
    - name: delta
      command: delta --paging=never
    - name: raw
      type: rawGit
```

Use `|` to cycle renderers. delta provides syntax and diff backgrounds; rawGit
uses native Git colors and the terminal ANSI palette. Exact HEX colors require
a true-color terminal. ANSI and non-theme UI colors remain outside the overlay.

Remove Iris from flag/environment lists to stop using it. In Snacks, remove the
override or restore `configure = true` to follow the Neovim theme again, and
remove Iris from inherited lists too. The file can remain installed. References:
[configuration](https://github.com/jesseduffield/lazygit/blob/v0.66.2/docs/Config.md),
[diff renderers](https://github.com/jesseduffield/lazygit/blob/v0.66.2/docs/Custom_DiffRenderers.md).

## Starship

The generator maintains `[palettes.iris-nocturne]` inside `.config/starship.toml`.
After merging the block, select it at the top level:

```toml
palette = "iris-nocturne"
```

The generator leaves the selector, prompt layout, modules, and other palettes
unchanged. See the [managed-block workflow](#merging-configuration-blocks).

## Herdr

The generator maintains 19 color overrides in `[theme.custom]` inside
`.config/herdr/config.toml`. Keep the built-in base theme and behavioral settings
in your configuration. For example, use `name = "catppuccin"` under `[theme]` as
the base; `iris-nocturne` is not a built-in Herdr theme name.

The sidebar inherits the terminal background through `sidebar_bg = "reset"`.
Active rows, selections, menus, and other panels keep distinct backgrounds.

Herdr and Claude Code use the shared terminal surface roles, which complement
the terminal gradient. Neovim, fzf, lazygit, Yazi, and btop also use these roles
for selected rows, panels, or tabs. Delta uses `terminal_surface` and two
additional colors for its blame groups.

| Herdr token | Role and use |
|---|---|
| `panel_bg` | `terminal_surface` (`#2D2B60`): menus and popups |
| `active_row_bg` | `terminal_raised` (`#37336E`): active row |
| `surface_dim` | `terminal_surface` (`#2D2B60`): matches Claude Code message surfaces |
| `surface0` | `terminal_raised` (`#37336E`): local control emphasis |
| `selection_bg` | `terminal_selection` (`#443E7E`): keyboard navigation selection |
| `surface1` | `terminal_border` (`#584F8B`): stronger surface layer |
| `overlay0` | `comment` (`#ADB4CE`): secondary labels and separators |

Field definitions follow the [Herdr v0.9.5 source](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/state.rs).

### Disable custom overrides

Selecting a built-in theme in Herdr leaves custom overrides in place. To return
to the built-in palette, keep the generated block markers and comment out the
entire `[theme.custom]` table, including every color key. The generator preserves
this disabled state, updates colors inside the comments, and supports `--check`.

Remove the leading `# ` from each line in the block to re-enable it. A commented
table header with uncommented keys is rejected because it can change which TOML
table owns those keys.

## Codex CLI

The integration targets version `0.163.0`. Install the TextMate file:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/themes"
cp dist/.codex/themes/iris-nocturne.tmTheme \
  "${CODEX_HOME:-$HOME/.codex}/themes/iris-nocturne.tmTheme"
```

Run `/theme` and select `iris-nocturne` (the file's display name is
`Iris Nocturne`). The picker previews the theme and saves the selection to
`tui.theme` in `$CODEX_HOME/config.toml`. Choose your previous theme through the
same picker to switch back; the custom file can stay.

The theme styles Markdown code blocks and file diffs, as described in the
[Codex documentation](https://learn.chatgpt.com/docs/cli-customization#syntax-highlighting-and-themes).
Other interface colors remain under terminal and CLI control. Use a true-color
terminal for exact HEX colors.

## Claude Code CLI

The theme format targets version `2.1.304`; message background fields target
`2.1.306`. Install the native JSON file:

```sh
mkdir -p ~/.claude/themes
cp dist/.claude/themes/iris-nocturne.json \
  ~/.claude/themes/iris-nocturne.json
```

If `~/.claude/themes` did not exist when Claude Code started, restart once after
installation. Run `/theme` and choose `Iris Nocturne`; the saved ID is
`custom:iris-nocturne`. Subsequent file edits reload automatically. Use `/theme`
to switch back to your previous theme.

The JSON inherits `base: "dark"` and overrides 41 official tokens:

| Claude Code token | Palette mapping |
|---|---|
| `claude`, `permission`, `briefLabelClaude`, `rate_limit_fill` | `accent` |
| `text`, `inactiveShimmer` | `foreground` |
| `inverseText` | `background`: text on colored badges |
| `diffAddedDimmed`, `diffRemovedDimmed` | `terminal_surface` (`#2D2B60`) |
| `inactive`, `subtle` | `muted`, `comment` (`#ADB4CE`), respectively |
| `suggestion`, `ide`, `briefLabelYou` | `member` |
| `remember`, `merged`, `effortUltra` | `keyword` |
| `success`, `autoAccept` | `added` |
| `error` | `error` |
| `warning`, `bashBorder` | `warning` |
| `promptBorder` | `terminal_border` (`#584F8B`) |
| `rate_limit_empty` | `border` |
| `planMode`, `fastMode` | `preprocessor`, `string`, respectively |
| `diffAdded`, `diffRemoved` | `diff_add`, `diff_delete`, respectively |
| `diffAddedWord`, `diffRemovedWord` | `diff_add_emphasis`, `diff_delete_emphasis`, respectively |
| `userMessageBackground`, `bashMessageBackgroundColor`, `memoryBackgroundColor`, `composerSidebarBackground` | `terminal_surface` (`#2D2B60`) |
| `userMessageBackgroundHover`, `selectionBg` | `terminal_raised` (`#37336E`), `terminal_selection` (`#443E7E`), respectively |
| `claudeShimmer`, `permissionShimmer`, `promptBorderShimmer`, `fastModeShimmer` | `keyword` |
| `warningShimmer` | ANSI bright yellow (`ansi[11]`) |

Unspecified tokens inherit from `dark`. Some backgrounds and selections appear
only in fullscreen mode. This export uses UI tokens, not TextMate syntax scopes;
see the [Claude Code documentation](https://code.claude.com/docs/en/terminal-config#create-a-custom-theme)
for the format and loading behavior.

## Merging configuration blocks

Starship and Herdr can retain complete application configs around a generated
region. Put exactly one ordered pair of markers in each existing file:
`.config/starship.toml` and `.config/herdr/config.toml`.

```toml
# BEGIN GENERATED iris-nocturne
# Colors inside this block are maintained by the generator.
# END GENERATED iris-nocturne
```

By default, the generator reads these files from the output directory and
replaces the marked content, keeping settings outside the block. Missing,
repeated, or misordered markers are rejected, and the merged result must be
valid TOML. If a file does not exist, the generator emits a standalone marked
color block for you to merge into the application config.

For a preview of an existing configuration, read from a home-directory mirror
and write to a separate destination:

```sh
python3 build.py --source-root /path/to/config-mirror --output-root dist
python3 build.py --source-root /path/to/config-mirror --output-root dist --check
```

The source directory must exist. `--check` compares complete expected files,
including surrounding settings read from the source, against the output. It
writes nothing and does not verify theme activation. Set Starship's top-level
`palette` or Herdr's base theme in your configuration.
