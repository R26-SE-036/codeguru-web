/**
 * The platform's two vocabularies, translated in one place.
 *
 * ==================== WHY THIS FILE EXISTS ====================
 * Code Coach and the gamification engine name the same things differently.
 *
 *   game type    Code Coach: bug_hunt, loop_tracer, condition_debug,
 *                            debug_challenge
 *                Engine:     BugHunt, DragDrop, CodeTrace
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

/** The three games this engine actually implements. */
export const GAME_TYPES = ['BugHunt', 'DragDrop', 'CodeTrace'] as const;
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
