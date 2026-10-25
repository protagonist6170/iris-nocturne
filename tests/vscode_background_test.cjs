'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {Background, CANVASES, hash} = require('../assets/vscode/background');

const BASE = '<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src self; style-src self unsafe-inline"/></head><body>original</body></html>';
async function fixture(t, entries = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'iris-background-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'workbench.html');
  await fs.writeFile(file, BASE);
  const config = new Map(Object.entries({'workbench.colorTheme': 'Dark Modern', 'personal': 42, ...entries}));
  const settings = {read: async (key) => config.get(key), write: async (key, value) => {
    if (value === undefined) config.delete(key); else config.set(key, value);
  }};
  const options = {workbench: file, identity: '1.143.1:one', profile: path.join(root, 'profile'), storage: path.join(root, 'profile/storage'),
    css: '.monaco-workbench { --iris-background: blue; }', settings};
  return {root, file, config, settings, options, background: new Background(options)};
}

test('enable is idempotent; disable and restore preserve edits and original HTML', async (t) => {
  const f = await fixture(t, {'color:terminal.background': '#123456'});
  await f.background.apply();
  const first = await fs.readFile(f.file, 'utf8');
  assert.ok(first.includes('--iris-background'));
  assert.ok(first.includes('Content-Security-Policy'));
  await f.background.apply();
  assert.equal(await fs.readFile(f.file, 'utf8'), first);
  f.config.set('personal', 100);
  f.config.set('color:minimap.background', '#edited');
  await f.background.disable();
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
  assert.equal(f.config.get('color:terminal.background'), '#123456');
  assert.equal(f.config.get('color:minimap.background'), '#edited');
  assert.equal(f.config.get('workbench.colorTheme'), 'Iris Nocturne');
  await f.background.disable({restore: true});
  assert.equal(f.config.get('workbench.colorTheme'), 'Dark Modern');
  assert.equal(f.config.get('personal'), 100);
  f.config.set('workbench.colorTheme', 'Light Modern');
  await f.background.apply();
  await f.background.disable({restore: true});
  assert.equal(f.config.get('workbench.colorTheme'), 'Light Modern');
  assert.equal(f.config.has('window.titleBarStyle'), false);
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
  for (const key of CANVASES) f.config.set('color:' + key, '#00000000');
  const uuid = 'abc123-abcd';
  const backup = path.join(f.root, `workbench.${uuid}.bak-custom-css`);
  const unrelatedBackup = path.join(f.root, 'workbench.other.bak-custom-css');
  await fs.writeFile(backup, BASE);
  await fs.writeFile(unrelatedBackup, 'unrelated');
  await fs.writeFile(f.file, BASE.replace('</head>', `<!-- !! VSCODE-CUSTOM-CSS-SESSION-ID ${uuid} !! --><!-- !! VSCODE-CUSTOM-CSS-START !! --><style>old</style><!-- !! VSCODE-CUSTOM-CSS-END !! --></head>`));
  assert.equal((await f.background.apply()).migrated, true);
  await assert.rejects(fs.stat(backup), /ENOENT/);
  assert.equal(await fs.readFile(unrelatedBackup, 'utf8'), 'unrelated');
  const html = await fs.readFile(f.file, 'utf8');
  assert.ok(html.indexOf('--before') < html.indexOf('--iris-background'));
  assert.ok(html.indexOf('--iris-background') < html.indexOf('--after'));
  assert.deepEqual(f.config.get('vscode_custom_css.imports'), []);
  assert.deepEqual(f.config.get('irisNocturne.customCssImports'), [imports[0], imports[2]]);
  f.config.set('workbench.colorTheme', 'Light Modern');
  await f.background.disable();
  const disabled = await fs.readFile(f.file, 'utf8');
  assert.ok(disabled.includes('--before') && disabled.includes('--after'));
  assert.ok(!disabled.includes('--iris-background'));
  assert.equal(f.config.get('workbench.colorTheme'), 'Light Modern');
  assert.ok(CANVASES.every((key) => !f.config.has('color:' + key)));
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

test('configuration or filesystem write failure rolls back the complete transaction', async (t) => {
  for (const failure of ['settings', 'state']) {
    const f = await fixture(t);
    const snapshot = [...f.config];
    let fired = false;
    if (failure === 'settings') {
      const write = f.settings.write;
      f.settings.write = async (key, value) => {
        if (key === 'window.titleBarStyle' && !fired) { fired = true; throw new Error('write denied'); }
        return write(key, value);
      };
    } else {
      const rename = fs.rename;
      fs.rename = async (source, target) => {
        if (target === f.background.stateFile && !fired) {
          fired = true;
          throw new Error('state write denied');
        }
        return rename(source, target);
      };
      t.after(() => { fs.rename = rename; });
    }
    await assert.rejects(f.background.apply());
    assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
    assert.deepEqual([...f.config], snapshot);
  }
});

test('version changes require explicit reapply and never restore the old application HTML', async (t) => {
  const f = await fixture(t);
  await f.background.apply();
  await fs.rm(f.background.directory, {recursive: true});
  const updated = BASE.replace('original', 'new version');
  await fs.writeFile(f.file, updated);
  const next = new Background({...f.options, identity: '1.144.0:two'});
  await assert.rejects(next.apply(), /Reapply/);
  await next.apply({reapply: true});
  await next.disable({restore: true});
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
  await f.background.locked(async () => {});
  assert.equal(await fs.readFile(f.file, 'utf8'), BASE);
  assert.equal(f.config.get('workbench.colorTheme'), 'Dark Modern');
  await fs.mkdir(path.join(f.background.directory, 'lock'));
  await fs.writeFile(path.join(f.background.directory, 'lock/owner.json'), JSON.stringify({pid: process.pid}));
  await assert.rejects(f.background.apply(), /Another Iris operation/);
});
