import { expect, it } from 'vitest';
import { AGENT_PAGES, resolveSettingsTab } from '../src/renderer/settings-tabs.js';

it('redirects retired automation pages to Models and keeps the remaining Agents pages addressable', () => {
  expect(resolveSettingsTab('settings')).toEqual({ tab: 'agents-models', agentPage: 'models' });
  expect(resolveSettingsTab('agents-goal')).toEqual({ tab: 'agents-goal', agentPage: 'models' });
  expect(resolveSettingsTab('agents-workers')).toEqual({ tab: 'agents-workers', agentPage: 'models' });
  for (const [tab, page] of Object.entries(AGENT_PAGES)) expect(resolveSettingsTab(tab)).toEqual({ tab, agentPage: page });
  expect(Object.values(AGENT_PAGES)).toEqual(['models', 'models', 'models', 'tools', 'browser']);
});

it('leaves every other tab alone, whatever its name', () => {
  expect(resolveSettingsTab('activity')).toEqual({ tab: 'usage', agentPage: undefined });
  for (const tab of ['chat', 'home', 'setup', 'general', 'appearance', 'usage', 'plugins', 'toString', '__proto__', 'constructor', '']) {
    expect(resolveSettingsTab(tab)).toEqual({ tab, agentPage: undefined });
  }
});
