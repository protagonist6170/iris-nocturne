-- Run against a copied Snacks runtime and temporary HOME/config/cache/repo.
local root = assert(arg[1], "expected isolated fixture root")
local snacks_path = assert(arg[2], "expected copied Snacks runtime")
vim.opt.runtimepath:prepend(snacks_path)
vim.o.columns = 160
vim.o.lines = 48
vim.o.termguicolors = true
vim.fn.serverstart(root .. "/nvim.sock")

local function check()
  local configs = root .. "/base.yml," .. root .. "/theme.yml"
  local parent_config = vim.env.LG_CONFIG_FILE
  local snacks = require("snacks")
  snacks.setup({
    lazygit = {
      configure = false,
      env = { LG_CONFIG_FILE = configs },
    },
  })
  local target = root .. "/repo/README.md"
  vim.cmd.enew()
  local terminal = snacks.lazygit({ cwd = root .. "/repo" })
  local job = vim.b[terminal.buf].terminal_job_id
  assert(job, "Snacks did not start a terminal job")
  local exit_status
  vim.api.nvim_create_autocmd("TermClose", {
    buffer = terminal.buf,
    once = true,
    callback = function()
      exit_status = vim.v.event.status
    end,
  })
  local function screen()
    return table.concat(vim.api.nvim_buf_get_lines(terminal.buf, 0, -1, false), "\n")
  end
  assert(vim.wait(15000, function()
    return screen():find("README.md", 1, true) ~= nil
  end, 50), "lazygit did not render: " .. screen())
  assert(screen():find("\u{eaa4}", 1, true), "shared README icon not rendered")
  assert(vim.env.LG_CONFIG_FILE == parent_config, "parent environment changed")
  assert(vim.fn.filereadable(vim.fn.stdpath("cache") .. "/lazygit-theme.yml") == 0,
    "Snacks generated an overriding theme")

  -- Editing the selected README must reuse this Neovim server.
  vim.api.nvim_chan_send(job, "e")
  assert(vim.wait(15000, function()
    return vim.uv.fs_realpath(vim.api.nvim_buf_get_name(0)) == vim.uv.fs_realpath(target)
      and vim.api.nvim_get_current_win() ~= terminal.win
  end, 50), "edit did not return to the parent Neovim: " .. vim.api.nvim_buf_get_name(0))
  -- The remote preset can already have closed Snacks' terminal buffer.
  if terminal:buf_valid() then
    vim.api.nvim_chan_send(job, "q")
    assert(vim.wait(5000, function()
      return not terminal:buf_valid() or exit_status ~= nil
    end, 50), "lazygit terminal did not close")
    terminal:close()
  end

  -- The same configuration must reach cwd, log, and file-history entrypoints.
  local captured = {}
  local original_terminal = snacks.terminal
  snacks.terminal = function(cmd, opts)
    captured[#captured + 1] = { cmd = cmd, opts = opts }
    return {}
  end
  snacks.lazygit()
  snacks.lazygit.log({ cwd = root .. "/repo" })
  snacks.lazygit.log_file()
  snacks.terminal = original_terminal
  for _, invocation in ipairs(captured) do
    assert(invocation.opts.env.LG_CONFIG_FILE == configs)
    assert(invocation.opts.configure == false)
  end
  assert(captured[1].opts.cwd == nil, "cwd entrypoint changed")
  assert(captured[2].cmd[2] == "log", "log entrypoint changed")
  assert(captured[3].cmd[2] == "-f"
    and vim.uv.fs_realpath(captured[3].cmd[3]) == vim.uv.fs_realpath(target),
    "file-history entrypoint changed")
  print("Snacks native theme, shared icons, entrypoints and parent editing passed")
end

local ok, error_message = xpcall(check, debug.traceback)
if not ok then
  io.stderr:write(error_message .. "\n")
  vim.cmd("cquit 1")
end
vim.cmd("qa!")
