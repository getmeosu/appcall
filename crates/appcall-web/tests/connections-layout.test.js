import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('connections layout stays scoped and uses the Signal panel and control tokens', () => {
  assert.match(css, /#connections-page \.connections-table-shell[^\{]*\{[^}]*border-radius:\s*var\(--radius-panel\)/);
  assert.match(css, /#connections-page \.connections-table[^\{]*\{[^}]*width:\s*100%/);
  assert.match(css, /#connections-page \.connection-row[^\{]*\{[^}]*border-bottom/);
  assert.match(css, /#connections-page \.connection-actions[^\{]*\{[^}]*gap:\s*8px/);
  assert.doesNotMatch(css, /#connections-page[^\{]*gradient/);
});

test('connections collapse to full-width actions at the narrow viewport', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#connections-page \.connections-table thead/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#connections-page \.connections-table td::before/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#connections-page \.connection-actions > \*/);
});

test('connections keep action labels intact across the tablet breakpoint', () => {
  const tabletRules = /@media\s*\(min-width:\s*641px\)\s+and\s+\(max-width:\s*900px\)[\s\S]*?#connections-page \.connections-table thead th:nth-child\(5\)[^\{]*\{[^}]*width:\s*28%[\s\S]*?#connections-page \.connection-action \.ui-button[^\{]*\{[^}]*white-space:\s*nowrap/;
  assert.match(css, tabletRules);
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s+and\s+\(max-width:\s*900px\)[\s\S]*?#connections-page \.connection-action \.ui-button-labels > span[^\{]*\{[^}]*white-space:\s*nowrap/);
});
