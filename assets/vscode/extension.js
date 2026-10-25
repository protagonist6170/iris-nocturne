'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {isDeepStrictEqual: equal} = require('node:util');
const vscode = require('vscode');
const {Background, value: record} = require('./background');
const appearance = require('./managed-appearance.json');

// Index top-level properties for local text edits. JSON.parse validates JSONC
// after comments/trailing commas are masked; offsets still refer to the source.
function settingsText(text) {
  const code = text.replace(/^\uFEFF/, ' ').replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
      (token) => token.startsWith('/') ? token.replace(/[^\r\n]/g, ' ') : token);
  const data = JSON.parse(code.replace(/"(?:\\.|[^"\\])*"|,(?=\s*[}\]])/g,
      (token) => token === ',' ? ' ' : token));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('User settings must be a JSON object.');
  const tokens = [...code.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g)];
  const properties = [];
  for (let i = 1; i < tokens.length - 1;) {
    const start = tokens[i].index;
    const key = JSON.parse(tokens[i][0]);
    const from = tokens[i + 2].index;
    let depth = 0;
    let j = i + 2;
    for (; j < tokens.length; j++) {
      const token = tokens[j][0];
      if (!depth && (token === ',' || token === '}')) break;
      if (token === '{' || token === '[') depth++;
      if (token === '}' || token === ']') depth--;
    }
    const last = tokens[j - 1];
    properties.push({key, start, from, to: last.index + last[0].length,
      comma: tokens[j][0] === ',' ? tokens[j].index : undefined});
    i = j + 1;
  }
  if (new Set(properties.map((property) => property.key)).size !== properties.length) {
    throw new Error('Resolve duplicate keys in User settings before managing the background.');
  }
  return {data, properties, opening: tokens[0].index};
}

// Settings are bound by an explicit file choice, never by editor focus. The
// resource identity travels with each saved field and survives scope changes.
function settings() {
  const bindings = new Map();
  const rootKey = (key) => key.startsWith('color:') ? 'workbench.colorCustomizations' : key;
  const decode = (text) => settingsText(text.replace(/^\uFEFF/, '')).data;
  const read = (data, key) => key.startsWith('color:') ?
    data['workbench.colorCustomizations']?.['[Iris Nocturne]']?.[key.slice(6)] : data[key];
  async function bind(scope, expected) {
    let source = bindings.get(scope);
    if (source && expected && (source.uri !== expected.uri || source.file !== expected.file || source.scope !== expected.scope)) throw new Error('Settings resource changed. Original recovery records were preserved.');
    if (!source) {
      if (expected) source = expected;
      else {
        const selected = await vscode.window.showOpenDialog({
          title: scope === 'application' ? 'Choose Application settings.json (default profile)' : 'Choose User settings.json for this profile',
          canSelectMany: false, canSelectFiles: true, canSelectFolders: false,
          filters: {'Settings JSON': ['json']},
        });
        if (!selected?.length) throw new Error('Settings selection cancelled. Nothing was applied.');
        const uri = selected[0].with({scheme: 'vscode-userdata'});
        source = {scope, uri: uri.toString(), file: await fs.realpath(uri.fsPath)};
      }
    }
    const uri = vscode.Uri.parse(source.uri);
    if (source.scope !== scope || uri.scheme !== 'vscode-userdata' || uri.authority ||
        path.basename(uri.path) !== 'settings.json' || await fs.realpath(uri.fsPath) !== source.file) {
      throw new Error('Settings resource identity could not be verified. Nothing was overwritten.');
    }
    bindings.set(scope, source);
    return source;
  }
  async function scopeFor(key) {
    const application = await bind('application');
    const data = decode(await fs.readFile(application.file, 'utf8'));
    const shared = data['workbench.settings.applyToAllProfiles'];
    return rootKey(key) === 'window.titleBarStyle' || (Array.isArray(shared) && shared.includes(rootKey(key))) ? 'application' : 'profile';
  }
  async function sourceFor(key, expected) {
    const scope = await scopeFor(key);
    if (expected && expected.scope !== scope) throw new Error(`Settings scope changed for ${key}. Restore its original scope before retrying; recovery records were preserved.`);
    return bind(scope, expected);
  }
  async function documentFor(source) {
    await bind(source.scope, source);
    return vscode.workspace.openTextDocument(vscode.Uri.parse(source.uri));
  }
  function patch(text, key, value) {
    const {data, properties, opening} = settingsText(text);
    if (key.startsWith('color:')) {
      const all = {...data['workbench.colorCustomizations']};
      const iris = {...all['[Iris Nocturne]']};
      if (value === undefined) delete iris[key.slice(6)]; else iris[key.slice(6)] = value;
      if (Object.keys(iris).length) all['[Iris Nocturne]'] = iris; else delete all['[Iris Nocturne]'];
      key = 'workbench.colorCustomizations';
      value = Object.keys(all).length ? all : undefined;
    }
    const index = properties.findIndex((property) => property.key === key);
    const property = properties[index];
    if (property && value === undefined) {
      const comma = property.comma ?? properties[index - 1]?.comma;
      const edits = [{from: property.start, to: property.to}];
      if (comma !== undefined) edits.push({from: comma, to: comma + 1});
      for (const {from, to} of edits.sort((a, b) => b.from - a.from)) text = text.slice(0, from) + text.slice(to);
    } else if (property) {
      const indent = text.slice(0, property.start).split('\n').at(-1).match(/^\s*/)[0];
      text = text.slice(0, property.from) + JSON.stringify(value, null, 2).replace(/\n/g, '\n' + indent) + text.slice(property.to);
    } else if (value !== undefined) {
      text = text.slice(0, opening + 1) +
        `\n  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}${properties.length ? ',' : ''}\n` + text.slice(opening + 1);
    }
    return text;
  }
  return {
    async validate(changes, sources = []) {
      // Bind recorded identities before reading routing flags from application settings.
      for (const source of sources) await bind(source.scope, source);
      for (const change of changes) {
        if (!change.source) throw new Error('Older settings records have no resource identity. Manual reconciliation is required.');
        await bind(change.source.scope, change.source);
      }
      for (const change of changes) await sourceFor(change.key, change.source);
    },
    async snapshot(inputs, unsavedResources = []) {
      await this.validate(inputs.filter((entry) => entry.source));
      const fields = [];
      for (const {key, source} of inputs) fields.push({key, source: await sourceFor(key, source)});
      const documents = new Map();
      for (const source of [...bindings.values(), ...fields.map((entry) => entry.source)]) {
        if (documents.has(source.uri)) continue;
        const document = await documentFor(source);
        documents.set(source.uri, {source, before: document.getText(), version: document.version});
      }
      if ([...documents.keys()].some((uri) => unsavedResources.includes(uri))) {
        throw new Error('Settings had an unsaved draft when this command was requested. Save or undo your edits and Retry with a new command.');
      }
      const snapshot = {documents: [...documents.values()], fields};
      await this.plan([], fields, snapshot);
      // Every decision, including skipping restoration, reads these same texts.
      snapshot.fields = fields.map(({key, source}) => ({key, source,
        before: record(read(decode(documents.get(source.uri).before), key))}));
      return snapshot;
    },
    async plan(changes, inputs, snapshot) {
      await this.validate(inputs);
      // Include application routing metadata in the same version-checked edit.
      const documents = new Map(snapshot.documents.map((entry) => [entry.source.uri, {...entry, after: entry.before}]));
      const opened = [];
      for (const entry of documents.values()) {
        const document = await documentFor(entry.source);
        const disk = (await fs.readFile(entry.source.file, 'utf8')).replace(/^\uFEFF/, '');
        if (disk !== entry.before) throw new Error('Setting changed or has an unsaved draft. Save or undo your settings edits and Retry.');
        opened.push([document, entry]);
      }
      // Validate all observations together after IO, even if the delta is empty.
      for (const [document, entry] of opened) {
        if (document.isClosed || document.isDirty || document.version !== entry.version || document.getText() !== entry.before) {
          throw new Error('Setting changed or has an unsaved draft. Save or undo your settings edits and Retry.');
        }
      }
      for (const change of changes) {
        const entry = documents.get(change.source.uri);
        entry.after = patch(entry.after, change.key, change.after.exists ? change.after.value : undefined);
      }
      return [...documents.values()];
    },
    async stage(review) {
      // VS Code reports an entirely empty WorkspaceEdit as unapplied.
      if (!review.length) return true;
      const documents = await Promise.all(review.map((entry) => documentFor(entry.source)));
      const edit = new vscode.WorkspaceEdit();
      for (let i = 0; i < review.length; i++) {
        const {before, after} = review[i];
        const document = documents[i];
        if (document.isClosed || document.isDirty || document.version !== review[i].version || document.getText() !== before) return false;
        let from = 0;
        while (from < before.length && from < after.length && before[from] === after[from]) from++;
        let tail = 0;
        while (tail < before.length - from && tail < after.length - from && before.at(-tail - 1) === after.at(-tail - 1)) tail++;
        // Metadata keeps an unchanged edit's version constraint when the native
        // active-editor worker would otherwise minimize it away.
        const metadata = before === after ? {label: 'Validate Iris settings'} : undefined;
        edit.replace(document.uri, new vscode.Range(document.positionAt(from), document.positionAt(before.length - tail)), after.slice(from, after.length - tail), metadata);
      }
      // No await from snapshot validation to RPC submission; there is no save RPC.
      return vscode.workspace.applyEdit(edit);
    },
    async saved(review, changes, side) {
      const contents = new Map();
      const opened = [];
      for (const entry of review) {
        const document = await documentFor(entry.source);
        if (document.isClosed || document.isDirty) return false;
        const version = document.version;
        const text = document.getText();
        const disk = (await fs.readFile(entry.source.file, 'utf8')).replace(/^\uFEFF/, '');
        opened.push({document, version, text, disk});
        contents.set(entry.source.uri, decode(disk));
      }
      // A later resource's IO must not invalidate an earlier saved observation.
      for (const {document, version, text, disk} of opened) {
        if (document.isClosed || document.isDirty || document.version !== version || document.getText() !== text || text !== disk) return false;
      }
      for (const change of changes) {
        if (!equal(record(read(contents.get(change.source.uri), change.key)), change[side])) {
          if (side === 'before') return false;
          throw new Error(`Setting changed after review: ${change.key}. Original records were preserved. Undo the reviewed edits and save before starting another command.`);
        }
      }
      return true;
    },
  };
}
function checkOverrides() {
  const config = vscode.workspace.getConfiguration();
  for (const key of ['workbench.colorTheme', ...Object.keys(appearance),
    'vscode_custom_css.imports', 'irisNocturne.customCssImports']) {
    const inspected = config.inspect(key);
    if (inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined) {
      throw new Error(`Workspace overrides ${key}. Remove that override before enabling; Iris only changes User settings.`);
    }
  }
}
async function activate(context) {
  let queue = Promise.resolve();
  let background;
  const currentTheme = () => vscode.workspace.getConfiguration('workbench').get('colorTheme');
  async function manager() {
    if (background) return background;
    const product = JSON.parse(await fs.readFile(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
    if (process.platform !== 'darwin' || product.applicationName !== 'code' || product.quality !== 'stable') {
      throw new Error('Background management supports official macOS VS Code Stable. The solid theme remains available.');
    }
    const workbench = path.join(vscode.env.appRoot, 'out/vs/code/electron-browser/workbench/workbench.html');
    const css = await fs.readFile(context.asAbsolutePath('background/iris-nocturne.css'), 'utf8');
    background = new Background({workbench, identity: `${vscode.version}:${product.commit}`,
      profile: context.globalStorageUri.fsPath, storage: context.globalStorageUri.fsPath, css, settings: settings(),
      variables: {execPath: process.env.VSCODE_EXEC_PATH ?? process.execPath,
        workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''}});
    return background;
  }
  function enqueue(run) {
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  }
  async function reloadMessage(message) {
    const result = await vscode.window.showInformationMessage(
        message + ' This applies to this application; reload other open windows too.', 'Reload Window');
    if (result === 'Reload Window') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
  async function reviewMessage(result) {
    for (const resource of result.resources) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(resource));
      await vscode.window.showTextDocument(document, {preview: false});
    }
    const command = {enable: 'Enable Gradient', reapply: 'Reapply Background', disable: 'Disable Gradient'}[result.intent];
    void vscode.window.showInformationMessage(`Review and manually save the settings files, then run Iris Nocturne: ${command} again. This review has not committed the background.`);
  }
  // The native theme is authoritative; background operations never write it.
  async function synchronize(background, unsavedResources = []) {
    if (currentTheme() === 'Iris Nocturne') return;
    const status = await background.inspect();
    if (currentTheme() !== 'Iris Nocturne' && status.gradient) return background.disable({unsavedResources});
  }
  function checkTheme() {
    const result = enqueue(async () => {
      let background;
      try { background = await manager(); } catch {
        // Unsupported hosts keep their native theme without background warnings.
        return;
      }
      return synchronize(background);
    });
    void result.then((changed) => {
      if (changed?.pendingSave) return reviewMessage(changed);
      if (changed) return reloadMessage('Iris gradient disabled. Other managed CSS is preserved.');
    }).catch((error) => {
      void vscode.window.showWarningMessage('Iris could not disable its gradient: ' + error.message);
    });
    return result;
  }
  async function perform(mode) {
    const requestedReview = background?.reviewRevision ?? 0;
    // Capture before the queue or any IO: a later Save cannot admit this request.
    const unsavedResources = vscode.workspace.textDocuments.filter((document) => document.isDirty)
        .map((document) => document.uri.toString());
    try {
      const enabling = mode === 'enable' || mode === 'reapply';
      // Theme selection is a separate step; this invocation never resumes enabling.
      if (enabling && currentTheme() !== 'Iris Nocturne') {
        await vscode.commands.executeCommand('workbench.action.selectTheme');
        return {cancelled: true};
      }
      const result = await enqueue(async () => {
        if (enabling && currentTheme() !== 'Iris Nocturne') return {cancelled: true};
        const background = await manager();
        // Only a review completed after this request makes it stale. Read-only
        // tasks ahead of a fresh re-run do not change the review revision.
        if (requestedReview !== background.reviewRevision && (await background.inspect()).status === 'recovery') {
          return {cancelled: true, queuedReview: true};
        }
        let changed;
        let operationError;
        try {
          if (enabling) {
            checkOverrides();
            changed = await background.apply({reapply: mode === 'reapply', unsavedResources});
          } else changed = await background.disable({unsavedResources});
        } catch (error) {
          operationError = error;
        }
        try {
          const synchronized = changed?.pendingSave ? undefined : await synchronize(background, unsavedResources);
          if (changed && synchronized) changed = {...changed, ...synchronized};
        } catch (error) {
          if (operationError) {
            throw new AggregateError([operationError, error],
                `${operationError.message} Theme reconciliation failed: ${error.message}`,
                {cause: operationError});
          }
          throw error;
        }
        if (operationError) throw operationError;
        return changed;
      });
      if (result.cancelled) {
        if (result.queuedReview) void vscode.window.showInformationMessage('That command was queued before the settings review finished. Save the reviewed files and run the command again.');
        return result;
      }
      if (result.pendingSave) {
        await reviewMessage(result);
        return result;
      }
      if (mode === 'restore') await vscode.commands.executeCommand('workbench.action.selectTheme');
      // Tests call this same command with no UI shortcuts: the command result is
      // available before a user chooses whether to reload the window.
      void reloadMessage(result.gradient ? 'Iris gradient enabled. Original CSP retained.' :
        'Iris gradient disabled. Other managed CSS is preserved.');
      return result;
    } catch (error) {
      void vscode.window.showErrorMessage('Iris Nocturne: ' + error.message);
      throw error;
    }
  }
  for (const [id, mode] of Object.entries({enableGradient: 'enable', disableGradient: 'disable',
    restoreAppearance: 'restore', reapplyBackground: 'reapply'})) {
    context.subscriptions.push(vscode.commands.registerCommand('irisNocturne.' + id, () => perform(mode)));
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('workbench.colorTheme')) {
      void checkTheme();
    }
  }));
  // Startup only inspects state; new installs never patch the application.
  try {
    const status = await enqueue(async () => (await manager()).inspect());
    if (status.status === 'recovery') {
      const action = await vscode.window.showWarningMessage('An Iris background operation was interrupted.', 'Recover');
      if (action === 'Recover') {
        try {
          await enqueue(async () => (await manager()).recover());
          await checkTheme();
        } catch (error) {
          await vscode.window.showErrorMessage('Iris Nocturne: ' + error.message);
        }
      }
    } else if (status.status === 'changed') {
      const action = await vscode.window.showInformationMessage('VS Code or its background changed. Iris has not modified it.', 'Reapply Background');
      if (action === 'Reapply Background') await perform('reapply');
    } else if (status.gradient && currentTheme() !== 'Iris Nocturne') {
      await checkTheme();
    }
  } catch (error) {
    // Unsupported environments still load the theme without startup warnings.
    console.warn('Iris background status:', error.message);
  }
}
exports.activate = activate;
