// Local validation fixture, never included in the distributed theme extension.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// Language servers start asynchronously; inspect their actual token output.
async function readSemanticTokens(document) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const tokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri);
    const legend = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', document.uri);
    if (legend && tokens?.data?.length) return {tokens, legend};
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${document.languageId} language service did not emit semantic tokens`);
}

async function activate(context) {
  const root = process.env.IRIS_VSCODE_VALIDATION_ROOT;
  if (!root) return;
  const canonicalRoot = await fs.realpath(root);
  const appRoot = await fs.realpath(vscode.env.appRoot);
  assert.ok(appRoot.startsWith(canonicalRoot + path.sep), 'Use an isolated application bundle');
  assert.ok(context.globalStorageUri.fsPath.startsWith(path.join(canonicalRoot, 'user-data') + path.sep), 'Use the isolated user-data directory');
  assert.ok(vscode.workspace.workspaceFolders?.length, 'Open the sample workspace');
  assert.ok(vscode.workspace.workspaceFolders.every((folder) => folder.uri.fsPath === path.join(canonicalRoot, 'workspace')), 'Use the sample workspace');
  const workbench = path.join(appRoot, 'out/vs/code/electron-browser/workbench/workbench.html');
  const workspace = path.join(canonicalRoot, 'workspace');
  const results = path.join(canonicalRoot, 'results');
  await fs.mkdir(results, {recursive: true});
  const writeReport = (name, data) => fs.writeFile(
      path.join(results, name + '.json'), JSON.stringify(data, null, 2) + '\n');

  // In these controlled scenarios, explicitly simulate the user's save step.
  // Abort if a new draft is already present or a resource is outside the sandbox.
  async function reviewedCommand(id) {
    let result = await vscode.commands.executeCommand(id);
    if (result.queuedReview) result = await vscode.commands.executeCommand(id);
    if (!result.pendingSave) return result;
    const storage = path.join(path.dirname(context.globalStorageUri.fsPath), 'protagonist.iris-nocturne');
    const journal = JSON.parse(await fs.readFile(path.join(storage, 'background-transaction.json'), 'utf8'));
    for (const entry of journal.review) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(entry.source.uri));
      assert.ok(document.uri.fsPath.startsWith(path.join(canonicalRoot, 'user-data') + path.sep));
      assert.ok((await fs.realpath(document.uri.fsPath)).startsWith(path.join(canonicalRoot, 'user-data') + path.sep));
      assert.equal(document.getText(), entry.after, 'A new user draft must not be saved by validation');
      if (document.isDirty) assert.equal(await document.save(), true);
    }
    return vscode.commands.executeCommand(id);
  }

  async function openCode() {
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await vscode.commands.executeCommand('workbench.action.closeModalEditor');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const cpp = await vscode.workspace.openTextDocument(path.join(workspace, 'scheduler.cpp'));
    await vscode.window.showTextDocument(cpp, {viewColumn: vscode.ViewColumn.One, preview: false});
    const python = await vscode.workspace.openTextDocument(path.join(workspace, 'pipeline.py'));
    await vscode.window.showTextDocument(python, {viewColumn: vscode.ViewColumn.Two, preview: false});
    return {left: cpp.uri.fsPath, right: python.uri.fsPath};
  }

  async function openDiff() {
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    const current = path.join(workspace, 'pipeline.py');
    const previous = path.join(workspace, 'pipeline-before.py');
    const source = await fs.readFile(current, 'utf8');
    await fs.writeFile(previous, source.replace('limit: int = 16', 'limit: int = 8').replace('    @lru_cache(maxsize=32)\n', ''));
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(previous), vscode.Uri.file(current), 'Iris validation diff', {preview: false, viewColumn: vscode.ViewColumn.One});
  }

  async function openWidget(command) {
    await openCode();
    const document = await vscode.workspace.openTextDocument(path.join(workspace, 'RunCard.tsx'));
    const editor = await vscode.window.showTextDocument(document, {viewColumn: vscode.ViewColumn.One});
    const offset = document.getText().indexOf('run.latencyMs') + (command === 'editor.action.showHover' ? 6 : 4);
    const position = document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand(command);
  }

  async function openNotebook() {
    const uri = vscode.Uri.file(path.join(workspace, 'benchmark.ipynb'));
    const notebook = await vscode.workspace.openNotebookDocument(uri);
    await vscode.window.showNotebookDocument(notebook, {preview: false, viewColumn: vscode.ViewColumn.One});
    assert.equal(notebook.notebookType, 'jupyter-notebook');
    assert.ok(notebook.cellCount >= 3);
    await writeReport('notebook', {
      type: notebook.notebookType, cells: notebook.cellCount,
      outputs: notebook.getCells().reduce((count, cell) => count + cell.outputs.length, 0),
    });
    return notebook;
  }

  // One scenario registry serves both the command palette and local automation.
  const scenarios = {
    'irisValidation.code': openCode,
    'irisValidation.notebook': openNotebook,
    'irisValidation.diff': openDiff,
    'irisValidation.hover': () => openWidget('editor.action.showHover'),
    'irisValidation.suggest': () => openWidget('editor.action.triggerSuggest'),
    'irisValidation.find': async () => {
      await openCode();
      await vscode.commands.executeCommand('actions.find');
    },
    'irisValidation.settingsJson': () => vscode.commands.executeCommand('workbench.action.openSettingsJson'),
    'irisValidation.settingsUi': () => vscode.commands.executeCommand('workbench.action.openSettings2'),
    'irisValidation.peek': () => openWidget('editor.action.peekDefinition'),
    'irisValidation.sticky': async () => {
      await openCode();
      const editor = vscode.window.activeTextEditor;
      const position = new vscode.Position(35, 4);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
    },
    'irisValidation.enableBackground': async () => {
      const before = await fs.readFile(workbench, 'utf8');
      await context.globalState.update('originalWorkbenchHash', digest(before));
      const result = await reviewedCommand('irisNocturne.enableGradient');
      assert.ok(!result.cancelled, 'Select Iris Nocturne, then run Enable Background again.');
      const patched = await fs.readFile(workbench, 'utf8');
      assert.ok(patched.includes('IRIS-NOCTURNE:START'));
      assert.ok(patched.includes('Content-Security-Policy'));
      await writeReport('background-manager', {enabled: true, originalCspRetained: true});
      void vscode.commands.executeCommand('workbench.action.reloadWindow').catch(() => {});
    },
    'irisValidation.disableBackground': async () => {
      await reviewedCommand('irisNocturne.restoreAppearance');
      const restored = await fs.readFile(workbench);
      assert.equal(digest(restored), context.globalState.get('originalWorkbenchHash'));
      await writeReport('restoration', {originalWorkbenchRestored: true, themePickerOpened: true});
    },
    'irisValidation.migration': async () => {
      const original = context.globalState.get('originalWorkbenchHash');
      const config = vscode.workspace.getConfiguration();
      assert.equal(config.get('workbench.colorTheme'), 'Iris Nocturne', 'Select Iris before running migration validation.');
      await config.update('irisNocturne.customCssImports', [], vscode.ConfigurationTarget.Global);
      await reviewedCommand('irisNocturne.reapplyBackground');
      await reviewedCommand('irisNocturne.disableGradient');
      assert.equal(digest(await fs.readFile(workbench)), original);
      const storage = path.join(path.dirname(context.globalStorageUri.fsPath), 'protagonist.iris-nocturne');
      await fs.rm(path.join(storage, 'background-state.json'));
      await fs.rm(path.join(path.dirname(workbench), '.iris-nocturne'), {recursive: true, force: true});
      const theme = vscode.extensions.getExtension('protagonist.iris-nocturne');
      const css = vscode.Uri.joinPath(theme.extensionUri, 'background/iris-nocturne.css').toString(true);
      const first = path.join(canonicalRoot, 'first.css');
      const last = path.join(canonicalRoot, 'last.css');
      await fs.writeFile(first, ':root { --iris-validation-first: 1; }');
      await fs.writeFile(last, ':root { --iris-validation-last: 2; }');
      const imports = [vscode.Uri.file(first).toString(true), css, vscode.Uri.file(last).toString(true)];
      await config.update('vscode_custom_css.imports', imports, vscode.ConfigurationTarget.Global);
      await config.update('vscode_custom_css.statusbar', false, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('extension.installCustomCSS');
      assert.ok((await fs.readFile(workbench, 'utf8')).includes('VSCODE-CUSTOM-CSS-START'));
      const result = await reviewedCommand('irisNocturne.enableGradient');
      assert.equal(result.migrated, true);
      const migrated = await fs.readFile(workbench, 'utf8');
      assert.ok(migrated.includes('Content-Security-Policy'));
      assert.ok(!migrated.includes('VSCODE-CUSTOM-CSS-START'));
      assert.ok(migrated.indexOf('--iris-validation-first') < migrated.indexOf('--iris-background'));
      assert.ok(migrated.indexOf('--iris-background') < migrated.indexOf('--iris-validation-last'));
      assert.deepEqual(vscode.workspace.getConfiguration().get('vscode_custom_css.imports'), []);
      await config.update('editor.fontSize', 15, vscode.ConfigurationTarget.Global);
      await config.update('workbench.colorTheme', 'Light Modern', vscode.ConfigurationTarget.Global);
      await reviewedCommand('irisNocturne.disableGradient');
      const disabled = await fs.readFile(workbench, 'utf8');
      assert.ok(!disabled.includes('--iris-background'));
      assert.ok(disabled.includes('--iris-validation-first') && disabled.includes('--iris-validation-last'));
      assert.equal(vscode.workspace.getConfiguration().get('editor.fontSize'), 15);
      assert.equal(vscode.workspace.getConfiguration().get('workbench.colorTheme'), 'Light Modern');
      await config.update('irisNocturne.customCssImports', [], vscode.ConfigurationTarget.Global);
      // This isolated fixture explicitly selects themes for cleanup.
      await config.update('workbench.colorTheme', 'Iris Nocturne', vscode.ConfigurationTarget.Global);
      await reviewedCommand('irisNocturne.reapplyBackground');
      await reviewedCommand('irisNocturne.disableGradient');
      await config.update('workbench.colorTheme', 'Light Modern', vscode.ConfigurationTarget.Global);
      assert.equal(digest(await fs.readFile(workbench)), original);
      assert.equal(vscode.workspace.getConfiguration().get('editor.fontSize'), 15);
      await writeReport('migration', {actualLegacyLoader: true, cssOrderPreserved: true,
        themeSwitchDisablesGradient: true, otherCssRetained: true, personalSettingsPreserved: true,
        completeRestoration: true, originalCspRetained: true});
    },
  };
  context.subscriptions.push(
      ...Object.entries(scenarios).map(([command, run]) => vscode.commands.registerCommand(command, run)),
  );

  // Only this isolated fixture observes the local validation command file.
  const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(canonicalRoot), 'command.json'));
  let lastRequest;
  const runRequested = async () => {
    let request;
    try {
      request = JSON.parse(await fs.readFile(path.join(canonicalRoot, 'command.json'), 'utf8'));
      if (request.id === lastRequest) return;
      lastRequest = request.id;
      assert.ok(typeof request.id === 'string' && request.id.length > 0, 'Use a unique request id');
      assert.ok(Object.hasOwn(scenarios, request.command), 'Only validation scenarios are allowed');
      await vscode.commands.executeCommand(request.command);
      await writeReport('command-result', {id: request.id, command: request.command, success: true});
    } catch (error) {
      await writeReport('command-result', {id: request?.id, success: false, message: String(error)});
    }
  };
  context.subscriptions.push(watcher, watcher.onDidCreate(runRequested), watcher.onDidChange(runRequested));

  try {
    assert.ok(vscode.workspace.isTrusted, 'Trust only the generated isolated sample workspace');
    const extension = vscode.extensions.getExtension('protagonist.iris-nocturne');
    assert.ok(extension, 'Install the actual generated VSIX');
    assert.ok(extension.extensionPath.startsWith(path.join(canonicalRoot, 'extensions') + path.sep), 'Use the isolated extensions directory');
    const manifest = extension.packageJSON;
    assert.equal(manifest.main, './background/extension.js');
    await extension.activate();
    const backgroundUri = vscode.Uri.joinPath(extension.extensionUri, 'background/iris-nocturne.css');
    const backgroundCss = await fs.readFile(backgroundUri.fsPath, 'utf8');
    assert.equal(vscode.workspace.getConfiguration('workbench').get('colorTheme'), 'Iris Nocturne');
    assert.equal(vscode.window.activeColorTheme.kind, vscode.ColorThemeKind.Dark);
    const nativeTheme = JSON.parse(await fs.readFile(path.join(
        extension.extensionPath, 'themes/iris-nocturne-color-theme.json'), 'utf8'));
    assert.equal(nativeTheme.semanticHighlighting, true);
    assert.equal(nativeTheme.colors['terminal.ansiBlue'], '#8ABFFF');
    const languages = await vscode.languages.getLanguages();
    for (const language of ['python', 'cpp', 'typescriptreact']) assert.ok(languages.includes(language));

    const ts = await vscode.workspace.openTextDocument(path.join(workspace, 'RunCard.tsx'));
    await vscode.window.showTextDocument(ts, {preview: false});
    const {tokens: semanticTokens, legend} = await readSemanticTokens(ts);
    const categories = new Set();
    for (let index = 3; index < semanticTokens.data.length; index += 5) {
      categories.add(legend.tokenTypes[semanticTokens.data[index]]);
    }
    assert.ok(categories.has('function'));
    assert.ok(categories.has('parameter'));
    assert.ok(categories.has('property'));
    const languageServices = {};
    for (const [language, filename] of [['python', 'pipeline.py'], ['cpp', 'scheduler.cpp']]) {
      const document = await vscode.workspace.openTextDocument(path.join(workspace, filename));
      await vscode.window.showTextDocument(document, {preview: false});
      const {tokens, legend: tokenLegend} = await readSemanticTokens(document);
      languageServices[language] = {tokens: tokens.data.length / 5, types: tokenLegend.tokenTypes};
    }
    const notebook = await openNotebook();
    await openCode();
    for (const existing of vscode.window.terminals) {
      if (existing.name === 'Iris validation') existing.dispose();
    }
    const terminal = vscode.window.createTerminal({
      name: 'Iris validation', cwd: workspace, shellPath: '/bin/zsh', shellArgs: ['-f'],
      env: {PS1: '❯ ', PROMPT: '❯ ', RPS1: ''},
    });
    terminal.show(true);
    terminal.sendText("printf '\\033[2J\\033[H\\033[38;2;138;191;255mIris Nocturne\\033[0m  ·  isolated validation\\n\\033[48;2;37;72;57m\\033[38;2;176;235;190m PASS \\033[0m  native theme + gradient\\n'", true);
    const html = await fs.readFile(workbench, 'utf8');
    const phase = html.includes('--iris-background') ? 'gradient' : 'solid';
    if (phase === 'gradient') assert.ok(html.includes(backgroundCss), 'Inject the complete bundled CSS');
    await writeReport('native-' + phase, {
      version: vscode.version, appRoot, extensionPath: extension.extensionPath,
      themeVersion: manifest.version, backgroundSource: backgroundUri.fsPath,
      backgroundSha256: digest(backgroundCss),
      theme: manifest.displayName, themeColors: Object.keys(nativeTheme.colors).length,
      semanticCategories: [...categories].sort(), semanticTokenCount: semanticTokens.data.length / 5,
      languageServices,
      notebookCells: notebook.cellCount, languages: ['python', 'cpp', 'typescriptreact'],
      backgroundInjected: phase === 'gradient', originalCspRetained: html.includes('Content-Security-Policy'),
    });
    await fs.rm(path.join(results, 'failure.json'), {force: true});
  } catch (error) {
    await writeReport('failure', {message: String(error), stack: error.stack});
    vscode.window.showErrorMessage('Iris validation failed: ' + error.message);
  }
}

exports.activate = activate;
