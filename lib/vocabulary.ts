/**
 * The platform's two vocabularies, translated in one place.
 *
 * ==================== WHY THIS FILE EXISTS ====================
 * Code Coach and the gamification engine name the same things differently.
 *
 *   game type    Code Coach: bug_hunt, loop_tracer, condition_debug,
 *                            debug_challenge
 *                Engine:     BugHunt, DragDrop, CodeTrace, CodeFix
 *
 *   difficulty   Code Coach: beginner, intermediate, advanced
 *                Engine:     Easy, Medium, Hard
 *
 * That mapping previously existed in three places - the engine's
 * config/constants.js, its routes/gamification.js, and its frontend config.js -
 * and the drift caused a real bug, documented in the route itself: an
 * unresolved game type matched nothing in the question bank, the query fell
 * through to a concept-only fallback that ignores difficulty, and the student
 * was served a game of a different type than the URL claimed. Games appeared;
 * the UI rendered the wrong interaction for them.
 *
 * The backend keeps its own copy, because a backend must not depend on its
 * client for correctness. This is the frontend's single copy, replacing the
 * one that used to live in each of three separate frontends.
 * ==============================================================
 */

/**
 * The games this engine implements. Must match GAME_TYPES in the engine's
 * config/constants.js - a type listed here but not there is served as a
 * fallback game of a different kind, which is the drift this file exists to
 * prevent.
 */
export const GAME_TYPES = ['BugHunt', 'DragDrop', 'CodeTrace', 'CodeFix'] as const;
export type GameType = (typeof GAME_TYPES)[number];

/** Code Coach's names for a kind of practice, mapped to what we implement. */
const GAME_TYPE_ALIASES: Record<string, GameType> = {
  bug_hunt: 'BugHunt',
  debug_challenge: 'BugHunt',
  condition_debug: 'BugHunt',
  loop_tracer: 'CodeTrace',
  code_trace: 'CodeTrace',
  drag_drop: 'DragDrop',
  reorder: 'DragDrop',
  // Code Coach has no name for CodeFix - it is this engine's own game - so
  // only the engine's spelling resolves. Kept here so the intent is explicit
  // rather than an omission someone later reads as a bug.
  code_fix: 'CodeFix',
  fix_the_bug: 'CodeFix',
};

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const DIFFICULTY_ALIASES: Record<string, Difficulty> = {
  beginner: 'Easy',
  easy: 'Easy',
  intermediate: 'Medium',
  medium: 'Medium',
  advanced: 'Hard',
  hard: 'Hard',
};

/** Resolve either vocabulary to a game type, or null if unrecognised. */
export function resolveGameType(value: string | undefined): GameType | null {
  if (!value) return null;
  if ((GAME_TYPES as readonly string[]).includes(value)) return value as GameType;
  return GAME_TYPE_ALIASES[value.toLowerCase()] ?? null;
}

/** Resolve either vocabulary to a difficulty, or null if unrecognised. */
export function resolveDifficulty(value: string | undefined): Difficulty | null {
  if (!value) return null;
  if ((DIFFICULTIES as readonly string[]).includes(value)) return value as Difficulty;
  return DIFFICULTY_ALIASES[value.toLowerCase()] ?? null;
}

/** "BugHunt" -> "Bug Hunt"; "loop_tracer" -> "Code Trace". */
export function formatGameType(value: string | undefined): string {
  const resolved = resolveGameType(value);
  if (!resolved) return value ?? 'Practice';
  return resolved.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** "loop_boundaries" -> "loop boundaries". */
export function formatConcept(value: string | undefined): string {
  return (value ?? '').replace(/_/g, ' ');
}

/**
 * How the difficulty was arrived at, as reported by the game endpoint.
 *
 * This is not decoration. `heuristic` means the ML service did not answer and
 * the pre-ML if/else chose instead - which used to happen silently, and is the
 * reason nobody noticed the Random Forest had never run. Showing it makes a
 * demo that is not actually adaptive visibly not adaptive.
 */
export function describeDifficultySource(source: string | undefined): string | null {
  switch (source) {
    case 'model':
      return 'chosen for you by the difficulty model';
    case 'heuristic':
      return 'chosen by the fallback rule — the difficulty model was unreachable';
    case 'requested':
      return null;
    default:
      return null;
  }
}

/**
 * The originating component of a timeline event, as a student should read it.
 *
 * The store records `code_coach`, `study_guider`, `adaptive_gamification` and
 * `pair_path`. Those are service names — an internal fact with no meaning to
 * the person reading their own activity — and the raw value used to be printed
 * straight onto the home page.
 */
const COMPONENT_LABELS: Record<string, string> = {
  code_coach: 'Editor',
  study_guider: 'Study',
  adaptive_gamification: 'Practice',
  pair_path: 'Pair',
};

export function formatComponent(value: string | undefined): string {
  if (!value) return 'Activity';
  return COMPONENT_LABELS[value] ?? formatConcept(value);
}

/** A section hue class for a component, matching the sidebar. */
export function componentTone(value: string | undefined): string {
  switch (value) {
    case 'study_guider':
      return 'bg-hue-study/10 text-hue-study ring-hue-study/25';
    case 'adaptive_gamification':
      return 'bg-hue-play/10 text-hue-play ring-hue-play/25';
    case 'pair_path':
      return 'bg-hue-pair/10 text-hue-pair ring-hue-pair/25';
    default:
      return 'bg-hue-insight/10 text-hue-insight ring-hue-insight/25';
  }
}
