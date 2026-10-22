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
| `.config/iris-nocturne/ls-colors.sh` | Shared true-color `LS_COLORS` table |
| `.config/iris-nocturne/fzf.sh` | `IRIS_NOCTURNE_FZF_COLORS`, a single color-only `--color` argument |
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
[[ ! -r "$XDG_CONFIG_HOME/iris-nocturne/ls-colors.sh" ]] ||
  source "$XDG_CONFIG_HOME/iris-nocturne/ls-colors.sh"
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

lsd reuses glyphs from `assets/yazi-icons.toml`. `assets/lsd-icons.toml` explicitly
covers all built-in filename and extension keys in lsd 1.2.0; review new keys when
upgrading. Equivalent case-insensitive glyph mappings are merged, while conflicts
fail generation. Named directories use the Codicons folder glyph.

lsd colors the icon and filename together: a script can keep its language glyph
while taking the executable color. Yazi supports separate icon colors. lsd has
no hovered-folder state; both integrations use your installed Nerd Font.

The pinned interfaces are documented in lsd's [theme guide](https://github.com/lsd-rs/lsd/blob/v1.2.0/README.md#color-theme),
[icon implementation](https://github.com/lsd-rs/lsd/blob/v1.2.0/src/icon.rs), and
[filename renderer](https://github.com/lsd-rs/lsd/blob/v1.2.0/src/meta/name.rs).

## fzf and fzf-tab

Before initializing fzf, load the snippet and append its color argument:

```zsh
if [[ -r "$XDG_CONFIG_HOME/iris-nocturne/fzf.sh" ]]; then
  source "$XDG_CONFIG_HOME/iris-nocturne/fzf.sh"
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
