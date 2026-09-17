/**
 * The pure helpers behind what a student reads: vocabularies shared with other
 * services, the pairing timeline, relative times and navigation.
 *
 * Two of these are contracts with another repository. The game types and
 * difficulties must match the gamification engine's constants, and the pair
 * states must match PairPath's ML labels - drift in either silently serves the
 * wrong game or renders an unlabelled state. Those checks read the other
 * repository's source when it is checked out beside this one, and skip by name
 * when it is not.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activeSection, SECTIONS } from '@/lib/nav';
import {
  PAIR_STATES,
  STATE_TONE,
  describeEvent,
  eventLabel,
  isFailedRun,
  mergeTimeline,
  minutesInto,
  parseMetadata,
  sessionDuration,
  stateLabel,
} from '@/lib/pair-events';
import { relativeTime } from '@/lib/time';
import {
  DIFFICULTIES,
  GAME_TYPES,
  describeDifficultySource,
  formatComponent,
  formatConcept,
  formatErrorType,
  formatGameType,
  resolveDifficulty,
  resolveGameType,
} from '@/lib/vocabulary';

const sibling = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

afterEach(() => {
  vi.useRealTimers();
});

describe('vocabulary', () => {
  it.each([
    ['BugHunt', 'BugHunt'],
    ['bug_hunt', 'BugHunt'],
    ['LOOP_TRACER', 'CodeTrace'],
    ['reorder', 'DragDrop'],
    ['code_fix', 'CodeFix'],
    ['chess', null],
    [undefined, null],
  ])('resolves the game type %j to %j', (input, expected) => {
    expect(resolveGameType(input)).toBe(expected);
  });

  it.each([
    ['Expert', 'Expert'],
    ['easy', 'Beginner'],
    ['Medium', 'Intermediate'],
    ['hard', 'Advanced'],
    ['impossible', null],
  ])('resolves the difficulty %j to %j', (input, expected) => {
    expect(resolveDifficulty(input)).toBe(expected);
  });

  it('formats names for a student to read', () => {
    expect(formatGameType('loop_tracer')).toBe('Code Trace');
    expect(formatGameType('unknown_game')).toBe('unknown_game');
    expect(formatConcept('loop_boundaries')).toBe('loop boundaries');
    expect(formatErrorType('LOOP_UPDATE_WRONG_DIRECTION')).toBe('Loop update wrong direction');
    expect(formatErrorType(null)).toBe('');
    expect(formatComponent('study_guider')).toBe('Study');
    expect(formatComponent('collaborative_studio')).toBe('Pair');
    expect(formatComponent(undefined)).toBe('Activity');
  });

  it('says when the difficulty model did not choose', () => {
    expect(describeDifficultySource('heuristic')).toMatch(/unreachable/);
    expect(describeDifficultySource('model')).toMatch(/difficulty model/);
    expect(describeDifficultySource('requested')).toBeNull();
  });

  const engineConstants = sibling('adaptive-gamification-engine/backend/config/constants.js');

  it.skipIf(!existsSync(engineConstants))(
    'matches the gamification engine\'s game types and difficulties, in order',
    () => {
      const source = readFileSync(engineConstants, 'utf-8');
      const list = (name: string) =>
        [...(source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
          (match) => match[1],
        );

      expect(list('GAME_TYPES')).toEqual([...GAME_TYPES]);
      expect(list('DIFFICULTY_LEVELS')).toEqual([...DIFFICULTIES]);
    },
  );
});

describe('pairing timeline', () => {
  const labels = sibling('Pair_Path/backend/ml/app/label_mapping.py');

  it.skipIf(!existsSync(labels))('knows every state PairPath\'s model can predict', () => {
    const source = readFileSync(labels, 'utf-8');
    for (const state of PAIR_STATES) {
      expect(source).toContain(state);
      expect(STATE_TONE[state]).toBeDefined();
    }
  });

  it('reads metadata stored as a JSON string or as an object', () => {
    expect(parseMetadata('{"note":"try i < n"}')).toEqual({ note: 'try i < n' });
    expect(parseMetadata({ codeLength: 3 })).toEqual({ codeLength: 3 });
    expect(parseMetadata('not json')).toEqual({});
    expect(parseMetadata('"a string"')).toEqual({});
    expect(parseMetadata(null)).toEqual({});
  });

  it.each([
    [{ eventType: 'DISCUSSION_NOTE', metadata: '{"note":"swap the loop bound"}' }, '“swap the loop bound”'],
    [{ eventType: 'CODE_EDIT', metadata: { codeLength: 120 } }, '120 characters in the editor'],
    [{ eventType: 'CODE_RUN_RESULT', metadata: '{"success":false}' }, 'Failed'],
    [{ eventType: 'ROLE_SWITCH', metadata: { newRoles: { a: 'NAVIGATOR', b: 'DRIVER' } } }, 'Keyboard handed over'],
    [{ eventType: 'INTERVENTION_RESPONSE', metadata: { accepted: true } }, 'Marked it helpful'],
    [{ eventType: 'JOIN', metadata: null }, null],
    // Keys from the demo seed, which the gateway never writes.
    [{ eventType: 'CODE_EDIT', metadata: { linesAdded: 4 } }, null],
  ])('describes %j', (event, expected) => {
    expect(describeEvent({ userId: 'u', timestamp: '2026-09-14T10:00:00Z', ...event })).toBe(expected);
  });

  it('labels events and states', () => {
    expect(eventLabel('CODE_RUN')).toBe('Ran the code');
    expect(eventLabel('SOMETHING_NEW')).toBe('something new');
    expect(stateLabel('PASSIVE_NAVIGATOR')).toBe('passive navigator');
    expect(isFailedRun({ userId: 'u', eventType: 'CODE_RUN_RESULT', timestamp: '', metadata: { success: false } })).toBe(true);
    expect(isFailedRun({ userId: 'u', eventType: 'CODE_RUN', timestamp: '', metadata: { success: false } })).toBe(false);
  });

  it('places a prediction at the end of its window and drops unparseable times', () => {
    const items = mergeTimeline(
      [
        { userId: 'u', eventType: 'JOIN', timestamp: '2026-09-14T10:00:00Z' },
        { userId: 'u', eventType: 'CODE_EDIT', timestamp: 'garbage' },
        { userId: 'u', eventType: 'CODE_RUN', timestamp: '2026-09-14T10:04:00Z' },
      ],
      [
        {
          windowStart: '2026-09-14T09:59:00Z',
          windowEnd: '2026-09-14T10:02:00Z',
          predictedState: 'PRODUCTIVE',
          confidence: 0.9,
          modelVersion: 'v1',
        },
      ],
    );

    expect(items.map((item) => (item.kind === 'event' ? item.eventType : item.predictedState))).toEqual([
      'JOIN',
      'PRODUCTIVE',
      'CODE_RUN',
    ]);
  });

  it('measures durations, including a session still running', () => {
    expect(sessionDuration('2026-09-14T10:00:00Z', '2026-09-14T10:45:00Z')).toBe('45 min');
    expect(sessionDuration('2026-09-14T10:00:00Z', '2026-09-14T12:05:00Z')).toBe('2h 5m');
    expect(sessionDuration('garbage')).toBe('—');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T10:30:00Z'));
    expect(sessionDuration('2026-09-14T10:00:00Z', null)).toBe('30 min');
    expect(minutesInto(new Date('2026-09-14T10:07:30Z').getTime(), '2026-09-14T10:00:00Z')).toBe(7);
  });
});

describe('relativeTime', () => {
  it.each([
    [null, ''],
    ['not a date', ''],
    ['2026-09-14T11:59:30Z', 'just now'],
    ['2026-09-14T12:00:30Z', 'just now'],
    ['2026-09-14T11:48:00Z', '12m ago'],
    ['2026-09-14T09:00:00Z', '3h ago'],
    ['2026-09-11T12:00:00Z', '3d ago'],
    ['2026-08-24T12:00:00Z', '3w ago'],
  ])('%j reads as %j', (iso, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    expect(relativeTime(iso)).toBe(expected);
  });
});

describe('navigation', () => {
  it.each([
    ['/', 'Overview'],
    ['/study', 'Study'],
    ['/study/abc/quiz', 'Study'],
    ['/pair/123/results', 'Pair'],
    ['/insights', 'Insights'],
    ['/studying', undefined],
  ])('%s belongs to %s', (path, label) => {
    expect(activeSection(path)?.label).toBe(label);
  });

  it('has one entry per route', () => {
    expect(new Set(SECTIONS.map((section) => section.href)).size).toBe(SECTIONS.length);
  });
});
