# CLI adapters

[README](../README.md) · [Application setup](applications.md) · [Integration examples](examples.md)

These adapters share colors across file listings, completion, fuzzy finding, and
Zsh input. They target true-color terminals, inheriting the terminal background
except for states such as fzf's current row. Layout and keybindings stay in your
configuration.

[Build and check](../README.md#build-the-theme) the resources, then install them
under your configuration directory. Paths below are relative to the export root:

| Output relative to export root | Purpose |
|---|---|
| `.config/lsd/colors.yaml` | Metadata colors: permissions, dates, sizes, users, Git status |
| `.config/lsd/icons.yaml` | File-type, filename, and extension icons |
| `.config/ls-colors/iris-nocturne.sh` | Shared true-color `LS_COLORS` table |
| `.config/fzf/iris-nocturne.sh` | `IRIS_NOCTURNE_FZF_COLORS`, a single color-only `--color` argument |
| `.config/zsh/themes/iris-nocturne.zsh` | Foreground styles for highlighting and autosuggestions |

The snippets assume `XDG_CONFIG_HOME` is set to your configuration directory.
Source them from your shell setup; they skip unreadable optional files.

## File colors and icons

### lsd configuration

For lsd 1.2.0, merge the following into your existing config to load `colors.yaml`:

```yaml
color:
  when: auto
  theme: custom
```

Keep `icons.theme: fancy` to use the `icons.yaml` override.

### Shared file colors

Source the table before running lsd/fd or initializing completion:

```zsh
[[ ! -r "$XDG_CONFIG_HOME/ls-colors/iris-nocturne.sh" ]] ||
  source "$XDG_CONFIG_HOME/ls-colors/iris-nocturne.sh"
# Load your existing completion.zsh next, keeping its list-colors settings.
```

The table replaces inherited file colors and explicitly covers base types and
special permissions. File attributes take precedence over extensions:

| State or category | Palette role |
|---|---|
| Symlink | `comment` |
| Broken symlink | `error` |
| Executable | `added` |
| setuid / setgid | `warning` |
| Directory | `type` |
| Image | `preprocessor` |
| Audio / video | `warning` |
| Archive | `constant` |
| Document | `added` |
| Ordinary file / source code | `foreground` |

`colors.yaml` controls lsd metadata; `LS_COLORS` controls filenames in lsd, fd,
and completion. Keep completion's existing `list-colors` configuration. The
extension list uses the final suffix, while Yazi matches MIME types, so their
file-type coverage differs.

### Icon mapping and consumer limits

Yazi, lsd, and lazygit share base language glyphs from `assets/yazi-icons.toml`
and purpose rules from `assets/purpose-icons.toml`. Ordinary directories in
Yazi and lsd retain a folder;
special directories use code, test, documentation, package, tools, and other
purpose symbols. README, licenses, manifests, lockfiles, Docker, Git, environment,
and tool configuration files also have purpose icons. Add or adjust named rules
in the shared purpose table to update all three consumers.

`assets/lsd-icons.toml` covers all built-in filename and extension keys in lsd
1.2.0 before the shared overrides; review new keys when upgrading. Equivalent
case-insensitive glyph mappings are merged, while conflicts fail generation.
lsd looks up exact names before extensions and type fallbacks. It uses one name
table for both files and directories, so a known directory name takes its
directory purpose icon even if a regular file shares that name. Yazi keeps the
two tables separate. Yazi-only globs are omitted from lsd; common environment,
README, and Docker spellings are listed explicitly for lsd instead.

lsd colors the icon and filename together: a script can keep its language glyph
while taking the executable color. Yazi supports separate icon colors, using
palette roles for purpose icons and retained colors for other language glyphs.
lsd has no hovered-folder state; both integrations use your installed Nerd Font.

### lazygit shared icons

The [lazygit overlay](applications.md#lazygit) uses the same resolved file,
directory, and extension rules. Like lsd, it has a single filename table;
directory purpose rules win same-name conflicts. Icons have their own colors,
matching Yazi, while Git status text keeps lazygit's own colors. lsd instead
colors the icon and filename together.

lazygit 0.66.2 matches exact basenames case-sensitively, then lowercase final
extensions. Its built-in filename rules precede extension overrides.
`assets/lazygit-filenames.toml` records native and common spellings so the
renderer can override these with shared rules; it contains no glyphs or colors.
Update that list when upgrading lazygit or adding a mixed-case filename rule.
For example, both `readme.md` and `README.md` use the documentation icon, and
`Cargo.toml` uses the package icon rather than the native Rust icon.

Yazi globs are omitted; common environment filenames remain explicit rules.
Arbitrary mixed-case names are not enumerated. Unmatched files/folders,
submodule and worktree fallbacks, expanded-folder states, and Git UI symbols
retain native behavior. The native interface cannot replace generic default
file/folder glyphs. The overlay enables Nerd Font 3 and file icons for both
terminal and Snacks entrypoints without distributing any font files.

The pinned interfaces are documented in lsd's [theme guide](https://github.com/lsd-rs/lsd/blob/v1.2.0/README.md#color-theme),
[icon implementation](https://github.com/lsd-rs/lsd/blob/v1.2.0/src/icon.rs), and
[filename renderer](https://github.com/lsd-rs/lsd/blob/v1.2.0/src/meta/name.rs).

## fzf and fzf-tab

Before initializing fzf, load the snippet and append its color argument:

```zsh
if [[ -r "$XDG_CONFIG_HOME/fzf/iris-nocturne.sh" ]]; then
  source "$XDG_CONFIG_HOME/fzf/iris-nocturne.sh"
  export FZF_DEFAULT_OPTS="${FZF_DEFAULT_OPTS:+$FZF_DEFAULT_OPTS }$IRIS_NOCTURNE_FZF_COLORS"
fi
```

After loading fzf-tab, append the same argument while preserving existing flags:

```zsh
if (( ${+functions[fzf-tab-complete]} )) && [[ -n ${IRIS_NOCTURNE_FZF_COLORS-} ]]; then
  typeset -a _iris_fzf_tab_flags
  zstyle -a ':fzf-tab:complete' fzf-flags _iris_fzf_tab_flags
  zstyle ':fzf-tab:*' fzf-flags "${_iris_fzf_tab_flags[@]}" "$IRIS_NOCTURNE_FZF_COLORS"
  unset _iris_fzf_tab_flags
fi
```

If your configuration defines more specific `fzf-flags` contexts, append the color
argument there too. These snippets do not change `use-fzf-default-opts` or
`FZF_DEFAULT_OPTS_FILE`; append only the color argument to keep other fzf options
out of completion. Put personal color overrides after theme loading.

Normal, preview, and gutter backgrounds inherit the terminal. The current row
uses `terminal_raised`, matches use `accent`, the pointer uses `type`, and
multi-select markers use `warning`.

`--color` styles the interface. To display colored input, the consumer also needs
`--ansi`, as in `fd --color always | fzf --ansi`; fzf-tab already enables it.
Preview content comes from its provider, such as bat. The adapter targets fzf
0.74.5; consult the installed `man fzf` for the option format.

## Zsh highlighting and autosuggestions

Source the styles after autosuggestions and fast-syntax-highlighting:

```zsh
[[ ! -r "$XDG_CONFIG_HOME/zsh/themes/iris-nocturne.zsh" ]] ||
  source "$XDG_CONFIG_HOME/zsh/themes/iris-nocturne.zsh"
```

The snippet updates `FAST_HIGHLIGHT_STYLES` for existing theme prefixes and
supplies an in-memory secondary theme for nested commands. It preserves the
theme name and writes no caches. Without the highlighting plugin, it sets only
the autosuggestion color.

Commands, built-ins, aliases, function calls, and subcommands share
`function_reference` (`#8F9FFF`), keeping commands such as `git diff` one color.
Reserved words use `keyword`; ordinary variables and arguments use the text
color; paths and options use `member`; autosuggestions use `subtle`. Directory
paths are underlined and errors are bold; other styles set only the foreground.

Classification follows the plugin's parser. Arithmetic numbers use the number
color; a numeric argument in an ordinary position remains an argument. Comment
handling follows your existing `interactivecomments` option.

## Verify and activate

Follow the [validation guide](validation.md) for automated tests and isolated
interactive checks. Clear inherited `NO_COLOR` when inspecting colors; normal
use follows each consumer's color-disable policy. After installing the files,
start a new shell to load the updated snippets.
