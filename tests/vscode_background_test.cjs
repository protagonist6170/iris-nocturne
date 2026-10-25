'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {isDeepStrictEqual: equal} = require('node:util');
const {pathToFileURL} = require('node:url');
const {Background, hash, value} = require('../assets/vscode/background');
const appearance = require('../assets/vscode/managed-appearance.json');
const irisColorKeys = Object.keys(appearance['workbench.colorCustomizations']['[Iris Nocturne]']);

const BASE = '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src self; style-src self unsafe-inline"/></head><body>original</body></html>';
async function fixture(t, entries = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'iris-background-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'workbench.html');
  await fs.writeFile(file, BASE);
  const config = new Map(Object.entries({'workbench.colorTheme': 'Iris Nocturne', 'personal': 42, ...entries}));
  const source = {scope: 'test', uri: 'map:settings', file: 'map:settings'};
  const settings = {
    validate: async (changes) => {
      if (changes.some((change) => !equal(change.source, source))) throw new Error('Settings resource changed');
    },
    async snapshot(inputs) {
      await this.validate(inputs.filter((entry) => entry.source));
      return {documents: [{source, before: [...config]}],
        fields: inputs.map(({key}) => ({key, source, before: value(config.get(key))}))};
    },
    async plan(changes, inputs, snapshot) {
      await this.validate(inputs);
      if (!equal([...config], snapshot.documents[0].before)) throw new Error('Setting changed. Retry.');
      const next = new Map(snapshot.documents[0].before);
      for (const change of changes) {
        if (change.after.exists) next.set(change.key, change.after.value); else next.delete(change.key);
      }
      return [{source, before: snapshot.documents[0].before, after: [...next]}];
    },
    async stage(review) {
      if (!equal([...config], review[0].before)) return false;
      config.clear(); for (const [key, entry] of review[0].after) config.set(key, entry);
      return true;
    },
    async saved(review, changes, side) {
      const matches = changes.every((change) => equal(value(config.get(change.key)), change[side]));
      if (!matches && side === 'after') throw new Error('Setting changed after review');
      return matches;
    },
  };
  const options = {workbench: file, identity: '1.143.1:one', profile: path.join(root, 'profile'), storage: path.join(root, 'profile/storage'),
    css: '.monaco-workbench { --iris-background: blue; }', settings};
  return {root, file, config, settings, options, background: new Background(options)};
}

async function complete(background, method, options) {
  const result = await background[method](options);
  return result.pendingSave ? background[method](options) : result;
}

test('inspection is read-only and reports unmanaged, ready and changed applications', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.background.inspect(), {status: 'unmanaged'});
  await assert.rejects(fs.stat(f.background.storage), /ENOENT/);
  await assert.rejects(fs.stat(f.background.directory), /ENOENT/);
  await complete(f.background, 'apply');
  assert.deepEqual(await f.background.inspect(), {status: 'ready', gradient: true});
  const next = new Background({...f.options, identity: 'next'});
  assert.deepEqual(await next.inspect(), {status: 'changed', gradient: true});
  await fs.appendFile(f.file, 'external');
  const html = await fs.readFile(f.file, 'utf8');
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  assert.deepEqual(await f.background.inspect(), {status: 'changed', gradient: true});
  assert.equal(await fs.readFile(f.file, 'utf8'), html);
  assert.equal(await fs.readFile(f.background.stateFile, 'utf8'), state);
});

test('enable is idempotent; disable preserves edits and original HTML', async (t) => {
  const f = await fixture(t, {'color:terminal.background': '#123456'});
  await complete(f.background, 'apply');
  const first = await fs.readFile(f.file, 'utf8');
  assert.ok(first.includes('--iris-background'));
  assert.ok(first.includes('Content-Security-Policy'));
  await complete(f.background, 'apply');
  assert.equal(await fs.readFile(f.file, 'utf8'), first);
  f.config.set('personal', 100);
  f.config.set('color:minimap.background', '#edited');
  await complete(f.background, 'disable');
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
  assert.equal(f.config.get('color:terminal.background'), '#123456');
  assert.equal(f.config.get('color:minimap.background'), '#edited');
  assert.equal(f.config.get('workbench.colorTheme'), 'Iris Nocturne');
  await complete(f.background, 'disable');
  assert.equal(f.config.get('workbench.colorTheme'), 'Iris Nocturne');
  assert.equal(f.config.get('personal'), 100);
  f.config.set('workbench.colorTheme', 'Light Modern');
  await complete(f.background, 'apply');
  await complete(f.background, 'disable');
  assert.equal(f.config.get('workbench.colorTheme'), 'Light Modern');
  assert.equal(f.config.has('window.titleBarStyle'), false);
});

test('restoration rejects edits made after checking a field and supports retry', async (t) => {
  const key = 'color:terminal.background';
  const f = await fixture(t, {[key]: '#123456'});
  await complete(f.background, 'apply');
  const snapshot = f.settings.snapshot;
  f.settings.snapshot = async (inputs) => {
    const result = await snapshot.call(f.settings, inputs);
    f.config.set(key, '#abcdef');
    f.settings.snapshot = snapshot;
    return result;
  };
  await assert.rejects(f.background.disable(), /Setting changed.*Retry/);
  assert.equal(f.config.get(key), '#abcdef');
  assert.equal(f.config.get('window.titleBarStyle'), 'custom');
  assert.deepEqual(await f.background.inspect(), {status: 'ready', gradient: true});
  await complete(f.background, 'disable');
  assert.equal(f.config.get(key), '#abcdef');
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
});

test('legacy migration preserves CSS order and removes only Iris when disabling', async (t) => {
  const f = await fixture(t);
  const extension = path.join(f.root, 'extensions', 'protagonist.iris-nocturne-0.1.0');
  await fs.mkdir(path.join(extension, 'background'), {recursive: true});
  await fs.writeFile(path.join(extension, 'package.json'), JSON.stringify({publisher: 'protagonist', name: 'iris-nocturne'}));
  const before = path.join(f.root, 'before.css');
  const after = path.join(f.root, 'after.css');
  await fs.writeFile(before, ':root { --before: 1; }');
  await fs.writeFile(after, ':root { --after: 2; }');
  const imports = [before, path.join(extension, 'background/iris-nocturne.css'), after].map((file) => pathToFileURL(file).href);
  f.config.set('vscode_custom_css.imports', imports);
  for (const key of irisColorKeys) f.config.set('color:' + key, '#00000000');
  const uuid = 'abc123-abcd';
  const backup = path.join(f.root, `workbench.${uuid}.bak-custom-css`);
  const unrelatedBackup = path.join(f.root, 'workbench.other.bak-custom-css');
  await fs.writeFile(backup, BASE);
  await fs.writeFile(unrelatedBackup, 'unrelated');
  await fs.writeFile(f.file, BASE.replace('</head>', `<!-- !! VSCODE-CUSTOM-CSS-SESSION-ID ${uuid} !! --><!-- !! VSCODE-CUSTOM-CSS-START !! --><style>old</style><!-- !! VSCODE-CUSTOM-CSS-END !! --></head>`));
  assert.equal((await complete(f.background, 'apply')).migrated, true);
  await assert.rejects(fs.stat(backup), /ENOENT/);
  assert.equal(await fs.readFile(unrelatedBackup, 'utf8'), 'unrelated');
  const html = await fs.readFile(f.file, 'utf8');
  assert.ok(html.indexOf('--before') < html.indexOf('--iris-background'));
  assert.ok(html.indexOf('--iris-background') < html.indexOf('--after'));
  assert.deepEqual(f.config.get('vscode_custom_css.imports'), []);
  assert.deepEqual(f.config.get('irisNocturne.customCssImports'), [imports[0], imports[2]]);
  f.config.set('workbench.colorTheme', 'Light Modern');
  await complete(f.background, 'disable');
  const disabled = await fs.readFile(f.file, 'utf8');
  assert.ok(disabled.includes('--before') && disabled.includes('--after'));
  assert.ok(!disabled.includes('--iris-background'));
  assert.equal(f.config.get('workbench.colorTheme'), 'Light Modern');
  assert.ok(irisColorKeys.every((key) => !f.config.has('color:' + key)));
});

test('JS, missing CSS and missing legacy backup fail without changing application or settings', async (t) => {
  for (const source of ['file:///missing.js', 'file:///missing.css']) {
    const f = await fixture(t, {'vscode_custom_css.imports': [source]});
    const snapshot = [...f.config];
    await assert.rejects(f.background.apply());
    assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
    assert.deepEqual([...f.config], snapshot);
  }
  const malicious = await fixture(t);
  const css = path.join(malicious.root, 'external.css');
  await fs.writeFile(css, '</style/><script>bad()</script>');
  malicious.config.set('vscode_custom_css.imports', [pathToFileURL(css).href]);
  await assert.rejects(malicious.background.apply(), /closing style/);
  assert.equal(await fs.readFile(malicious.file, 'utf8'), BASE);
  const f = await fixture(t);
  const legacy = BASE.replace('</head>', '<!-- !! VSCODE-CUSTOM-CSS-SESSION-ID abc-def !! --><!-- !! VSCODE-CUSTOM-CSS-START !! --><style>old</style><!-- !! VSCODE-CUSTOM-CSS-END !! --></head>');
  await fs.writeFile(f.file, legacy);
  await assert.rejects(f.background.apply(), /ENOENT/);
  assert.equal(await fs.readFile(f.file, 'utf8'), legacy);
});

test('version changes require explicit reapply and never restore the old application HTML', async (t) => {
  const f = await fixture(t);
  await complete(f.background, 'apply');
  await fs.rm(f.background.directory, {recursive: true});
  const updated = BASE.replace('original', 'new version');
  await fs.writeFile(f.file, updated);
  const next = new Background({...f.options, identity: '1.144.0:two'});
  await assert.rejects(next.apply(), /Reapply/);
  await complete(next, 'apply', {reapply: true});
  await complete(next, 'disable');
  assert.equal(await fs.readFile(f.file, 'utf8'), updated);
  await fs.writeFile(f.file, updated + 'external edit');
  await assert.rejects(next.apply(), /modified outside/);
  assert.equal(await fs.readFile(f.file, 'utf8'), updated + 'external edit');
});

test('interrupted transactions recover conditionally; an active application lock prevents writes', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(f.background.directory, {recursive: true});
  await fs.mkdir(f.background.storage, {recursive: true});
  const changed = BASE + '\n';
  await fs.writeFile(f.file, changed);
  f.config.set('workbench.colorTheme', 'Iris Nocturne');
  await fs.writeFile(f.background.journalFile, JSON.stringify({identity: f.options.identity,
    profile: f.options.profile, beforeHtml: BASE, afterHash: hash(changed), changes: [{key: 'workbench.colorTheme',
      before: {exists: true, value: 'Dark Modern'}, after: {exists: true, value: 'Iris Nocturne'}}]}));
  assert.deepEqual(await f.background.inspect(), {status: 'recovery'});
  assert.equal(await fs.readFile(f.file, 'utf8'), changed);
  await f.background.recover();
  assert.deepEqual(await f.background.inspect(), {status: 'unmanaged'});
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
  assert.equal(f.config.get('workbench.colorTheme'), 'Iris Nocturne');
  await fs.mkdir(path.join(f.background.directory, 'lock'));
  await fs.writeFile(path.join(f.background.directory, 'lock/owner.json'), JSON.stringify({pid: process.pid}));
  await assert.rejects(f.background.recover(), /Another Iris operation/);
  await assert.rejects(f.background.apply(), /Another Iris operation/);
});

test('an unstarted review whose first progress checkpoint failed can be safely discarded', async (t) => {
  const f = await fixture(t);
  const before = [...f.config];
  const rename = fs.rename;
  let denied = false;
  fs.rename = async (from, to) => {
    if (to === f.background.journalFile && !denied) {
      const journal = JSON.parse(await fs.readFile(from, 'utf8'));
      if (journal.changes.every((change) => change.progress === 'writing')) {
        denied = true; throw new Error('start checkpoint denied');
      }
    }
    return rename(from, to);
  };
  t.after(() => { fs.rename = rename; });
  await assert.rejects(f.background.apply(), /start checkpoint denied/);
  assert.deepEqual([...f.config], before);
  await f.background.recover();
  assert.deepEqual([...f.config], before);
  assert.deepEqual(await f.background.inspect(), {status: 'unmanaged'});
});

test('failure to persist edit completion preserves the scene and blocks later recovery', async (t) => {
  const f = await fixture(t, {'window.titleBarStyle': 'native'});
  const rename = fs.rename;
  let denied = false;
  fs.rename = async (from, to) => {
    if (to === f.background.journalFile && !denied) {
      const journal = JSON.parse(await fs.readFile(from, 'utf8'));
      if (journal.changes.every((change) => change.progress === 'written')) {
        denied = true; throw new Error('completion checkpoint denied');
      }
    }
    return rename(from, to);
  };
  t.after(() => { fs.rename = rename; });
  await assert.rejects(f.background.apply(), /completion checkpoint denied/);
  f.config.set('window.titleBarStyle', 'native');
  const snapshot = [...f.config];
  const journal = await fs.readFile(f.background.journalFile, 'utf8');
  const restarted = new Background(f.options);
  for (const run of [() => restarted.recover(), () => restarted.apply(), () => restarted.disable()]) {
    await assert.rejects(run(), /Cannot confirm/);
    assert.deepEqual([...f.config], snapshot);
    assert.equal(await fs.readFile(f.background.journalFile, 'utf8'), journal);
    assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
  }
});

test('an edit that applied and then rejected remains uncertain without undoing a user value', async (t) => {
  const f = await fixture(t, {'window.titleBarStyle': 'native'});
  const stage = f.settings.stage;
  f.settings.stage = async (review) => { await stage(review); throw new Error('edit result lost'); };
  await assert.rejects(f.background.apply(), /edit result lost/);
  f.config.set('window.titleBarStyle', 'native');
  const snapshot = [...f.config];
  await assert.rejects(f.background.recover(), /Cannot confirm/);
  assert.deepEqual([...f.config], snapshot);
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
});

test('partial file rollback retries never replay a settings undo or overwrite a later personal value', async (t) => {
  const f = await fixture(t, {'window.titleBarStyle': 'native', 'color:terminal.background': '#123456'});
  await complete(f.background, 'apply');
  await f.background.disable();
  const rename = fs.rename;
  let failures = 0;
  fs.rename = async (from, to) => {
    if (to === f.background.stateFile && failures < 2) {
      failures++; throw new Error('state commit and rollback denied');
    }
    return rename(from, to);
  };
  t.after(() => { fs.rename = rename; });
  await assert.rejects(f.background.disable(), /Recovery is incomplete/);
  const journal = JSON.parse(await fs.readFile(f.background.journalFile, 'utf8'));
  assert.equal(journal.rollback.html, true);
  assert.equal(journal.rollback.state, false);
  f.config.set('color:terminal.background', '#abcdef');
  const snapshot = [...f.config];
  await assert.rejects(new Background(f.options).disable(), /Setting changed after review/);
  assert.deepEqual([...f.config], snapshot);
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
});

test('completed legacy undos are never replayed when retrying file restoration', async (t) => {
  const f = await fixture(t, {'window.titleBarStyle': 'native'});
  await complete(f.background, 'apply');
  const state = await fs.readFile(f.background.stateFile, 'utf8');
  const html = await fs.readFile(f.file, 'utf8');
  await fs.writeFile(f.background.journalFile, JSON.stringify({schema: 2, identity: f.options.identity,
    profile: f.options.profile, beforeHtml: html, afterHash: hash(html), beforeState: state,
    changes: [{key: 'window.titleBarStyle', before: value('custom'), after: value('native'), progress: 'rolledBack'}],
    rollback: {html: true, state: false}}));
  f.config.set('window.titleBarStyle', 'native');
  await new Background(f.options).recover();
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
  await complete(f.background, 'disable');
  assert.equal(f.config.get('window.titleBarStyle'), 'native');
});
