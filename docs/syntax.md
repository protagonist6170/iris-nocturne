# Syntax and semantics

[README](../README.md) · [Application setup](applications.md) · [Neovim integration](examples.md#neovim)

Iris Nocturne colors symbols by category: local, built-in, and library functions
share one color. Categories draw on Catppuccin Mocha, with primary syntax colors
from Neon Noir.

`textmate.json` expresses ordered rules using roles from `palette.json`.
`theme_source.py` validates them and resolves a `TokenRule` list, preserving
explicitly empty font styles. bat, Yazi, and Codex CLI share the resulting
TextMate XML; delta uses it through bat. Neovim classification is implemented
in your configuration.

## Color roles

| Role | HEX | Meaning |
|---|---|---|
| `function_reference` | `#8F9FFF` | Function/method definitions, calls, and identified references; also Zsh commands and subcommands |
| `variable_reference` | `#F4F2F9` | Ordinary variable declarations and references, matching body text |
| `field_reference` | `#8ACFF5` | Field and property declarations and references |
| `parameter_reference` | `#EBA0AC` | Identified parameters and named call arguments; Mocha maroon |
| `namespace_reference` | `#FFD18A` | Identified modules and namespaces |
| `type_reference` | `#4DC5FD` | Ordinary and library type references |
| `type_declaration` | `#85BAFE` | Type declaration and definition names |
| `member_reference` / `member_declaration` | `#299ED9` / `#5297E0` | Named constants and enum members, retaining reference/declaration shades |
| `builtin_type` | `#C9A1FE` | Types explicitly classified as built-in by syntax or semantic services |
| `builtin_variable` | `#FF7C96` | Identified language built-ins such as `self`, `cls`, and `this` |
| `operator` | `#7EDBD0` | Identified symbolic operators |
| `punctuation` | `#B1B6D0` | Ordinary brackets, separators, and punctuation |
| `documentation` | `#7EDBD0` | Docstrings, distinct from orange strings |
| `decorator` | `#FF8F7D` | Decorators and attribute annotations, separate from functions and HTML attributes |
| `regexp` | `#EBA0AC` | Regex body; recognized classes, escapes, and operators can use finer rules |

Variables, fields, parameters, and modules use the same category color for
declarations and references. Types and named constants have declaration shades.
Macros, preprocessors, boolean/null literals, and escapes have dedicated roles.

The shorter `type`, `function`, `member`, and `constant` roles support interface,
Markdown, and compatibility mappings. In particular, `function` stays `#B3A9FF`
for Starship's `lavender` alias and btop's upload gradient.

TextMate comments are italic; a local Neovim integration can make this optional.
Conditional keywords are italic when the parser exposes a separate category.

## Classification and fallbacks

### VS Code

The VSIX reuses the ordered TextMate rules and enables semantic highlighting.
Functions and methods share iris blue; parameters are pink, properties light
blue, and namespaces pale gold. Types and enum members use distinct shades for
declarations and definitions. The `readonly`, `static`, `async`, and library-origin
modifiers preserve the symbol's category color. Deprecated symbols retain
strikethrough, and explicit `selfParameter` tokens use the built-in variable role.

Installed language extensions determine the semantic detail available for Python,
C++, and TS/TSX. Standard token classifications do not always distinguish built-in
types from library types. Unrecognized semantic tokens fall back through VS Code's
TextMate mappings and the installed grammar. The theme provides colors without
installing language services. See the [VS Code guide](vscode.md) for the
background and solid-theme fallback.

### TextMate consumers

TextMate rules follow grammar scopes. Calls, method calls, and `support.function`
use the function color. Generic `variable` and `support.variable` use the text
color; more specific field, parameter, and module scopes use their own roles.

Call rules color the name without spilling into arguments or strings.
Unclassified identifiers retain the text color. The theme does not infer a
reference's category or origin from its name or an import statement.

### Neovim integration

The following describes the [local mappings](examples.md#semantic-roles-and-queries)
expected by `tests/neovim_test.lua`. Your configuration must implement them using
Tree-sitter captures and LSP tokens. Only types and enum members use
`declaration`/`definition` to select declaration shades.

`defaultLibrary`, `readonly`, `static`, and `async` do not change foreground
colors. Explicit `builtin` classifications distinguish built-in types from
built-in variables; deprecated symbols retain strikethrough. Theme-specific
captures take precedence over ordinary syntax captures, with semantic tokens
providing further classification. Python `None` and C++ `nullptr` keep their
literal colors.

### Examples across languages

| Example | bat / TextMate | Neovim integration |
|---|---|---|
| C++ `struct Model` | Type declaration | Type declaration |
| C++ `Model item` | Text color if unclassified by the grammar | Type reference |
| C++ or Rust `item.scale()` | Function | Function |
| Python `class Model`, `def build` | Type declaration / function | Type declaration / function |
| Python `np.asarray()`, `len()` | Function | Function |
| Python parameter declarations and `dtype=` | Parameter | Parameter |
| `.value` in Python `cora.value` | Depends on whether the grammar marks a field | Field |
| Rust `struct Model`, `fn build` | Type declaration / function | Type declaration / function |

Tree-sitter can classify Python parameter declarations and modules in imports.
References inside a function body use the variable color unless syntax or a
language service identifies them more specifically. The mappings add no scope
tracking, import inference, or name-based heuristics; existing upstream queries
may contain their own heuristics. Unrecognized function aliases can remain the
text color.

## Operators, strings, and document formats

Control-flow keywords—including conditions, loops, exceptions, imports,
coroutines, and returns—use `keyword` purple. Word operators such as `and`, `or`,
`not`, `in`, and `is` use the same purple. Symbolic operators use teal where they
can be identified. TextMate's root `keyword.operator` defaults to purple, with
teal symbolic subscopes and an explicit Python logical-operator override.
Punctuation uses the secondary text color; quotes, escapes, format placeholders,
and interpolation markers have more specific rules.

Python docstring rules cover MagicPython docstrings and Sublime documentation
comments. Other documentation comments use the comment color. Raw-string
prefixes use the string color; identified interpolated variables use the text
color. Neovim can use an installed regex parser for nested regex categories.
Without an injection or dedicated scope, embedded text keeps its string color.

Markdown rules cover headings, emphasis, strikethrough, quotes, links, code,
lists, and checkbox states. Recognized math uses the type color. TOML section
names and YAML anchors/aliases use the module color; common configuration keys
use the field color, and dates/times use the number color. Neovim query extensions
refine TOML sections, Markdown quote markers, and math to prevent competing
captures or default categories from masking them.

## Grammar-specific limits

The consumer's grammar determines which distinctions are available:

- bat 0.26.1 classifies `self` in a Python parameter declaration as an ordinary
  parameter, so it is pink there. Recognized `self` references in the body are
  red. MagicPython and the Neovim integration can distinguish both positions.
- That bat grammar does not separately mark `name` in `self.name` as a field,
  leaving it the text color. Neovim can identify it and apply soft blue.
- MagicPython groups several control-flow keywords under one flow scope. The
  theme avoids italicizing the entire group just to italicize conditions.

## Validation

The tests check rule order, category colors, empty font styles, actual bat output,
and Neovim capture/semantic mappings. See [validation](validation.md) for commands,
runtime requirements, and visual checks. `build.py --check` compares exported
files, without testing application rendering.
