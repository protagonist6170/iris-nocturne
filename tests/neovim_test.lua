-- Run with an isolated, patched config followed by parser/query runtime paths.
local config = assert(arg[1], "expected an isolated Neovim config directory")
vim.opt.runtimepath:prepend(config)
for i = 2, #arg do
  vim.opt.runtimepath:append(arg[i])
end
vim.opt.runtimepath:append(config .. "/after")
local theme = require("iris_nocturne")
for _, transparent in ipairs({ true, false }) do
  theme.setup({ transparent = transparent })
  theme.load()
  local normal = vim.api.nvim_get_hl(0, { name = "Normal", link = false })
  local split = vim.api.nvim_get_hl(0, { name = "NoiceSplit", link = false })
  assert(split.bg == normal.bg, "NoiceSplit must follow Normal's background")
  assert(transparent and normal.bg == nil or not transparent and normal.bg == 0x10112B)
  for _, name in ipairs({
    "NormalFloat", "LazyNormal", "MasonNormal", "FzfLuaNormal",
    "FzfLuaPreviewNormal", "FzfLuaFzfNormal", "BlinkCmpDoc", "WhichKey",
  }) do
    assert(vim.api.nvim_get_hl(0, { name = name, link = false }).bg == 0x2D2B60, name)
  end
  for _, name in ipairs({ "LspReferenceText", "LspReferenceRead", "LspReferenceWrite" }) do
    assert(vim.api.nvim_get_hl(0, { name = name, link = false }).bg == 0x443E7E, name)
  end
end

local semantic = require("iris_nocturne.semantic")
local expected = {
  ["function"] = { "function_reference", "function_reference" },
  method = { "function_reference", "function_reference" },
  variable = { "variable_reference", "variable_reference" },
  parameter = { "parameter_reference", "parameter_reference" },
  property = { "field_reference", "field_reference" },
  namespace = { "namespace_reference", "namespace_reference" },
  class = { "type_reference", "type_declaration" },
  type = { "type_reference", "type_declaration" },
}
for kind, roles in pairs(expected) do
  for _, modifiers in ipairs({
    {},
    { defaultLibrary = true },
    { declaration = true },
    { definition = true, defaultLibrary = true, deprecated = true },
    { readonly = true, static = true, async = true },
  }) do
    local role = (modifiers.declaration or modifiers.definition) and roles[2] or roles[1]
    assert(semantic.role({ type = kind, modifiers = modifiers }) == role, kind)
  end
end
assert(semantic.role({ type = "macro" }) == nil)
local deprecated = vim.api.nvim_get_hl(0, {
  name = "IrisNocturneFunctionReferenceDeprecated",
  link = false,
})
assert(deprecated.fg == 0x8F9FFF and deprecated.strikethrough)

local callable_groups = {
  "Function", "@function", "@function.call", "@function.method",
  "@function.method.call", "@function.builtin", "@lsp.type.function",
  "@lsp.type.method", "IrisNocturneFunctionReference",
  "@iris_nocturne.function.reference", "BlinkCmpKindFunction", "BlinkCmpKindMethod",
}
for _, name in ipairs(callable_groups) do
  assert(vim.api.nvim_get_hl(0, { name = name, link = false }).fg == 0x8F9FFF, name)
end
for name, color in pairs({
  BlinkCmpKindEvent = 0xB3A9FF,
  BlinkCmpKindConstructor = 0x9CBFFF,
  ["@constructor"] = 0x4DC5FD,
  ["@function.macro"] = 0xFF8F7D,
  ["@attribute"] = 0xFF8F7D,
  Keyword = 0xC9A1FE,
  ["@property"] = 0x8ACFF5,
}) do
  assert(vim.api.nvim_get_hl(0, { name = name, link = false }).fg == color, name)
end

local fixtures = {
  python_identifiers = {
    language = "python",
    lines = {
      "class Model: pass",
      "def data_fingerprints(cora, mutag):",
      "    c = hashlib.sha256()",
      "    c.update(np.asarray(cora.value))",
      "    count: int = 2",
      "    return len(cora), None",
      "import numpy as np",
    },
    checks = {
      { 1, "Model", 0x85BAFE },
      { 2, "data_fingerprints", 0x8F9FFF },
      { 2, "cora", 0xEBA0AC },
      { 3, "c", 0xF4F2F9 },
      { 3, "sha256", 0x8F9FFF },
      { 4, "update", 0x8F9FFF },
      { 4, "asarray", 0x8F9FFF },
      { 4, "cora", 0xF4F2F9 },
      { 4, "value", 0x8ACFF5 },
      { 4, "np", 0xF4F2F9 },
      { 7, "numpy", 0xFFD18A },
      { 7, "np", 0xFFD18A },
      { 5, "count", 0xF4F2F9 },
      { 5, "int", 0xC9A1FE },
      { 6, "len", 0x8F9FFF },
      { 6, "None", 0xD2B5FF },
    },
  },
  cpp = {
    lines = {
      "struct Model { int scale(int value) { return value; } };",
      "int build(Model item) { return item.scale(2); }",
      "auto value = nullptr;",
      "bool check(int value) { if (value > 1 && value != 0) return true; else throw value; }",
    },
    checks = {
      { 1, "Model", 0x85BAFE },
      { 1, "scale", 0x8F9FFF },
      { 1, "value", 0xEBA0AC, 1 },
      { 1, "value", 0xF4F2F9, 2 },
      { 2, "build", 0x8F9FFF },
      { 2, "Model", 0x4DC5FD },
      { 2, "scale", 0x8F9FFF },
      { 3, "nullptr", 0xD2B5FF },
      { 4, "bool", 0xC9A1FE }, { 4, "if", 0xC9A1FE },
      { 4, ">", 0x7EDBD0 }, { 4, "&&", 0x7EDBD0 },
      { 4, "return", 0xC9A1FE }, { 4, "true", 0xD2B5FF },
      { 4, "throw", 0xC9A1FE },
    },
  },
  rust = {
    lines = {
      "struct Model { value: i32 }",
      "fn build(item: Model) -> i32 { item.scale(2) }",
      "fn main() { let value = build(Model { value: 2 }); }",
      "fn check() -> bool { for value in [1, 2] { if value > 1 { return true; } } false }",
    },
    checks = {
      { 1, "Model", 0x85BAFE },
      { 1, "i32", 0xC9A1FE },
      { 2, "build", 0x8F9FFF },
      { 2, "item", 0xEBA0AC, 1 },
      { 2, "item", 0xF4F2F9, 2 },
      { 2, "Model", 0x4DC5FD },
      { 2, "scale", 0x8F9FFF },
      { 3, "build", 0x8F9FFF },
      { 4, "for", 0xC9A1FE }, { 4, "in", 0xC9A1FE },
      { 4, "if", 0xC9A1FE }, { 4, ">", 0x7EDBD0, 2 },
      { 4, "true", 0xD2B5FF },
    },
  },
}
local fixture_root = vim.fs.dirname(debug.getinfo(1, "S").source:sub(2)) .. "/fixtures/"
fixtures.python = {
  lines = vim.fn.readfile(fixture_root .. "syntax.py"),
  checks = {
    { 2, "import", 0xC9A1FE }, { 2, "re", 0xFFD18A },
    { 3, "from", 0xC9A1FE }, { 6, "GraphFilter", 0x85BAFE },
    { 7, "Filter", 0x7EDBD0 }, { 9, "@", 0xFF8F7D },
    { 9, "lru_cache", 0xFF8F7D }, { 9, "maxsize", 0xEBA0AC },
    { 10, "collect", 0x8F9FFF }, { 10, "self", 0xFF7C96 },
    { 10, "nodes", 0xEBA0AC }, { 10, "list", 0xC9A1FE },
    { 10, "int", 0xC9A1FE }, { 10, "=", 0x7EDBD0 },
    { 11, "Return", 0x7EDBD0 }, { 12, "compile", 0x8F9FFF },
    { 12, "A", 0x4DC5FD }, { 12, "3", 0x7DD300 },
    { 16, "for", 0xC9A1FE }, { 16, "in", 0xC9A1FE },
    { 17, "pair", 0xF4F2F9 }, { 17, "=", 0x7EDBD0 },
    { 17, "(", 0xB1B6D0 }, { 17, ",", 0xB1B6D0 },
    { 18, "if", 0xC9A1FE }, { 18, "not", 0xC9A1FE },
    { 18, "in", 0xC9A1FE }, { 18, "and", 0xC9A1FE },
    { 19, "try", 0xC9A1FE }, { 20, "self", 0xFF7C96 },
    { 20, "name", 0x8ACFF5 }, { 20, "+", 0x7EDBD0 },
    { 20, "{", 0xFF8F7D }, { 20, "\\n", 0xFF8F7D },
    { 21, ">", 0x7EDBD0 }, { 21, "or", 0xC9A1FE },
    { 21, "is", 0xC9A1FE }, { 21, "None", 0xD2B5FF },
    { 22, "continue", 0xC9A1FE }, { 24, "except", 0xC9A1FE },
    { 25, "raise", 0xC9A1FE }, { 26, "finally", 0xC9A1FE },
    { 28, "return", 0xC9A1FE }, { 31, "async", 0xC9A1FE },
    { 31, "bool", 0xC9A1FE }, { 31, "True", 0xD2B5FF },
    { 32, "await", 0xC9A1FE }, { 33, "while", 0xC9A1FE },
    { 34, "yield", 0xC9A1FE }, { 35, "break", 0xC9A1FE },
  },
}
fixtures.markdown = {
  lines = vim.fn.readfile(fixture_root .. "syntax.md"),
  checks = {
    { 1, "Syntax", 0x9CBFFF }, { 3, ">", 0xEBA0AC },
    { 5, "[x]", 0x91D6A2 }, { 5, "https", 0x8ACFF5 },
    { 6, "[ ]", 0xB1B6D0 }, { 6, "inline_code", 0xFF981F },
    { 6, "x", 0x4DC5FD },
  },
}
fixtures.json = {
  lines = vim.fn.readfile(fixture_root .. "syntax.json"),
  checks = {
    { 2, "enabled", 0x8ACFF5 }, { 2, "true", 0xD2B5FF },
    { 3, "16", 0x7DD300 }, { 4, "graph", 0xFF981F },
  },
}
fixtures.yaml = {
  lines = vim.fn.readfile(fixture_root .. "syntax.yaml"),
  checks = {
    { 1, "defaults", 0x8ACFF5 }, { 1, "base", 0xFFD18A },
    { 2, "true", 0xD2B5FF }, { 3, "16", 0x7DD300 },
    { 4, "base", 0xFFD18A },
  },
}
fixtures.toml = {
  lines = vim.fn.readfile(fixture_root .. "syntax.toml"),
  checks = {
    { 1, "filter", 0xFFD18A }, { 2, "enabled", 0x8ACFF5 },
    { 2, "=", 0x7EDBD0 }, { 2, "true", 0xD2B5FF },
    { 3, "16", 0x7DD300 }, { 4, "2026", 0x7DD300 },
  },
}
assert(vim.api.nvim_get_hl(0, { name = "@keyword.conditional", link = false }).italic)
assert(vim.tbl_isempty(vim.api.nvim_get_hl(0, { name = "@lsp.type.operator", link = false })))
assert(semantic.role({ type = "parameter", modifiers = { builtin = true } }) == "builtin_variable")
assert(semantic.role({ type = "type", modifiers = { builtin = true } }) == "builtin_type")
for name, fixture in pairs(fixtures) do
  local language = fixture.language or name
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, fixture.lines)
  vim.treesitter.start(buf, language)
  vim.treesitter.get_parser(buf):parse(true)
  for _, check in ipairs(fixture.checks) do
    local row, word, color = unpack(check)
    local pattern = vim.pesc(word)
    if word:match("^[%w_]+$") then
      pattern = "%f[%w_]" .. pattern .. "%f[^%w_]"
    end
    local start, finish = fixture.lines[row]:find(pattern)
    assert(start, language .. ": missing fixture token " .. word)
    local occurrence = 0
    while start do
      occurrence = occurrence + 1
      if not check[4] or check[4] == occurrence then
        for col = start - 1, finish - 1 do
          local actual, priority = nil, -1
          for _, capture in ipairs(vim.treesitter.get_captures_at_pos(buf, row - 1, col)) do
            local name = "@" .. capture.capture .. "." .. capture.lang
            local id = vim.api.nvim_get_hl_id_by_name(name)
            local hl = vim.api.nvim_get_hl(0, { id = id, link = false })
            local p = tonumber(capture.metadata.priority) or 100
            if hl.fg and p >= priority then
              actual, priority = hl.fg, p
            end
          end
          assert(actual == color, ("%s %d:%d %s: expected #%06X, got %s"):format(
            language, row, col + 1, word, color, actual and ("#%06X"):format(actual) or "no color"
          ))
        end
      end
      start, finish = fixture.lines[row]:find(pattern, finish + 1)
    end
  end
  print(language .. ": syntax colors passed")
end
print("Semantic category and modifier checks passed")
vim.cmd("qa!")
