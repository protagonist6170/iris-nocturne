// Background transactions are independent of VS Code so recovery can be tested.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {fileURLToPath} = require('node:url');
const {isDeepStrictEqual: equal} = require('node:util');
const {'workbench.colorCustomizations': colorCustomizations, ...globalAppearance} = require('./managed-appearance.json');

const START = '<!-- IRIS-NOCTURNE:START -->';
const END = '<!-- IRIS-NOCTURNE:END -->';
const irisColors = colorCustomizations['[Iris Nocturne]'];
const MANAGED_SETTINGS = [...Object.entries(globalAppearance),
  ...Object.entries(irisColors).map(([key, after]) => ['color:' + key, after])];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const value = (data) => data === undefined ? {exists: false} : {exists: true, value: data};
const unpack = (record) => record.exists ? record.value : undefined;
const json = (data) => JSON.stringify(data, null, 2) + '\n';
async function optional(file) {
  try { return await fs.readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
async function atomic(file, content) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    const mode = await fs.stat(file).then((stat) => stat.mode & 0o777).catch(() => 0o600);
    await fs.writeFile(temporary, content, {mode, flag: 'wx'});
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, {force: true}); }
}
function policy(html) {
  const matches = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][\s\S]*?\/>/gi);
  if (matches?.length !== 1 || !html.includes('</head>')) {
    throw new Error('A single original CSP and workbench head are required. Restore a clean application first.');
  }
  if (!/style-src[^;]*unsafe-inline/i.test(matches[0])) throw new Error('This application CSP does not allow inline CSS. Iris will not weaken it.');
  return matches[0];
}
function render(base, imports, gradient, css) {
  policy(base);
  if (base.includes(START) || /VSCODE-CUSTOM-CSS|<style[^>]*>[\s\S]*--iris-background/.test(base)) {
    throw new Error('The baseline contains an existing background patch. Restore its original application first.');
  }
  const entries = imports.length ? imports : [{iris: true}];
  const styles = entries.map((entry) => entry.iris ? (gradient ? css : '') : entry.css).filter(Boolean);
  if (!styles.length) return base;
  // Imported text must never terminate the style element and introduce HTML.
  if (styles.some((style) => /<\/style/i.test(style))) throw new Error('A CSS import contains a closing style tag.');
  return base.replace('</head>', `${START}\n<style>\n${styles.join('\n')}\n</style>\n${END}\n</head>`);
}

// Resolve the same documented URL variables as the legacy loader, at explicit apply time.
function resolveImport(source, variables) {
  return source.replace(/\$\{([^{}]+)\}/g, (_, key) => {
    if (key.startsWith('env:')) {
      const [name, ...fallback] = key.slice(4).split(':');
      return process.env[name] ?? fallback.join(':');
    }
    if (Object.hasOwn(variables, key)) return variables[key];
    throw new Error(`Unsupported CSS URL variable: ${key}`);
  });
}
async function loadImports(sources, variables) {
  const entries = [];
  for (const source of sources) {
    if (typeof source !== 'string') throw new Error('Every CSS import must be a URL string.');
    const resolved = resolveImport(source, {userHome: os.homedir(), cwd: process.cwd(),
      pathSeparator: path.sep, '/': path.sep, ...variables});
    const url = new URL(resolved);
    if (!url.pathname.toLowerCase().endsWith('.css')) {
      throw new Error('Migration supports CSS only. Remove or separately manage JavaScript imports first.');
    }
    if (!['file:', 'http:', 'https:'].includes(url.protocol)) throw new Error('Use file, HTTP or HTTPS CSS URLs.');
    let iris = false;
    if (url.protocol === 'file:') {
      const filename = fileURLToPath(url);
      const folder = path.dirname(path.dirname(filename));
      if (path.basename(filename) === 'iris-nocturne.css' && path.basename(path.dirname(filename)) === 'background') {
        const manifest = await optional(path.join(folder, 'package.json'));
        if (manifest) {
          const data = JSON.parse(manifest);
          iris = data.name === 'iris-nocturne' && data.publisher === 'protagonist';
        }
      }
      entries.push(iris ? {source, iris: true} : {source, css: await fs.readFile(filename, 'utf8')});
    } else {
      const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`CSS download failed: HTTP ${response.status}`);
      entries.push({source, css: await response.text()});
    }
  }
  if (!entries.some((entry) => entry.iris)) entries.push({iris: true});
  return entries;
}

class Background {
  #reviewRevision = 0;

  // Queue admission follows completed reviews, not unrelated read-only work.
  get reviewRevision() { return this.#reviewRevision; }

  constructor({workbench, identity, profile, css, settings, variables = {}, storage}) {
    Object.assign(this, {workbench, identity, profile, css, settings, variables});
    this.directory = path.join(path.dirname(workbench), '.iris-nocturne');
    this.storage = storage ?? this.directory;
    this.stateFile = path.join(this.storage, 'background-state.json');
    this.journalFile = path.join(this.storage, 'background-transaction.json');
  }
  async state() {
    const text = await optional(this.stateFile);
    return text ? JSON.parse(text) : undefined;
  }
  // Inspection never acquires a lock or changes the application or its records.
  async inspect() {
    if (await optional(this.journalFile) !== undefined) return {status: 'recovery'};
    const state = await this.state();
    if (!state) return {status: 'unmanaged'};
    const current = await fs.readFile(this.workbench, 'utf8');
    const changed = state.identity !== this.identity || state.expected !== hash(current);
    return {status: changed ? 'changed' : 'ready', gradient: state.gradient};
  }
  async recover() {
    await this.locked(async () => {}, 'recover');
  }
  async locked(run, intent, unsavedResources = []) {
    await fs.mkdir(this.storage, {recursive: true});
    await fs.mkdir(this.directory, {recursive: true});
    const lock = path.join(this.directory, 'lock');
    try { await fs.mkdir(lock); } catch (error) {
      if (error.code === 'EEXIST') {
        const owner = await optional(path.join(lock, 'owner.json'));
        if (owner) {
          try { process.kill(JSON.parse(owner).pid, 0); } catch (check) {
            if (check.code === 'ESRCH') {
              await fs.rm(lock, {recursive: true});
              return this.locked(run, intent, unsavedResources);
            }
          }
        }
        throw new Error('Another Iris operation owns the application lock. Close other VS Code windows and retry.');
      }
      throw error;
    }
    try {
      await fs.writeFile(path.join(lock, 'owner.json'), json({pid: process.pid}));
      const text = await optional(this.journalFile);
      const journal = text ? JSON.parse(text) : undefined;
      if (journal?.review) {
        const result = await this.#review(journal, intent, unsavedResources);
        if (result) return result;
      } else await this.#rollback();
      return await run();
    } finally { await fs.rm(lock, {recursive: true, force: true}); }
  }
  async #rollback() {
    const text = await optional(this.journalFile);
    if (!text) return;
    const journal = JSON.parse(text);
    if (journal.identity !== this.identity || journal.profile !== this.profile) {
      throw new Error('An unfinished Iris transaction belongs to another application version or profile. Use its original profile to recover.');
    }
    // Older unfinished settings writes cannot be rebound or saved automatically.
    // rolledBack also includes undos skipped for user edits; never replay them.
    const changes = journal.changes.filter((change) => change.key !== 'workbench.colorTheme');
    const uncertain = changes.find((change) => journal.schema !== 2 ||
      !['pending', 'rolledBack'].includes(change.progress));
    if (uncertain) {
      throw new Error(`Cannot confirm the write or rollback of ${uncertain.key}. Automatic recovery stopped; current settings and recovery records were preserved. Manual reconciliation is required in the original profile.`);
    }
    await this.#restoreFiles(journal);
    await fs.rm(this.journalFile);
  }
  async #restoreFiles(journal) {
    journal.rollback ??= {html: false, state: false};
    const current = await fs.readFile(this.workbench, 'utf8');
    if (![hash(journal.beforeHtml), journal.afterHash].includes(hash(current))) {
      throw new Error('The workbench changed during an unfinished transaction. Restore a clean application; Iris will not overwrite it.');
    }
    if (!journal.rollback.html) {
      await atomic(this.workbench, journal.beforeHtml);
      journal.rollback.html = true;
      await atomic(this.journalFile, json(journal));
    }
    if (!journal.rollback.state) {
      if (journal.beforeState === undefined) await fs.rm(this.stateFile, {force: true});
      else await atomic(this.stateFile, journal.beforeState);
      journal.rollback.state = true;
      await atomic(this.journalFile, json(journal));
    }
  }
  async #commit(journal) {
    try {
      const current = hash(await fs.readFile(this.workbench, 'utf8'));
      if (![hash(journal.beforeHtml), journal.afterHash].includes(current)) {
        throw new Error('The workbench changed during the operation. Nothing was overwritten.');
      }
      journal.rollback = {html: false, state: false};
      await atomic(this.journalFile, json(journal));
      await atomic(this.workbench, journal.afterHtml);
      await atomic(this.stateFile, json(journal.afterState));
      await fs.rm(this.journalFile);
    } catch (error) {
      try { await this.#restoreFiles(journal); } catch (recovery) {
        throw new Error(`${error.message} Recovery is incomplete: ${recovery.message}`);
      }
      // Settings were saved by the user. Keep their original snapshots for an
      // explicit retry; file rollback must not undo or save settings drafts.
      if (!journal.review) await fs.rm(this.journalFile);
      throw error;
    }
    const backup = journal.afterState.migration.legacyBackup;
    if (backup && path.dirname(backup) === path.dirname(this.workbench)) {
      const original = await optional(backup);
      if (original !== undefined && hash(original) === hash(journal.afterState.base)) {
        await fs.rm(backup).catch(() => {});
      }
    }
    return {gradient: journal.afterState.gradient, migrated: journal.afterState.migration.completed};
  }
  async #review(journal, intent, unsavedResources) {
    if (journal.identity !== this.identity || journal.profile !== this.profile) {
      throw new Error('This settings review belongs to another application version or profile. Use its original profile.');
    }
    if (journal.changes.every((change) => change.progress === 'pending')) {
      await this.#restoreFiles(journal);
      await fs.rm(this.journalFile);
      return;
    }
    if (journal.changes.some((change) => change.progress !== 'written')) {
      throw new Error('Cannot confirm the settings edit. Current drafts and recovery records were preserved. Manual reconciliation is required.');
    }
    const requestedUnsaved = journal.review.some((entry) => unsavedResources.includes(entry.source.uri));
    await this.settings.validate(this.#settingsInputs(journal), journal.review.map((entry) => entry.source));
    if (intent !== journal.intent) {
      if (!requestedUnsaved && await this.settings.saved(journal.review, journal.changes, 'before')) {
        await this.#restoreFiles(journal);
        await fs.rm(this.journalFile);
        return;
      }
      throw new Error(`Finish ${journal.intent}, or undo its settings drafts and save before another command. No earlier command was resumed.`);
    }
    if (requestedUnsaved || !await this.settings.saved(journal.review, journal.changes, 'after')) {
      return {pendingSave: true, intent: journal.intent, resources: journal.review.map((entry) => entry.source.uri)};
    }
    return this.#commit(journal);
  }
  #settingsInputs(journal) {
    const before = journal.beforeState ? JSON.parse(journal.beforeState).saved : [];
    // Keep both sides: Disable clears saved, while Reapply may replace an entry.
    return [...before, ...journal.afterState.saved, ...journal.changes]
        .filter((entry) => entry.key !== 'workbench.colorTheme');
  }
  async transaction(state, html, changes, expectedBefore, intent, snapshot) {
    const journal = {schema: 2, identity: this.identity, profile: this.profile,
      beforeHtml: await fs.readFile(this.workbench, 'utf8'),
      beforeState: await optional(this.stateFile), afterHash: hash(html),
      afterHtml: html, afterState: state, intent,
      changes: changes.map((change) => ({...change, progress: 'pending'})),
      rollback: {html: false, state: false}};
    // Validation is unconditional; only producing a draft depends on the delta.
    const documents = await this.settings.plan(changes, this.#settingsInputs(journal), snapshot);
    const review = changes.length ? documents : undefined;
    journal.review = review;
    if (hash(journal.beforeHtml) !== expectedBefore) throw new Error('The workbench changed while preparing the operation. Retry after resolving the other modification.');
    await atomic(this.journalFile, json(journal));
    if (review) {
      for (const change of journal.changes) change.progress = 'writing';
      await atomic(this.journalFile, json(journal));
    }
    let staged;
    // Even a zero-delta plan submits unchanged documents for version validation.
    try { staged = await this.settings.stage(documents); } catch (error) {
      if (!review) throw error;
      throw new Error(`${error.message} Cannot confirm the settings edit; drafts and recovery records were preserved. Manual reconciliation is required.`);
    }
    if (!staged) {
      if (review) {
        for (const change of journal.changes) change.progress = 'pending';
        await atomic(this.journalFile, json(journal));
      }
      await this.#restoreFiles(journal);
      await fs.rm(this.journalFile);
      throw new Error('Setting changed during the operation. Retry after finishing your settings edits.');
    }
    if (!review) return this.#commit(journal);
    // "written" confirms the model edit, not a disk save. No event resumes it.
    for (const change of journal.changes) change.progress = 'written';
    await atomic(this.journalFile, json(journal));
    this.#reviewRevision++;
    return {pendingSave: true, intent, resources: review.map((entry) => entry.source.uri)};
  }
  change(snapshot, key, after) {
    return {...snapshot.fields.find((entry) => entry.key === key), after: value(after)};
  }
  async apply({reapply = false, unsavedResources = []} = {}) {
    return this.locked(async () => {
      let state = await this.state();
      const inputs = state?.saved.filter((entry) => entry.key !== 'workbench.colorTheme') ?? [];
      for (const key of ['vscode_custom_css.imports', 'irisNocturne.customCssImports', ...MANAGED_SETTINGS.map(([key]) => key)]) {
        if (!inputs.some((entry) => entry.key === key)) inputs.push({key});
      }
      const snapshot = await this.settings.snapshot(inputs, unsavedResources);
      const read = (key) => unpack(snapshot.fields.find((entry) => entry.key === key).before);
      const existing = Boolean(state);
      const current = await fs.readFile(this.workbench, 'utf8');
      const changes = [];
      let migrated = false;
      if (state && state.profile !== this.profile) throw new Error('Manage this application background from the profile that enabled it.');
      if (state && state.identity !== this.identity) {
        if (!reapply) throw new Error('VS Code changed. Run Iris Nocturne: Reapply Background.');
        policy(current);
        if (current.includes(START)) throw new Error('The new application still contains an unrecognized Iris patch. Restore a clean copy first.');
        state = {...state, identity: this.identity, base: current, expected: hash(current)};
      }
      if (!state) {
        let base = current;
        let legacyBackup;
        const sources = read('vscode_custom_css.imports') ?? [];
        if (!Array.isArray(sources)) throw new Error('Legacy Imports must be an array.');
        const ownSources = read('irisNocturne.customCssImports') ?? [];
        if (!Array.isArray(ownSources)) throw new Error('Iris CSS imports must be an array.');
        const session = current.match(/<!-- !! VSCODE-CUSTOM-CSS-SESSION-ID ([0-9a-fA-F-]+) !! -->/);
        if (current.includes('VSCODE-CUSTOM-CSS') && !session) throw new Error('Unrecognized legacy patch. Restore it before migrating.');
        if (session) {
          const region = current.match(/<!-- !! VSCODE-CUSTOM-CSS-START !! -->([\s\S]*?)<!-- !! VSCODE-CUSTOM-CSS-END !! -->/);
          if (!region || /<script[\s>]/i.test(region[1])) throw new Error('The legacy patch contains JavaScript or unrecognized content. Restore it before migrating.');
          const backup = path.join(path.dirname(this.workbench), `workbench.${session[1]}.bak-custom-css`);
          base = await fs.readFile(backup, 'utf8');
          legacyBackup = backup;
          policy(base);
          migrated = true;
        }
        const imports = await loadImports([...sources, ...ownSources], this.variables);
        migrated ||= sources.length > 0 && imports.some((entry) => entry.iris && entry.source);
        const customSources = imports.filter((entry) => entry.source && !entry.iris).map((entry) => entry.source);
        if (sources.length) changes.push(this.change(snapshot, 'vscode_custom_css.imports', []));
        if (!equal(customSources, ownSources)) changes.push(this.change(snapshot, 'irisNocturne.customCssImports', customSources));
        state = {schema: 1, identity: this.identity, profile: this.profile, base,
          expected: hash(current), imports, saved: [], gradient: false,
          migration: {imports: sources, completed: migrated, legacyBackup}};
      }
      if (state.expected !== hash(current)) throw new Error('The workbench was modified outside Iris. Restore that modification before continuing.');
      if (existing && (reapply || !state.gradient)) {
        // Keep the Iris slot's position while refreshing explicitly managed imports.
        const sources = read('irisNocturne.customCssImports') ?? [];
        const loaded = await loadImports(sources, this.variables);
        const others = loaded.filter((entry) => !entry.iris);
        const irisIndex = state.imports.findIndex((entry) => entry.iris);
        others.splice(Math.min(Math.max(irisIndex, 0), others.length), 0, {iris: true});
        state.imports = others;
      }
      for (const [key, after] of MANAGED_SETTINGS) {
        const change = this.change(snapshot, key, after);
        const old = state.saved.findIndex((entry) => entry.key === key);
        if (old >= 0 && !equal(change.before, state.saved[old].after)) state.saved.splice(old, 1);
        if (!state.saved.some((entry) => entry.key === key)) {
          const saved = structuredClone(change);
          if (migrated && key.startsWith('color:') && unpack(saved.before) === '#00000000') saved.before = value(undefined);
          state.saved.push(saved);
        }
        if (!equal(change.before, change.after)) changes.push(change);
      }
      const html = render(state.base, state.imports, true, this.css);
      state.gradient = true;
      state.expected = hash(html);
      return this.transaction(state, html, changes, hash(current), reapply ? 'reapply' : 'enable', snapshot);
    }, reapply ? 'reapply' : 'enable', unsavedResources);
  }
  async disable({unsavedResources = []} = {}) {
    return this.locked(async () => {
      const state = await this.state();
      if (!state) return {gradient: false};
      const snapshot = await this.settings.snapshot(state.saved.filter((entry) => entry.key !== 'workbench.colorTheme'), unsavedResources);
      if (state.identity !== this.identity || state.profile !== this.profile) throw new Error('Use Reapply Background in the original profile before restoring this application version.');
      const current = await fs.readFile(this.workbench, 'utf8');
      if (hash(current) !== state.expected) throw new Error('The workbench was modified outside Iris. Nothing was overwritten.');
      const changes = [];
      for (const entry of state.saved) {
        if (entry.key === 'workbench.colorTheme') continue;
        if (!equal(entry.before, entry.after) &&
            equal(snapshot.fields.find((field) => field.key === entry.key).before, entry.after)) {
          changes.push({key: entry.key, source: entry.source, before: entry.after, after: entry.before});
        }
      }
      const html = render(state.base, state.imports, false, this.css);
      state.gradient = false;
      state.expected = hash(html);
      state.saved = [];
      return this.transaction(state, html, changes, hash(current), 'disable', snapshot);
    }, 'disable', unsavedResources);
  }
}
module.exports = {Background, hash, loadImports, render, value};
