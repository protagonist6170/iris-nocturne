'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {writeFileSync} = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {Background, hash} = require('../assets/vscode/background');
const {failRenames} = require('./helpers/filesystem.cjs');
const appearance = require('../assets/vscode/managed-appearance.json');

const BASE = '<html><head><meta http-equiv="Content-Security-Policy" content="style-src self unsafe-inline"/></head><body>original</body></html>';
const ENTRY = path.resolve(__dirname, '../assets/vscode/extension.js');
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return {promise, resolve};
}
// Pause a specific filesystem boundary once; never depend on internal read counts.
function pauseFileIO(t, method, filename) {
  const entered = deferred();
  const resume = deferred();
  const original = fs[method];
  let paused = false;
  fs[method] = async (...args) => {
    if (!paused && args[method === 'rename' ? 1 : 0] === filename) {
      paused = true;
      entered.resolve();
      await resume.promise;
    }
    return original(...args);
  };
  t.after(() => { fs[method] = original; resume.resolve(); });
  return {entered: entered.promise, resume: () => resume.resolve()};
}
// Fixture input is trusted JSONC, parsed independently of the production indexer.
const parse = (text) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + text + ')')));
class Uri {
  constructor(scheme, pathname) { this.scheme = scheme; this.path = pathname; this.fsPath = pathname; this.authority = ''; }
  static parse(value) { const url = new URL(value); return new Uri(url.protocol.slice(0, -1), decodeURIComponent(url.pathname)); }
  with({scheme = this.scheme}) { return new Uri(scheme, this.path); }
  toString() { return this.scheme + '://' + encodeURI(this.path); }
}
async function fixture(t, theme = 'Iris Nocturne') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'iris-extension-test-')));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const workbench = path.join(root, 'out/vs/code/electron-browser/workbench/workbench.html');
  await fs.mkdir(path.dirname(workbench), {recursive: true});
  await fs.writeFile(workbench, BASE);
  await fs.writeFile(path.join(root, 'product.json'), JSON.stringify({applicationName: 'code', quality: 'stable', commit: 'test'}));
  const css = path.join(root, 'background.css');
  await fs.writeFile(css, '.monaco-workbench { --iris-background: blue; }');
  const config = new Map();
  const documents = new Map();
  const commands = new Map();
  const listeners = new Set();
  const messages = [];
  const responses = new Map();
  let gate;
  let preparation;
  let profileOpen;
  let picker;
  let pickerCount = 0;
  let selectionCount = 0;
  let application;
  let active;
  function createDocument(filename, text) {
    const uri = new Uri('vscode-userdata', filename);
    const document = {uri, languageId: 'jsonc', isClosed: false, isDirty: false, version: 1,
      text, disk: text,
      getText() { return this.text; },
      positionAt(offset) {
        const lines = this.text.slice(0, offset).split('\n');
        return {line: lines.length - 1, character: lines.at(-1).length};
      },
      save() { return assert.fail('The extension must never save settings drafts'); },
    };
    documents.set(uri.toString(), document);
    return document;
  }
  let profile = createDocument(path.join(root, 'profile/settings.json'), JSON.stringify({'workbench.colorTheme': theme}, null, 2));
  application = profile;
  await fs.mkdir(path.dirname(profile.uri.path), {recursive: true});
  await fs.writeFile(profile.uri.path, profile.disk);
  function deliverConfiguration() {
    const user = parse(profile.disk);
    const app = parse(application.disk);
    const shared = app['workbench.settings.applyToAllProfiles'] ?? [];
    const next = {...user, 'window.titleBarStyle': app['window.titleBarStyle'],
      'workbench.settings.applyToAllProfiles': app['workbench.settings.applyToAllProfiles']};
    for (const key of shared) next[key] = app[key];
    const before = new Map(config);
    config.clear();
    for (const [key, value] of Object.entries(next)) if (value !== undefined) config.set(key, value);
    for (const key of new Set([...before.keys(), ...config.keys()])) {
      if (JSON.stringify(before.get(key)) !== JSON.stringify(config.get(key))) {
        for (const listener of listeners) listener({affectsConfiguration: (name) => name === key});
      }
    }
  }
  function edit(document, text) {
    document.text = text;
    document.version++;
    document.isDirty = text !== document.disk;
  }
  function save(document, notify = true) {
    document.disk = document.text;
    writeFileSync(document.uri.fsPath, document.disk);
    document.isDirty = false;
    if (notify) deliverConfiguration();
  }
  function setSavedSetting(key, value) {
    const app = parse(application.disk);
    const scope = key === 'window.titleBarStyle' || key === 'workbench.settings.applyToAllProfiles' ||
      (app['workbench.settings.applyToAllProfiles'] ?? []).includes(key) ? application : profile;
    const data = parse(scope.text);
    if (value === undefined) delete data[key]; else data[key] = value;
    edit(scope, JSON.stringify(data, null, 2));
    save(scope);
  }
  deliverConfiguration();
  function openDocument(uri) {
    let document = documents.get(uri.toString());
    assert.ok(document, 'Open only explicitly bound resources');
    if (document.isClosed) {
      const previous = document;
      document = createDocument(previous.uri.fsPath, previous.disk);
      if (application === previous) application = document;
      if (profile === previous) profile = document;
    }
    return document;
  }
  const host = {
    Uri,
    Range: class { constructor(start, end) { Object.assign(this, {start, end}); } },
    WorkspaceEdit: class {
      entries = [];
      replace(uri, range, value, metadata) { this.entries.push({uri, range, value, metadata}); }
    },
    env: {appRoot: root}, version: 'test',
    workspace: {
      get textDocuments() { return [...documents.values()].filter((document) => !document.isClosed); },
      getConfiguration: (section) => ({
        get: (key, fallback) => config.get(section ? section + '.' + key : key) ?? fallback,
        inspect: (key) => ({globalValue: config.get(key)}),
        update: () => assert.fail('Use versioned document edits'),
      }),
      openTextDocument: async (uri) => {
        const document = openDocument(uri);
        const paused = profileOpen;
        if (paused && document === application) paused.applicationOpened.resolve();
        if (paused && document === profile) {
          await paused.applicationOpened.promise;
          profileOpen = undefined;
          paused.entered.resolve();
          await paused.resume.promise;
        }
        return document;
      },
      applyEdit: async (workspaceEdit) => {
        const targets = new Map();
        const changed = new Set();
        // Serialization takes versions from the current model by URI, rather
        // than from any old TextDocument reference held by the extension.
        for (const {uri, range, value, metadata} of workspaceEdit.entries) {
          const document = documents.get(uri.toString());
          let target = targets.get(document);
          if (!target) {
            target = {version: document.version, text: document.text, edits: []};
            targets.set(document, target);
          }
          const offset = (position) => target.text.split('\n').slice(0, position.line)
              .reduce((sum, line) => sum + line.length + 1, 0) + position.character;
          target.edits.push({from: offset(range.start), to: offset(range.end), value, metadata});
        }
        for (const [document, target] of targets) {
          // Native active-editor preparation minimizes unannotated edits. An
          // empty edit disappears before addEdit can retain its final version
          // constraint. Metadata retains that constraint without changing text.
          target.validateVersion = document !== active?.document ||
            target.edits.some(({from, to, value, metadata}) => metadata || from !== to || value !== '');
          target.edits = target.edits.filter(({from, to, value}) => from !== to || value !== '');
          for (const {from, to, value} of target.edits.sort((a, b) => b.from - a.from)) {
            target.text = target.text.slice(0, from) + value + target.text.slice(to);
          }
          const before = parse(document.text);
          const after = parse(target.text);
          for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.add(key);
          }
        }
        assert.ok(!changed.has('workbench.colorTheme'));
        const preparing = preparation;
        preparation = undefined;
        if (preparing) { preparing.entered.resolve(); await preparing.resume.promise; }
        const paused = changed.has(gate?.key) ? gate : undefined;
        if (paused) gate = undefined;
        if (paused && !paused.afterWrite) { paused.entered.resolve(); await paused.resume.promise; }
        if ([...targets].some(([document, target]) => target.validateVersion &&
            documents.get(document.uri.toString()).version !== target.version)) return false;
        for (const [document, target] of targets) if (target.edits.length && document.text !== target.text) edit(document, target.text);
        if (paused?.afterWrite) { paused.entered.resolve(); await paused.resume.promise; }
        if (paused?.fail) throw new Error('settings edit failed');
        // Native success depends on the original edit count, even if all were minimized away.
        return workspaceEdit.entries.length > 0;
      },
      onDidChangeConfiguration: (listener) => { listeners.add(listener); return {dispose: () => listeners.delete(listener)}; },
    },
    commands: {
      registerCommand: (id, run) => { commands.set(id, run); return {dispose() {}}; },
      executeCommand: async (id) => {
        if (id === 'workbench.action.openSettingsJson' || id === 'workbench.action.openApplicationSettingsJson') {
          assert.fail('Settings identity must not depend on a native command or focus');
        }
        if (id !== 'workbench.action.selectTheme') return commands.get(id)?.();
        pickerCount++;
        if (picker) { const pending = picker; picker = undefined; pending.entered.resolve(); await pending.closed.promise; }
        else { const theme = responses.has('theme') ? responses.get('theme') : 'Iris Nocturne'; if (theme) setSavedSetting('workbench.colorTheme', theme); }
      },
    },
    window: {
      get activeTextEditor() { return active; },
      showTextDocument: async (document) => { active = {document}; return active; },
      showOpenDialog: async (options) => {
        selectionCount++;
        const document = options.title.includes('Application') ? application : profile;
        return responses.get('selection') === null ? undefined : [document.uri.with({scheme: 'file'})];
      },
      showInformationMessage: async (message) => { messages.push(message); },
      showWarningMessage: async (message, action) => { messages.push(message); return responses.get(action); },
      showErrorMessage: async (message) => { messages.push(message); },
    },
  };
  const context = {globalStorageUri: {fsPath: path.join(root, 'storage')}, asAbsolutePath: () => css, subscriptions: []};
  const localRequire = createRequire(ENTRY);
  const exports = {};
  const activate = async () => {
    for (const subscription of context.subscriptions.splice(0)) subscription.dispose();
    vm.runInNewContext(await fs.readFile(ENTRY, 'utf8'), {
      exports, require: (name) => name === 'vscode' ? host : localRequire(name),
      JSON, process: {platform: 'darwin', env: {}, execPath: process.execPath}, console,
    }, {filename: ENTRY});
    await exports.activate(context);
  };
  const background = new Background({workbench, identity: 'test:test', profile: context.globalStorageUri.fsPath, storage: context.globalStorageUri.fsPath});
  const command = (id) => commands.get('irisNocturne.' + id)();
  return {
    root, config: {get: (key) => config.get(key), has: (key) => config.has(key)},
    messages, responses, background, workbench, settingsFile: profile.uri.fsPath,
    get document() { return profile; },
    activate, command, deliverConfiguration, setSavedSetting,
    editDocument: edit,
    saveSettings({notify = true} = {}) {
      for (const document of new Set([application, profile])) {
        if (document.isDirty) save(document, false);
      }
      if (notify) deliverConfiguration();
    },
    async complete(id) { const result = await command(id); if (!result.pendingSave) return result; this.saveSettings(); return command(id); },
    selectTheme: (theme) => setSavedSetting('workbench.colorTheme', theme),
    get pickerCount() { return pickerCount; },
    get selectionCount() { return selectionCount; },
    focusSettings(document) { active = {document}; },
    reopenSettings(document, text = document.disk) {
      assert.equal(document.isDirty, false, 'Close a clean document before reopening');
      document.isClosed = true;
      document.isDirty = false;
      const next = openDocument(document.uri);
      if (text !== next.disk) edit(next, text);
      active = {document: next};
      return next;
    },
    pauseEditPreparation() {
      preparation = {entered: deferred(), resume: deferred()};
      const paused = preparation;
      t.after(() => paused.resume.resolve());
      return {entered: paused.entered.promise, resume: () => paused.resume.resolve()};
    },
    pauseProfileOpenAfterApplication() {
      assert.notEqual(application, profile);
      profileOpen = {applicationOpened: deferred(), entered: deferred(), resume: deferred()};
      const paused = profileOpen;
      t.after(() => { profileOpen = undefined; paused.resume.resolve(); });
      return {entered: paused.entered.promise, resume: () => paused.resume.resolve()};
    },
    async separateApplicationSettings(initialText = '{"window.titleBarStyle":"native"}') {
      const filename = path.join(root, 'application/settings.json');
      await fs.mkdir(path.dirname(filename), {recursive: true});
      application = createDocument(filename, initialText);
      await fs.writeFile(filename, application.disk);
      deliverConfiguration();
      return application;
    },
    focusOtherSettings: async () => {
      const document = createDocument(path.join(root, 'unrelated/settings.json'), '{"personal":42}');
      await fs.mkdir(path.dirname(document.uri.path), {recursive: true});
      await fs.writeFile(document.uri.path, document.disk);
      active = {document}; return document;
    },
    pausePicker() {
      picker = {entered: deferred(), closed: deferred()}; const pending = picker;
      t.after(() => pending.closed.resolve());
      return {entered: pending.entered.promise, close: () => pending.closed.resolve()};
    },
    pauseUpdate(key, options = {}) {
      gate = {key, ...options, entered: deferred(), resume: deferred()}; const paused = gate;
      t.after(() => paused.resume.resolve());
      return {entered: paused.entered.promise, resume: () => paused.resume.resolve()};
    },
  };
}

test('startup is read-only and theme selection remains a separate command', async (t) => {
  const f = await fixture(t, 'Dark Modern');
  await f.activate();
  assert.equal(f.selectionCount, 0);
  assert.equal(f.pickerCount, 0);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  await assert.rejects(fs.stat(f.background.storage), /ENOENT/);
  assert.equal((await f.command('enableGradient')).cancelled, true);
  assert.equal(f.pickerCount, 1);
  assert.equal(f.selectionCount, 0);
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  f.saveSettings();
  assert.equal((await f.command('enableGradient')).gradient, true);
});

test('cancelled and slow theme pickers never resume an old Enable', async (t) => {
  const f = await fixture(t, 'Dark Modern');
  await f.activate();
  f.responses.set('theme', null);
  assert.equal((await f.command('enableGradient')).cancelled, true);
  const picker = f.pausePicker();
  const enabling = f.command('enableGradient');
  await picker.entered;
  await f.command('restoreAppearance');
  picker.close();
  assert.equal((await enabling).cancelled, true);
  f.selectTheme('Iris Nocturne');
  await new Promise(setImmediate);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(f.selectionCount, 0);
});

test('draft, disk and effective configuration advance at separate explicit boundaries', async (t) => {
  const f = await fixture(t);
  await f.activate();
  const disk = await fs.readFile(f.settingsFile, 'utf8');
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  assert.equal(f.document.isDirty, true);
  assert.equal(parse(f.document.getText())['window.titleBarStyle'], 'custom');
  assert.equal(await fs.readFile(f.settingsFile, 'utf8'), disk);
  assert.equal(f.config.has('window.titleBarStyle'), false);
  f.saveSettings({notify: false});
  assert.equal(f.document.isDirty, false);
  assert.equal(f.config.has('window.titleBarStyle'), false);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  f.deliverConfiguration();
  assert.equal(f.config.get('window.titleBarStyle'), 'custom');
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE, 'Save/configuration events cannot resume Enable');
  assert.equal((await f.command('enableGradient')).gradient, true);
});

test('a draft entered after application is never automatically saved or committed', async (t) => {
  const f = await fixture(t);
  await f.activate();
  const originalDisk = await fs.readFile(f.settingsFile, 'utf8');
  const gate = f.pauseUpdate('window.titleBarStyle', {afterWrite: true});
  const enabling = f.command('enableGradient');
  await gate.entered;
  f.editDocument(f.document, f.document.getText().replace('{', '{\n"personalDraft":"not ready",'));
  gate.resume();
  assert.equal((await enabling).pendingSave, true);
  assert.equal(f.document.isDirty, true);
  assert.equal(await fs.readFile(f.settingsFile, 'utf8'), originalDisk);
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  f.saveSettings();
  assert.equal((await f.command('enableGradient')).gradient, true);
  assert.equal(f.config.get('personalDraft'), 'not ready');
});

test('an unsaved draft present before a command is preserved without starting a transaction', async (t) => {
  const f = await fixture(t);
  f.editDocument(f.document, '// unfinished\n' + f.document.getText());
  const text = f.document.getText();
  const disk = await fs.readFile(f.settingsFile, 'utf8');
  await f.activate();
  await assert.rejects(f.command('enableGradient'), /unsaved draft.*Retry/);
  assert.equal(f.document.getText(), text);
  assert.equal(await fs.readFile(f.settingsFile, 'utf8'), disk);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
});

test('Restore and later theme events cannot wake an Enable waiting for manual save', async (t) => {
  const f = await fixture(t);
  await f.activate();
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  await assert.rejects(f.command('restoreAppearance'), /No earlier command was resumed/);
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
  assert.equal(f.pickerCount, 0);
  f.saveSettings();
  await assert.rejects(f.command('restoreAppearance'), /No earlier command was resumed/);
  f.selectTheme('Light Modern');
  await new Promise(setImmediate);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});

test('undoing and saving a reviewed draft lets a different command safely discard the old plan', async (t) => {
  const f = await fixture(t);
  await f.activate();
  const before = f.document.getText();
  await f.command('enableGradient');
  f.editDocument(f.document, before);
  f.saveSettings();
  assert.equal((await f.command('disableGradient')).gradient, false);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});

test('version rejection is atomic across application and profile documents', async (t) => {
  const f = await fixture(t);
  const app = await f.separateApplicationSettings();
  await f.activate();
  const appBefore = app.getText();
  const gate = f.pauseUpdate('workbench.colorCustomizations');
  const operation = f.command('enableGradient');
  const rejected = assert.rejects(operation, /Setting changed.*Retry/);
  await gate.entered;
  f.editDocument(f.document, '// latest\n' + f.document.getText());
  gate.resume();
  await rejected;
  assert.equal(app.getText(), appBefore);
  assert.ok(f.document.getText().startsWith('// latest'));
  assert.equal(parse(f.document.getText())['workbench.colorCustomizations'], undefined);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
});

test('a delayed Restore preserves managed and other-theme edits made before application', async (t) => {
  const f = await fixture(t);
  f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
  await f.activate(); await f.complete('enableGradient');
  const gate = f.pauseUpdate('workbench.colorCustomizations');
  const restoring = f.command('restoreAppearance');
  const rejected = assert.rejects(restoring, /Setting changed.*Retry/);
  await gate.entered;
  const colors = structuredClone(f.config.get('workbench.colorCustomizations'));
  colors['[Iris Nocturne]']['terminal.background'] = '#abcdef';
  colors['[Another Theme]'] = {'editor.background': '#112233'};
  f.setSavedSetting('workbench.colorCustomizations', colors);
  gate.resume(); await rejected;
  assert.deepEqual(f.config.get('workbench.colorCustomizations'), colors);
  assert.equal(f.pickerCount, 0);
  await f.complete('disableGradient');
  assert.deepEqual(f.config.get('workbench.colorCustomizations'), {
    '[Iris Nocturne]': {'terminal.background': '#abcdef'},
    '[Another Theme]': {'editor.background': '#112233'},
  });
});

test('focus on another settings.json cannot redirect explicitly selected resources', async (t) => {
  const f = await fixture(t);
  await f.separateApplicationSettings();
  const other = await f.focusOtherSettings();
  const original = other.text;
  await f.activate();
  await f.complete('enableGradient');
  assert.equal(other.text, original);
  assert.equal(await fs.readFile(other.uri.fsPath, 'utf8'), original);
  assert.equal(f.config.get('window.titleBarStyle'), 'custom');
  assert.ok(f.config.get('workbench.colorCustomizations')['[Iris Nocturne]']);
});

test('scope changes stop recovery instead of restoring profile values into shared application settings', async (t) => {
  const f = await fixture(t);
  f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
  const app = await f.separateApplicationSettings(
    '{"window.titleBarStyle":"native","workbench.colorCustomizations":{"[Iris Nocturne]":{"terminal.background":"#00000000"}}}'
  );
  await f.activate(); await f.complete('enableGradient');
  f.editDocument(app, JSON.stringify({...parse(app.text), 'workbench.settings.applyToAllProfiles': ['workbench.colorCustomizations']}));
  f.saveSettings({notify: false});
  assert.equal(f.config.has('workbench.settings.applyToAllProfiles'), false, 'configuration delivery remains delayed');
  const disk = app.disk;
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  await assert.rejects(f.command('disableGradient'), /Settings scope changed/);
  assert.equal(app.disk, disk);
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
  assert.equal(parse(app.disk)['workbench.colorCustomizations']['[Iris Nocturne]']['terminal.background'], '#00000000');
});

for (const edit of [undefined, '#abcdef']) {
  test(`Reapply restores ${edit ? 'the latest personal value' : 'the original value'} after manual reviews`, async (t) => {
    const f = await fixture(t);
    f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
    await f.activate(); await f.complete('enableGradient');
    if (edit) {
      const colors = structuredClone(f.config.get('workbench.colorCustomizations'));
      colors['[Iris Nocturne]']['terminal.background'] = edit;
      f.setSavedSetting('workbench.colorCustomizations', colors);
    }
    await f.complete('reapplyBackground');
    await f.complete('disableGradient');
    assert.deepEqual(f.config.get('workbench.colorCustomizations'), {'[Iris Nocturne]': {'terminal.background': edit ?? '#123456'}});
  });
}

test('JSONC local edits preserve unrelated text, comments, escaped keys and trailing commas', async (t) => {
  const f = await fixture(t);
  const untouched = '"personal": {"url":"https://example.test/x,//y", "array":[1,{"quoted":"} ] ,"},],},';
  f.editDocument(f.document, `// profile\n{\n /* comment */ ${untouched}\n "workbench.colorTheme":"Iris Nocturne",\n "window.\\u0074itleBarStyle" /* title */ : "native",\n "workbench.colorCustomizations":{"[Other Theme]":{"editor.background":"#112233"},},\n}`);
  f.saveSettings();
  await f.activate(); await f.complete('enableGradient'); await f.complete('disableGradient');
  assert.ok(f.document.text.includes(untouched));
  assert.ok(f.document.text.includes('"window.\\u0074itleBarStyle" /* title */ : "native"'));
  assert.ok(f.document.text.startsWith('// profile'));
  assert.deepEqual(f.config.get('workbench.colorCustomizations'), {'[Other Theme]': {'editor.background': '#112233'}});
});

for (const titleBar of [undefined, 'custom']) {
test(`restarting binds recorded resources when application settings ${titleBar ? 'needed no edit' : 'were edited'}`, async (t) => {
  const f = await fixture(t);
  if (titleBar) f.setSavedSetting('window.titleBarStyle', titleBar);
  await f.activate(); await f.command('enableGradient');
  f.saveSettings();
  const selections = f.selectionCount;
  await f.activate();
  await f.command('enableGradient');
  assert.equal(f.selectionCount, selections);
  assert.deepEqual(await f.background.inspect(), {status: 'ready', gradient: true});
});
}

test('a retargeted settings file fails identity validation without touching its new target', async (t) => {
  const f = await fixture(t); await f.activate(); await f.complete('enableGradient');
  const other = await f.focusOtherSettings();
  const original = other.disk;
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  await fs.rename(f.settingsFile, f.settingsFile + '.original');
  await fs.symlink(other.uri.fsPath, f.settingsFile);
  await assert.rejects(f.command('disableGradient'), /resource identity could not be verified/);
  assert.equal(await fs.readFile(other.uri.fsPath, 'utf8'), original);
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
});

test('idle theme reconciliation stages a review without claiming the background is disabled', async (t) => {
  const f = await fixture(t); await f.activate(); await f.complete('enableGradient');
  f.messages.length = 0;
  f.selectTheme('Light Modern');
  // A request queued before that review finished cannot serve as the re-run.
  assert.equal((await f.command('disableGradient')).cancelled, true);
  assert.equal((await f.command('disableGradient')).pendingSave, true);
  assert.ok(f.messages.some((message) => message.includes('Disable Gradient again')));
  assert.ok(!f.messages.some((message) => message.startsWith('Iris gradient disabled.')));
  assert.ok((await fs.readFile(f.workbench, 'utf8')).includes('--iris-background'));
  f.saveSettings();
  await f.command('disableGradient');
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(f.config.get('workbench.colorTheme'), 'Light Modern');
});

test('startup Recover reports a manual review and cannot commit an earlier Enable', async (t) => {
  const f = await fixture(t);
  await f.activate(); await f.command('enableGradient'); f.saveSettings();
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  f.responses.set('Recover', 'Recover');
  await f.activate();
  assert.ok(f.messages.some((message) => message.includes('No earlier command was resumed')));
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});

test('an uncertain edit preserves drafts and rejects every automatic or explicit continuation', async (t) => {
  const f = await fixture(t); await f.activate();
  const gate = f.pauseUpdate('window.titleBarStyle', {afterWrite: true, fail: true});
  const operation = f.command('enableGradient');
  const rejected = assert.rejects(operation, /settings edit failed/);
  await gate.entered;
  f.editDocument(f.document, '// user draft\n' + f.document.text);
  gate.resume(); await rejected;
  const text = f.document.text;
  const disk = await fs.readFile(f.settingsFile, 'utf8');
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  await assert.rejects(f.command('enableGradient'), /Cannot confirm/);
  await assert.rejects(f.command('disableGradient'), /Cannot confirm/);
  assert.equal(f.document.text, text);
  assert.equal(await fs.readFile(f.settingsFile, 'utf8'), disk);
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
});

test('a later file-commit failure preserves saved user settings and original backups for retry', async (t) => {
  const f = await fixture(t); f.setSavedSetting('window.titleBarStyle', 'native');
  await f.activate(); await f.command('enableGradient'); f.saveSettings();
  const disk = f.document.disk;
  failRenames(t, {destination: f.background.stateFile, message: 'state denied'});
  await assert.rejects(f.command('enableGradient'), /state denied/);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(f.document.disk, disk);
  assert.equal((await f.command('enableGradient')).gradient, true);
  await f.complete('disableGradient');
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
});

test('an Enable queued before manual save cannot commit the old review when it wakes', async (t) => {
  const f = await fixture(t); await f.activate();
  const gate = f.pauseUpdate('window.titleBarStyle', {afterWrite: true});
  const first = f.command('enableGradient');
  await gate.entered;
  const queued = f.command('enableGradient');
  f.saveSettings();
  gate.resume();
  assert.equal((await first).pendingSave, true);
  assert.equal((await queued).cancelled, true);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal((await f.command('enableGradient')).gradient, true);
});

test('older backups without a resource identity stop before editing any setting', async (t) => {
  const f = await fixture(t); await f.activate(); await f.complete('enableGradient');
  const state = await f.background.state();
  delete state.saved[0].source;
  const record = JSON.stringify(state);
  await fs.writeFile(f.background.stateFile, record);
  const text = f.document.text;
  const disk = f.document.disk;
  await assert.rejects(f.command('disableGradient'), /Older settings records have no resource identity/);
  assert.equal(f.document.text, text);
  assert.equal(f.document.disk, disk);
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), record);
});

test('zero-change Disable rejects an unsaved draft without losing the original backups', async (t) => {
  const f = await fixture(t);
  f.setSavedSetting('window.titleBarStyle', 'native');
  f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
  await f.activate(); await f.complete('enableGradient');
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  const html = await fs.readFile(f.workbench, 'utf8');
  const disk = f.document.disk;
  const draft = parse(f.document.text);
  delete draft['window.titleBarStyle'];
  delete draft['workbench.colorCustomizations'];
  f.editDocument(f.document, JSON.stringify(draft));
  const text = f.document.text;
  await assert.rejects(f.command('disableGradient'), /unsaved draft.*Retry/);
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), html);
  assert.equal(f.document.disk, disk);
  assert.equal(f.document.text, text);
  assert.equal(f.document.isDirty, true);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  f.editDocument(f.document, disk); f.saveSettings();
  await f.complete('disableGradient');
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
  assert.deepEqual(f.config.get('workbench.colorCustomizations'), {'[Iris Nocturne]': {'terminal.background': '#123456'}});
});

test('zero-change Enable requires saved resources even when its draft already has every target value', async (t) => {
  const f = await fixture(t); await f.activate();
  const disk = f.document.disk;
  f.editDocument(f.document, JSON.stringify({'workbench.colorTheme': 'Iris Nocturne', ...appearance}));
  const text = f.document.text;
  await assert.rejects(f.command('enableGradient'), /unsaved draft.*Retry/);
  assert.equal(f.document.disk, disk);
  assert.equal(f.document.text, text);
  assert.equal(f.document.isDirty, true);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  f.saveSettings();
  assert.equal((await f.command('enableGradient')).gradient, true);
  // Nothing needs changing or saving when the original values were all targets.
  assert.equal((await f.command('disableGradient')).gradient, false);
  assert.equal(f.document.isDirty, false);
});

test('re-running a review validates the scope of managed fields that needed no edit', async (t) => {
  const f = await fixture(t);
  f.setSavedSetting('workbench.colorCustomizations', appearance['workbench.colorCustomizations']);
  const app = await f.separateApplicationSettings(JSON.stringify({'window.titleBarStyle': 'native',
    'workbench.colorCustomizations': {'[Iris Nocturne]': {'terminal.background': '#abcdef'}}}));
  await f.activate();
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  assert.deepEqual(JSON.parse(journal).changes.map((change) => change.key), ['window.titleBarStyle']);
  f.saveSettings();
  f.editDocument(app, JSON.stringify({...parse(app.text), 'workbench.settings.applyToAllProfiles': ['workbench.colorCustomizations']}));
  f.saveSettings({notify: false});
  const appDisk = app.disk;
  const profileDisk = f.document.disk;
  await assert.rejects(f.command('enableGradient'), /Settings scope changed/);
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
  await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(app.disk, appDisk);
  assert.equal(f.document.disk, profileDisk);
  assert.equal(parse(appDisk)['workbench.colorCustomizations']['[Iris Nocturne]']['terminal.background'], '#abcdef');
});

test('a fresh command after manual save is not rejected by read-only theme checks ahead of it', async (t) => {
  const f = await fixture(t); await f.activate();
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  f.saveSettings();
  f.selectTheme('Light Modern');
  f.selectTheme('Iris Nocturne');
  assert.equal((await f.command('enableGradient')).gradient, true);
  assert.ok(!f.messages.some((message) => message.startsWith('That command was queued before')));
});

for (const delta of ['empty', 'nonempty']) {
  test(`${delta} delta rejects an actual edit and Undo after planning even with identical text`, {timeout: 5000}, async (t) => {
    const f = await fixture(t); await f.activate();
    if (delta === 'empty') {
      for (const [key, value] of Object.entries(appearance)) f.setSavedSetting(key, value);
    }
    const text = f.document.disk;
    const gate = pauseFileIO(t, 'rename', f.background.journalFile);
    const enabling = assert.rejects(f.command('enableGradient'), /Setting changed.*Retry/);
    await gate.entered;
    const version = f.document.version;
    f.editDocument(f.document, '// transient user draft\n' + text);
    assert.equal(f.document.isDirty, true);
    f.editDocument(f.document, text);
    assert.equal(f.document.text, text);
    assert.equal(f.document.isDirty, false);
    assert.equal(f.document.version, version + 2, 'edit and Undo must both have occurred');
    gate.resume(); await enabling;
    assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
    await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
    await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
    assert.equal(f.document.disk, text);
    assert.equal((await f.complete('enableGradient')).gradient, true);
  });
}

test('zero-delta Disable retains backups when skipped fields change after planning', {timeout: 5000}, async (t) => {
  const f = await fixture(t);
  f.setSavedSetting('window.titleBarStyle', 'native');
  f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
  await f.activate(); await f.complete('enableGradient');
  const iris = f.document.disk;
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  const html = await fs.readFile(f.workbench, 'utf8');
  // All six saved user values differ from Iris, so this plan has no changes.
  f.setSavedSetting('window.titleBarStyle', 'native');
  f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#abcdef'}});
  const gate = pauseFileIO(t, 'rename', f.background.journalFile);
  const disabling = assert.rejects(f.command('disableGradient'), /Setting changed.*Retry/);
  await gate.entered;
  const version = f.document.version;
  f.editDocument(f.document, iris); f.saveSettings();
  assert.equal(f.document.text, iris);
  assert.equal(f.document.version, version + 1, 'Undo must change the observed version');
  assert.equal(f.document.isDirty, false);
  gate.resume(); await disabling;
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), html);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  await f.complete('disableGradient');
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
  assert.deepEqual(f.config.get('workbench.colorCustomizations'), {'[Iris Nocturne]': {'terminal.background': '#123456'}});
});

test('Save cannot admit a previously unsaved Enable when no journal exists', {timeout: 5000}, async (t) => {
  const f = await fixture(t); await f.activate();
  f.editDocument(f.document, JSON.stringify({'workbench.colorTheme': 'Iris Nocturne', ...appearance}));
  const gate = pauseFileIO(t, 'readFile', f.background.journalFile);
  const enabling = assert.rejects(f.command('enableGradient'), /unsaved draft.*Retry/);
  await gate.entered;
  assert.equal(f.document.isDirty, true);
  f.saveSettings();
  const disk = f.document.disk;
  gate.resume(); await enabling;
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(f.document.disk, disk);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
  assert.equal((await f.command('enableGradient')).gradient, true);
});

test('Restore requested before Save cannot proceed after an earlier Enable consumes its review', {timeout: 5000}, async (t) => {
  const f = await fixture(t); await f.activate();
  await f.command('enableGradient'); f.saveSettings();
  const gate = pauseFileIO(t, 'readFile', f.background.journalFile);
  const enabling = f.command('enableGradient');
  await gate.entered;
  f.editDocument(f.document, '// personal draft\n' + f.document.text);
  const restoring = assert.rejects(f.command('restoreAppearance'), /unsaved draft.*Retry/);
  f.saveSettings();
  const disk = f.document.disk;
  gate.resume();
  assert.equal((await enabling).gradient, true);
  await restoring;
  assert.equal(f.document.text, disk);
  assert.equal(f.document.isDirty, false);
  assert.equal(f.pickerCount, 0);
  assert.equal((await f.background.inspect()).gradient, true);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  await f.complete('restoreAppearance');
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});

for (const edit of ['saved managed value', 'unsaved draft']) {
  test(`saved review rechecks application settings after profile IO: ${edit}`, {timeout: 5000}, async (t) => {
    const f = await fixture(t);
    const app = await f.separateApplicationSettings();
    await f.activate(); await f.command('enableGradient'); f.saveSettings();
    const journal = await fs.readFile(f.background.journalFile, 'utf8');
    const gate = pauseFileIO(t, 'readFile', f.settingsFile);
    const enabling = f.command('enableGradient');
    await gate.entered;
    const version = app.version;
    if (edit === 'saved managed value') f.setSavedSetting('window.titleBarStyle', 'native');
    else {
      f.editDocument(app, '// later application draft\n' + app.text);
    }
    assert.equal(app.version, version + 1);
    const text = app.text;
    const disk = app.disk;
    gate.resume();
    assert.equal((await enabling).pendingSave, true);
    assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
    assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
    await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
    assert.equal(app.text, text);
    assert.equal(app.disk, disk);
    assert.equal(app.isDirty, edit === 'unsaved draft');
    if (edit === 'saved managed value') {
      await assert.rejects(f.command('enableGradient'), /Setting changed after review/);
      f.setSavedSetting('window.titleBarStyle', 'custom');
    } else { f.editDocument(app, disk); }
    assert.equal((await f.command('enableGradient')).gradient, true);
    await f.complete('disableGradient');
    assert.equal(f.config.get('window.titleBarStyle'), 'native');
  });
}

test('Save cannot admit Enable or Restore requested while an existing review was unsaved', {timeout: 5000}, async (t) => {
  const f = await fixture(t); await f.activate();
  assert.equal((await f.command('enableGradient')).pendingSave, true);
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  const gate = pauseFileIO(t, 'readFile', f.background.journalFile);
  const enable = f.command('enableGradient');
  await gate.entered;
  const restore = assert.rejects(f.command('restoreAppearance'), /No earlier command was resumed/);
  f.saveSettings();
  const disk = f.document.disk;
  gate.resume();
  assert.equal((await enable).pendingSave, true);
  await restore;
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
  await assert.rejects(fs.stat(f.background.stateFile), /ENOENT/);
  assert.equal(f.document.disk, disk);
  assert.equal(f.document.isDirty, false);
  assert.equal(f.pickerCount, 0);
  assert.equal((await f.command('enableGradient')).gradient, true);
  await f.complete('restoreAppearance');
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});

for (const unchanged of ['all settings', 'application routing settings']) {
  test(`native edit preparation retains the version of unchanged ${unchanged}`, {timeout: 5000}, async (t) => {
    const f = await fixture(t);
    f.setSavedSetting('window.titleBarStyle', 'native');
    f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#123456'}});
    const app = unchanged === 'application routing settings' ? await f.separateApplicationSettings() : f.document;
    await f.activate(); await f.complete('enableGradient');
    const iris = f.document.disk;
    const state = await fs.readFile(f.background.stateFile, 'utf8');
    const html = await fs.readFile(f.workbench, 'utf8');
    f.setSavedSetting('window.titleBarStyle', 'native');
    if (unchanged === 'all settings') {
      f.setSavedSetting('workbench.colorCustomizations', {'[Iris Nocturne]': {'terminal.background': '#abcdef'}});
    }
    f.focusSettings(app);
    const gate = f.pauseEditPreparation();
    const disabling = assert.rejects(f.command('disableGradient'), /Setting changed.*Retry/);
    await gate.entered;
    const version = app.version;
    if (unchanged === 'all settings') { f.editDocument(f.document, iris); f.saveSettings(); }
    else f.setSavedSetting('window.titleBarStyle', 'custom');
    assert.equal(app.version, version + 1, 'the active model must change during native preparation');
    assert.equal(app.isDirty, false);
    const text = app.text;
    gate.resume(); await disabling;
    assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
    assert.equal(await fs.readFile(f.workbench, 'utf8'), html);
    assert.equal(app.text, text);
    assert.equal(app.isDirty, false);
    assert.equal(f.document.text, f.document.disk, 'other resources must not receive a partial edit');
    await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
    await f.complete('disableGradient');
    assert.equal(f.config.get('window.titleBarStyle'), 'native');
    assert.deepEqual(f.config.get('workbench.colorCustomizations'), {'[Iris Nocturne]': {'terminal.background': '#123456'}});
  });
}

test('planning rejects a closed document even when the reopened model has identical text and version', {timeout: 5000}, async (t) => {
  const f = await fixture(t);
  const app = await f.separateApplicationSettings();
  await f.activate();
  const gate = pauseFileIO(t, 'readFile', f.settingsFile);
  const enabling = assert.rejects(f.command('enableGradient'), /Setting changed.*Retry/);
  await gate.entered;
  const next = f.reopenSettings(app);
  assert.equal(app.isClosed, true);
  assert.notEqual(next, app);
  assert.equal(next.version, app.version);
  assert.equal(next.text, app.text);
  gate.resume(); await enabling;
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  assert.equal((await f.complete('enableGradient')).gradient, true);
});

test('staging preserves a reopened application draft instead of editing through the closed model', {timeout: 5000}, async (t) => {
  const f = await fixture(t);
  const app = await f.separateApplicationSettings();
  await f.activate();
  const journal = pauseFileIO(t, 'rename', f.background.journalFile);
  const enabling = assert.rejects(f.command('enableGradient'), /Setting changed.*Retry/);
  await journal.entered;
  const opening = f.pauseProfileOpenAfterApplication();
  journal.resume(); await opening.entered;
  const text = JSON.stringify({'window.titleBarStyle': 'latest'});
  const next = f.reopenSettings(app, text);
  assert.equal(app.isClosed, true);
  assert.equal(app.isDirty, false);
  assert.notEqual(next, app);
  assert.equal(next.uri.toString(), app.uri.toString());
  assert.equal(next.isDirty, true);
  const disk = next.disk;
  opening.resume(); await enabling;
  assert.equal(next.text, text);
  assert.equal(next.disk, disk);
  assert.equal(next.isDirty, true);
  assert.equal(f.document.text, f.document.disk);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  await assert.rejects(fs.stat(f.background.journalFile), /ENOENT/);
  f.saveSettings();
  await f.complete('enableGradient'); await f.complete('disableGradient');
  assert.equal(f.config.get('window.titleBarStyle'), 'latest');
});

test('saved review rejects a closed application model while preserving its reopened draft', {timeout: 5000}, async (t) => {
  const f = await fixture(t);
  const app = await f.separateApplicationSettings();
  await f.activate(); await f.command('enableGradient'); f.saveSettings();
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  const gate = pauseFileIO(t, 'readFile', f.settingsFile);
  const enabling = f.command('enableGradient');
  await gate.entered;
  const text = JSON.stringify({'window.titleBarStyle': 'latest'});
  const next = f.reopenSettings(app, text);
  assert.equal(app.isClosed, true);
  assert.notEqual(next, app);
  const disk = next.disk;
  gate.resume();
  assert.equal((await enabling).pendingSave, true);
  assert.equal(next.text, text);
  assert.equal(next.disk, disk);
  assert.equal(next.isDirty, true);
  assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
  // Undo the new draft, then a fresh command may finish the saved review.
  f.editDocument(next, disk);
  assert.equal((await f.command('enableGradient')).gradient, true);
  await f.complete('disableGradient');
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
});

test('Disable after restart needs no empty WorkspaceEdit for already restored settings', async (t) => {
  const f = await fixture(t); await f.activate();
  await f.complete('enableGradient'); await f.complete('disableGradient');
  await f.activate();
  const selections = f.selectionCount;
  assert.equal((await f.command('disableGradient')).gradient, false);
  assert.equal(f.selectionCount, selections);
  assert.equal(await fs.readFile(f.workbench, 'utf8'), BASE);
});
