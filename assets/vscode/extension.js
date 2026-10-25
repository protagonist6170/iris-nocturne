'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const {Background} = require('./background');

// Write only individual Iris-owned colors; preserve other themes and personal edits.
function settings() {
  const config = () => vscode.workspace.getConfiguration();
  return {
    async read(key) {
      if (key.startsWith('color:')) {
        return config().inspect('workbench.colorCustomizations')?.globalValue?.['[Iris Nocturne]']?.[key.slice(6)];
      }
      return config().inspect(key)?.globalValue;
    },
    async write(key, value) {
      if (key.startsWith('color:')) {
        const all = {...config().inspect('workbench.colorCustomizations')?.globalValue};
        const iris = {...all['[Iris Nocturne]']};
        if (value === undefined) delete iris[key.slice(6)];
        else iris[key.slice(6)] = value;
        if (Object.keys(iris).length) all['[Iris Nocturne]'] = iris;
        else delete all['[Iris Nocturne]'];
        await config().update('workbench.colorCustomizations', Object.keys(all).length ? all : undefined, vscode.ConfigurationTarget.Global);
      } else await config().update(key, value, vscode.ConfigurationTarget.Global);
    },
  };
}
function checkOverrides() {
  const config = vscode.workspace.getConfiguration();
  for (const key of ['workbench.colorTheme', 'window.titleBarStyle', 'workbench.colorCustomizations',
    'vscode_custom_css.imports', 'irisNocturne.customCssImports']) {
    const inspected = config.inspect(key);
    if (inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined) {
      throw new Error(`Workspace overrides ${key}. Remove that override before enabling; Iris only changes User settings.`);
    }
  }
}
async function activate(context) {
  let busy = false;
  let queue = Promise.resolve();
  async function manager() {
    const product = JSON.parse(await fs.readFile(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
    if (process.platform !== 'darwin' || product.applicationName !== 'code' || product.quality !== 'stable') {
      throw new Error('Background management supports official macOS VS Code Stable. The solid theme remains available.');
    }
    const workbench = path.join(vscode.env.appRoot, 'out/vs/code/electron-browser/workbench/workbench.html');
    const css = await fs.readFile(context.asAbsolutePath('background/iris-nocturne.css'), 'utf8');
    return new Background({workbench, identity: `${vscode.version}:${product.commit}`,
      profile: context.globalStorageUri.fsPath, storage: context.globalStorageUri.fsPath, css, settings: settings(),
      variables: {execPath: process.env.VSCODE_EXEC_PATH ?? process.execPath,
        workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''}});
  }
  async function reloadMessage(message) {
    const result = await vscode.window.showInformationMessage(
        message + ' This applies to this application; reload other open windows too.', 'Reload Window');
    if (result === 'Reload Window') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
  async function perform(mode, automatic = false) {
    busy = true;
    try {
      const background = await manager();
      let result;
      if (mode === 'enable' || mode === 'reapply') {
        checkOverrides();
        result = await background.apply({reapply: mode === 'reapply'});
      } else result = await background.disable({restore: mode === 'restore'});
      if (result.chooseTheme) await vscode.commands.executeCommand('workbench.action.selectTheme');
      // Tests call this same command with no UI shortcuts: the command result is
      // available before a user chooses whether to reload the window.
      void reloadMessage(result.gradient ? 'Iris gradient enabled. Original CSP retained.' :
        'Iris gradient disabled. Other managed CSS is preserved.');
      return result;
    } catch (error) {
      if (!automatic) void vscode.window.showErrorMessage('Iris Nocturne: ' + error.message);
      else void vscode.window.showWarningMessage('Iris could not disable its gradient: ' + error.message);
      throw error;
    } finally { busy = false; }
  }
  function enqueue(mode, automatic = false) {
    const result = queue.then(() => perform(mode, automatic));
    queue = result.catch(() => {});
    return result;
  }
  for (const [id, mode] of Object.entries({enableGradient: 'enable', disableGradient: 'disable',
    restoreAppearance: 'restore', reapplyBackground: 'reapply'})) {
    context.subscriptions.push(vscode.commands.registerCommand('irisNocturne.' + id, () => enqueue(mode)));
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (!busy && event.affectsConfiguration('workbench.colorTheme') &&
        vscode.workspace.getConfiguration('workbench').get('colorTheme') !== 'Iris Nocturne') {
      void manager().then(async (background) => {
        const state = await background.state();
        if (state?.gradient) await enqueue('disable', true);
      }).catch(() => {});
    }
  }));
  // Startup only inspects state; new installs never patch the application.
  try {
    const background = await manager();
    const state = await background.state();
    const journal = await fs.stat(background.journalFile).then(() => true, () => false);
    if (journal) {
      const action = await vscode.window.showWarningMessage('An Iris background operation was interrupted.', 'Recover');
      if (action === 'Recover') await background.locked(async () => {});
    } else if (state) {
      const html = await fs.readFile(background.workbench, 'utf8');
      const {hash} = require('./background');
      if (state.identity !== background.identity || state.expected !== hash(html)) {
        const action = await vscode.window.showInformationMessage('VS Code or its background changed. Iris has not modified it.', 'Reapply Background');
        if (action === 'Reapply Background') await enqueue('reapply');
      } else if (state.gradient && vscode.workspace.getConfiguration('workbench').get('colorTheme') !== 'Iris Nocturne') {
        await enqueue('disable', true);
      }
    }
  } catch (error) {
    // Unsupported environments still load the theme without startup warnings.
    console.warn('Iris background status:', error.message);
  }
}
exports.activate = activate;
