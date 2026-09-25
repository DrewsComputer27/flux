import { describe, expect, it } from 'vitest';
import { agentConfig, priorityConfig, statusConfig } from '../src/types.js';

describe('agentConfig', () => {
  it('returns the configured entry for a known agent', () => {
    expect(agentConfig('homey')).toEqual({ label: 'Homey', color: '#a855f7' });
  });

  it('falls back to a gray badge using the raw name for an unrecognized agent', () => {
    expect(agentConfig('nobody')).toEqual({ label: 'nobody', color: '#6b7280' });
  });

  it('falls back to an "unknown" label for undefined/blank agent', () => {
    expect(agentConfig(undefined)).toEqual({ label: 'unknown', color: '#6b7280' });
    expect(agentConfig('')).toEqual({ label: 'unknown', color: '#6b7280' });
  });
});

describe('priorityConfig', () => {
  it('maps "high" and "urgent" (and 0) to P0', () => {
    expect(priorityConfig('high')).toEqual({ label: 'P0', color: '#ef4444', ansi: '\x1b[31m' });
    expect(priorityConfig('urgent')).toEqual({ label: 'P0', color: '#ef4444', ansi: '\x1b[31m' });
    expect(priorityConfig(0)).toEqual({ label: 'P0', color: '#ef4444', ansi: '\x1b[31m' });
  });

  it('maps "low" and legacy 3 (and 2) to P2', () => {
    expect(priorityConfig('low')).toEqual({ label: 'P2', color: '#6b7280', ansi: '\x1b[90m' });
    expect(priorityConfig(3)).toEqual({ label: 'P2', color: '#6b7280', ansi: '\x1b[90m' });
    expect(priorityConfig(2)).toEqual({ label: 'P2', color: '#6b7280', ansi: '\x1b[90m' });
  });

  it('falls back to P1 for anything else', () => {
    expect(priorityConfig(1)).toEqual({ label: 'P1', color: '#f59e0b', ansi: '\x1b[33m' });
    expect(priorityConfig('medium')).toEqual({ label: 'P1', color: '#f59e0b', ansi: '\x1b[33m' });
    expect(priorityConfig(undefined)).toEqual({ label: 'P1', color: '#f59e0b', ansi: '\x1b[33m' });
  });
});

describe('statusConfig', () => {
  it('returns the configured entry for a known status', () => {
    expect(statusConfig('todo')).toEqual({ label: 'To Do', color: '#6b7280' });
  });

  it('falls back to the raw status string for an unrecognized status', () => {
    expect(statusConfig('bogus')).toEqual({ label: 'bogus', color: '#6b7280' });
  });
});
