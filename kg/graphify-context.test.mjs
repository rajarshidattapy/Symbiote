import assert from 'node:assert/strict';
import test from 'node:test';
import { packGraphContext } from './graphify-context.mjs';

const graph = {
  nodes: [
    { id: 'provider', label: 'streamSymbiote', source_file: 'ai-service/pi-provider.ts', source_location: 'L135' },
    { id: 'bridge', label: 'runBridge', source_file: 'ai-service/pi-provider.ts', source_location: 'L96' },
    { id: 'session', label: 'SessionState', source_file: 'ai-service/session.ts', source_location: 'L7' },
  ],
  links: [
    { source: 'provider', target: 'bridge', relation: 'calls', confidence: 'EXTRACTED' },
    { source: 'provider', target: 'session', relation: 'uses', confidence: 'EXTRACTED' },
  ],
};

test('packs relevant graph nodes and extracted relationships inside its budget', () => {
  const result = packGraphContext(graph, 'How does streamSymbiote send a request?', { tokenBudget: 150, depth: 1 });
  assert.match(result.text, /streamSymbiote/);
  assert.match(result.text, /runBridge/);
  assert.match(result.text, /calls\/EXTRACTED/);
  assert.ok(result.tokens <= 150);
});

test('returns no prompt context when graph terms do not match', () => {
  assert.equal(packGraphContext(graph, 'unrelated vegetable').text, '');
});
