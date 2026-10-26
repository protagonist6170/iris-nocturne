# Iris Nocturne

A dark theme inspired by Xcode 27's Neon Noir, built for a consistent workspace
across editors, terminals, and command-line tools.

A shared palette and syntax rules produce native theme files for each application.
The VS Code package is **v0.1.0**; its optional background is validated on macOS
with official VS Code Stable **1.143.1**.

## Build the theme

The generator requires **Python 3.11+** and uses only the standard library. From
the project root, export the resources and verify the result:

```sh
python3 build.py --output-root dist
python3 build.py --output-root dist --check
```

The export contains **21 files**: 17 home-relative configuration resources under
`.config/`, `.codex/` and `.claude/`, plus four VS Code delivery files under
`vscode/`. Install the configuration resources in their matching home paths;
install the VSIX through VS Code. Generate `dist/` as needed and keep it out of
version control.

`--output-root` is required. The generator renders all resources and validates
inputs and merged TOML before writing; `--check` compares the expected files
without writing. Install the exports, rebuild any application caches, and select
the themes through your usual configuration workflow.

Starship and Herdr use [managed configuration blocks](docs/applications.md#merging-configuration-blocks)
to preserve surrounding settings. Add the block markers to existing files before
exporting, or use `--source-root` to read a configuration mirror and preview the
merge in a separate directory.

## Supported applications

All output paths below are relative to the export root.

| Application | Generated resource | Setup |
|---|---|---|
| Ghostty | `.config/ghostty/themes/iris-nocturne` | [Terminal colors](docs/applications.md#ghostty) |
| Neovim | `.config/nvim/lua/iris_nocturne/palette.lua` | [Palette integration](docs/applications.md#neovim) |
| VS Code | `vscode/{iris-nocturne.vsix,iris-nocturne-color-theme.json,iris-nocturne.css,settings.example.json}` | [Theme and optional gradient](docs/vscode.md) |
| bat | `.config/bat/themes/iris-nocturne.tmTheme` | [Syntax theme](docs/applications.md#bat) |
| Yazi | `.config/yazi/flavors/iris-nocturne.yazi/{flavor.toml,tmtheme.xml}` | [Flavor and icons](docs/applications.md#yazi) |
| btop | `.config/btop/themes/iris-nocturne.theme` | [Monitor colors](docs/applications.md#btop) |
| delta | `.config/git/themes/iris-nocturne.gitconfig` | [Diff feature](docs/applications.md#delta) |
| lazygit | `.config/lazygit/themes/iris-nocturne.yml` | [UI, shared icons, and Snacks](docs/applications.md#lazygit) |
| Starship | Managed palette in `.config/starship.toml` | [Prompt palette](docs/applications.md#starship) |
| Herdr | Managed colors in `.config/herdr/config.toml` | [Custom overrides](docs/applications.md#herdr) |
| Codex CLI | `.codex/themes/iris-nocturne.tmTheme` | [Syntax theme](docs/applications.md#codex-cli) |
| Claude Code CLI | `.claude/themes/iris-nocturne.json` | [Custom theme](docs/applications.md#claude-code-cli) |
| lsd | `.config/lsd/{colors.yaml,icons.yaml}` | [File colors and icons](docs/cli-adapters.md#file-colors-and-icons) |
| fd and file completion | `.config/ls-colors/iris-nocturne.sh` | [Shared file colors](docs/cli-adapters.md#file-colors-and-icons) |
| fzf and fzf-tab | `.config/fzf/iris-nocturne.sh` | [Interface colors](docs/cli-adapters.md#fzf-and-fzf-tab) |
| Zsh highlighting and autosuggestions | `.config/zsh/themes/iris-nocturne.zsh` | [Shell styles](docs/cli-adapters.md#zsh-highlighting-and-autosuggestions) |

bat, Yazi, and Codex CLI receive identical TextMate XML; delta uses that theme
through bat. Neovim receives a palette for use in your own highlight mappings.
The [syntax guide](docs/syntax.md) explains how parser and semantic capabilities
affect the result in each application.

The optional [Neon Noir gradient background](assets/ghostty/README.md) for Ghostty
is a static asset, separate from the export.

VS Code receives a native theme and a bundled purple-to-blue background
stylesheet. The background gives sidebars their own aligned gradient and gently
fades inactive editor groups. Settings, modal editors, and code-preview widgets
retain opaque surfaces. Iris includes commands to enable the gradient, migrate
legacy CSS imports, and restore previous appearance; the native theme also works
with solid backgrounds. Follow the
[VS Code guide](docs/vscode.md) for installation and restoration through VS Code
and Finder. The same guide ships in the VSIX. Development checks and isolated
validation are documented in the [validation guide](docs/validation.md#vs-code-integration).

Yazi, lsd, and lazygit share [purpose icons](assets/purpose-icons.toml) for special
directories and project files; source files retain their language icons.
Yazi and lsd also override ordinary folder glyphs. lazygit keeps its native
fallback for unmatched files and folders. See the
[icon guide](docs/cli-adapters.md#icon-mapping-and-consumer-limits) for consumer
differences and how to extend the mappings.

## Documentation

- [Application setup](docs/applications.md): installation, theme selection, and
  settings managed by each integration.
- [CLI adapters](docs/cli-adapters.md): file colors, icons, fzf, and Zsh load order.
- [Integration examples](docs/examples.md): configuration mirrors, Neovim module
  structure, and shell integration.
- [Syntax and semantics](docs/syntax.md): color roles, classification rules, and
  fallbacks across languages.
- [Validation](docs/validation.md): automated checks, dependencies, and visual review.

## Development

```text
palette.json + textmate.json + assets/
                  |
           theme_source.py       Load and validate shared inputs
                  |
             renderers/          Produce native theme formats
                  |
              build.py           Merge configs, export, or compare files
```

`palette.json` defines colors and provenance; `textmate.json` defines ordered
syntax rules. Renderers return text or bytes, using shared colors and static
assets as needed. `build.py` coordinates rendering, configuration merging, and
output file access.

Run the test suite from the project root:

```sh
python3 -B -m unittest discover -s tests -p '*_test.py'
```

Integration checks use installed tools. Neovim syntax checks run separately and
require a complete configuration copy and parser/query runtimes. See
[validation](docs/validation.md) for dependencies, skips, and commands.

To add an application:

1. Establish its native theme format and the styles it can express. Reuse an
   existing renderer when the format is shared.
2. Add any new mapping under `renderers/`, keeping rendering separate from setup.
3. Register the output path and renderer call in `build.py`. Keep validation
   ahead of writes.
4. Add focused tests for format constraints, important mappings, or the consumer.
5. Update the application table and setup guide. Update the syntax guide if the
   new integration changes the documented capabilities.

## Design and provenance

Foreground, comment, keyword, string, number, and preprocessor colors were
recorded from Xcode 27.1's built-in Neon Noir dark preset, resolved by Xcode, and
rounded to 8-bit sRGB. Backgrounds, interface colors, diagnostics, and terminal
ANSI colors are adaptations.

Identifier categories draw on Catppuccin Mocha. Functions and Zsh commands share
soft iris blue (`#8F9FFF`); other symbols use distinct category colors, with
declaration shades for types and named constants. See the
[syntax guide](docs/syntax.md) for mappings and parser limitations, and
[`palette.json`](palette.json) for source notes.

This is an independent adaptation. No Apple theme files or application binaries
are distributed.

## License

- [MIT](LICENSE): the theme and generator.
- [Catppuccin MIT](licenses/catppuccin-LICENSE): adapted Yazi file-type rules and styles.
- [Yazi MIT](licenses/yazi-LICENSE): filename and extension icon mappings. Glyphs
  are supplied by the user's Nerd Font.
- [lsd Apache-2.0](licenses/lsd-LICENSE): adapted built-in icon keys from the pinned version.
