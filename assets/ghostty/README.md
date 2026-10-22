# Neon Noir gradient background

`iris-nocturne-dark.png` is a static rendering of Xcode 27's Neon Noir dark
background. It requires no Xcode installation and is separate from generated
theme files.

## Use in Ghostty

Save your current background and opacity settings. Create a `backgrounds/`
directory beside your Ghostty config, copy the PNG into it, then add:

```ini
background = #2C2457
background-image = backgrounds/iris-nocturne-dark.png
background-image-fit = stretch
background-image-opacity = 1
background-image-repeat = false
background-opacity = 1
```

The opaque image covers the terminal background. `background` supplies a purple
reference color for title bars and terminal applications that query the
background; those colors may differ from the image beneath them. Title-bar
appearance depends on your Ghostty configuration.

Reload Ghostty's configuration. Existing sessions may cache queried colors, so
check a new terminal and restart the application being inspected if necessary.
Each split draws its own gradient.

See the [configuration layout example](../../docs/examples.md#ghostty-background)
for a configuration mirror.

## Restore previous settings

Remove the added `background` and `background-image*` overrides, restore your
saved background and `background-opacity`, and reload. Changing `theme` alone
leaves explicit background overrides in place. The PNG can remain on disk when
it is no longer referenced.

## Asset provenance

| Property | Value |
|---|---|
| Source | Built-in `neonNoir.darkPalette` in local Xcode 27.1 (27A9275) |
| Rendering | Native Xcode background `ShapeStyle`, rendered with SwiftUI `ImageRenderer` |
| Direction | Top `(0.5, 0)` to bottom `(0.5, 1)` |
| Top / bottom reference colors | `#2C2457` / `#002F53`, rounded to 8-bit sRGB |
| Format | 1600 × 1200, 8-bit RGB PNG, sRGB, no alpha channel |
| SHA-256 | `c7d4d28a95d0caead0ae19a05a25f15c5d86da04246a11176031ec7985648b29` |

The recipe uses primary hue/intensity `303° / 0.5` and secondary hue/intensity
`264° / 0.75`. It was resolved in the dark branch with an active context, P3,
increased background chroma, additional contrast 0, and standard display mode.
The original OKLCH endpoints are:

| Endpoint | L | C | h |
|---|---|---|---|
| Top | `0.2988362828069006` | `0.08944184059285089` | `286.5°` |
| Bottom | `0.29154759298234206` | `0.08944184059285089` | `241.5°` |

SwiftUI rendered the native `ShapeStyle` directly, preserving the recipe beyond
the rounded HEX references. The image includes no window materials, sidebar
layers, or application code.
