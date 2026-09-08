import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('connections layout stays scoped and uses the Signal panel and control tokens', () => {
  assert.match(css, /#connections-page \.connection-card[^\{]*\{[^}]*border-radius:\s*var\(--radius-panel\)/);
  assert.match(css, /#connections-page \.connection-actions[^\{]*\{[^}]*gap:\s*8px/);
  assert.match(css, /#connections-page \.connection-facts[^\{]*\{[^}]*grid-template-columns/);
  assert.match(css, /#connections-page \.connections-list[^\{]*\{[^}]*minmax\(min\(100%, 340px\), 1fr\)/);
  assert.doesNotMatch(css, /#connections-page[^\{]*gradient/);
});

test('connections collapse to full-width actions at the narrow viewport', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#connections-page \.connections-header/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?#connections-page \.connection-actions > \*/);
});
