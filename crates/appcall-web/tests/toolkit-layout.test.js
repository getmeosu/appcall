import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../static/dashboard.css', import.meta.url), 'utf8');
const appCss = fs.readFileSync(new URL('../static/app.css', import.meta.url), 'utf8');
const rule = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
};

test('connector panes shrink inside the page and use Signal surfaces', () => {
  assert.match(rule('.tk-tools-layout'), /grid-template-columns:\s*220px minmax\(0,\s*1fr\)/);
  assert.match(rule('.tk-run-layout'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rule('.tk-tool-workspace'), /min-width:\s*0/);
  assert.match(rule('.tk-tool-workspace'), /var\(--color-panel\)/);
  assert.match(rule('#tk-detail pre'), /overflow:\s*auto/);
});

test('catalog search ships the alignment utility used by its form', () => {
  assert.match(appCss, /\.items-end\{align-items:flex-end\}/);
});

test('tablet stacks results and mobile uses the native selector with touch targets', () => {
  assert.match(css, /@media\s*\(max-width:\s*1279px\)[\s\S]*?\.tk-run-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.tk-tool-list\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.tk-mobile-selector\s*\{[^}]*display:\s*block/);
  assert.match(css, /#tk-detail \.ui-control[^{]*\{[^}]*min-height:\s*44px/);
});

test('selected tool and tab have a structural iris marker, without gradients', () => {
  assert.match(rule('.tk-tool-item[data-selected="true"]::before'), /width:\s*2px/);
  assert.match(rule('.tk-tool-item[data-selected="true"]::before'), /var\(--color-iris-400\)/);
  assert.match(rule('#tk-tabs [data-selected="true"]::after'), /height:\s*2px/);
  const connector = css.slice(css.indexOf('/* Signal connector console'));
  assert.ok(connector.length > 100);
  assert.doesNotMatch(connector, /gradient|text-ink-400|color:\s*var\(--color-ink-400\)/);
});

test('nested guided groups preserve spacing and freeform pairs fit narrow panes', () => {
  assert.match(rule('#tk-detail .tk-more-options > .ui-field'), /margin-top:\s*16px/);
  assert.match(rule('#tk-detail fieldset.ui-field > .ui-field'), /margin-top:\s*16px/);
  assert.match(rule('.tk-map-row'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rule('.tk-map-row'), /gap:\s*12px/);
  assert.match(rule('#tk-detail textarea.ui-control'), /min-height:\s*120px/);
});

test('used Signal text and control pairs meet measured contrast thresholds', () => {
  const theme = fs.readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const color = key => {
    const hex = theme.match(new RegExp(`--color-${key}:\\s*#([a-fA-F0-9]{6})`))?.[1];
    assert.ok(hex, key);
    return [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)/255)
      .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
      .reduce((n,v,i) => n+v*[.2126,.7152,.0722][i],0);
  };
  const contrast = (a,b) => (Math.max(color(a),color(b))+.05)/(Math.min(color(a),color(b))+.05);
  for (const background of ['panel','raised','ground','canvas']) {
    for (const foreground of ['ink-300','ink-200','ink-100','iris-300','iris-400']) {
      assert.ok(contrast(foreground,background)>=4.5, `${foreground}/${background}`);
    }
    assert.ok(contrast('line-strong',background)>=3, `control/${background}`);
  }
});
