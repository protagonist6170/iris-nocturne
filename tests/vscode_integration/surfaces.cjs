// Optional GUI check against an isolated VS Code instance with a CDP port.
// Playwright is supplied by the validation environment, never the shipped VSIX.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {parseArgs} = require('node:util');
const {chromium} = require('playwright');

const {values} = parseArgs({options: {
  root: {type: 'string'},
  output: {type: 'string'},
  endpoint: {type: 'string', default: 'http://127.0.0.1:9333'},
  'require-onboarding': {type: 'boolean', default: false},
}});

async function main() {
  assert.ok(values.root && values.output, 'Pass --root and --output for an isolated validation run');
  const root = await fs.realpath(values.root);
  assert.notEqual(root, path.parse(root).root, 'Use a dedicated validation directory');
  await fs.mkdir(values.output, {recursive: true});
  const browser = await chromium.connectOverCDP(values.endpoint);
  try {
    const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => {
      const url = decodeURIComponent(candidate.url());
      return url.includes(root + path.sep) && url.includes('/workbench.html');
    });
    assert.ok(page, 'The running workbench must be inside --root, never the daily application');
    await page.locator('.monaco-workbench').waitFor();
    if (values['require-onboarding']) await page.locator('.onboarding-a-card').waitFor();
    const result = await page.evaluate(() => {
      const workbench = document.querySelector('.monaco-workbench');
      const host = document.createElement('div');
      host.dataset.irisSurfaceProbe = '';
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:500px;pointer-events:none';
      workbench.appendChild(host);
      // These inert fixtures exercise VS Code's installed CSS in the real
      // workbench cascade without signing in or starting microphone capture.
      const fixtures = [
        ['dictation', ['part editor', 'monaco-editor', 'editor-dictation-widget'], '#2C3550'],
        ['inline-chat', ['part editor', 'monaco-editor', 'inline-chat-content-widget'], '#2C3550'],
        ['terminal-voice', ['part panel', 'terminal', 'terminal-voice'], '#2C3550'],
        ['action-list', ['action-widget'], '#2C3550'],
        ['browser-pause-message', ['part editor', 'browser-root', 'browser-overlay-paused-message'], '#2C3550'],
        ['notebook-sticky', ['part editor', 'notebookOverlay', 'notebook-sticky-scroll-container'], '#302B57'],
        ['output-sticky', ['part panel', 'content', 'pane-body output-view', 'monaco-editor', 'sticky-widget'], '#302B57'],
        ['modal-editor', ['monaco-modal-editor-block', 'part editor modal-editor-part'], '#2C3550'],
        ['editor-canvas', ['part editor', 'monaco-editor', 'monaco-editor-background'], 'transparent'],
      ];
      const color = (element) => {
        const style = getComputedStyle(element);
        return {background: style.backgroundColor, editor: style.getPropertyValue('--vscode-editor-background'), panel: style.getPropertyValue('--vscode-panel-background')};
      };
      const samples = [];
      try {
        for (const [name, classes, expected] of fixtures) {
          host.replaceChildren();
          let element = host;
          for (const className of classes) {
            const child = document.createElement('div');
            child.className = className;
            element.appendChild(child);
            element = child;
          }
          samples.push({name, expected, ...color(element)});
        }
        const onboarding = document.querySelector('.onboarding-a-card');
        if (onboarding) samples.push({name: 'onboarding', expected: '#2C3550', ...color(onboarding)});
        const overlay = document.querySelector('.onboarding-a-overlay');
        const backdrop = overlay ? {background: getComputedStyle(overlay).backgroundColor, blur: getComputedStyle(overlay).backdropFilter} : null;
        return {title: document.title, samples, backdrop};
      } finally { host.remove(); }
    });
    await fs.writeFile(path.join(values.output, 'surfaces.json'), JSON.stringify(result, null, 2) + '\n');
    await page.screenshot({path: path.join(values.output, 'workbench.png')});
    if (values['require-onboarding']) await page.locator('.onboarding-a-card').screenshot({path: path.join(values.output, 'onboarding.png')});
    console.table(result.samples.map(({name, background, expected}) => ({name, background, expected})));
    const failures = result.samples.filter(({background, expected}) => {
      if (expected === 'transparent') return background !== 'rgba(0, 0, 0, 0)';
      const rgb = expected.slice(1).match(/../g).map((component) => Number.parseInt(component, 16));
      return background !== `rgb(${rgb.join(', ')})`;
    });
    assert.deepEqual(failures, [], 'Floating surfaces must cover content; editor canvases must stay transparent');
    if (values['require-onboarding']) {
      assert.equal(result.backdrop.background, 'rgba(0, 0, 0, 0.4)');
      assert.equal(result.backdrop.blur, 'blur(8px)');
    }
  } finally { await browser.close(); }
}

main().catch((error) => {console.error(error); process.exitCode = 1;});
