/**
 * Which course units this browser has finished.
 *
 * Kept in localStorage and nowhere else, on purpose: the course is general
 * reading, not evidence of mastery, so it must never reach knowledge tracing.
 * Nothing here talks to a server. The cost is that it does not follow the
 * student to another device, which is acceptable for a reading checklist.
 */

const KEY = 'codeguru:course-finished';
export const COURSE_PROGRESS_EVENT = 'codeguru:course-progress';

export function finishedUnits(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** How many sections of a unit this browser has read through (0 = none). */
export function sectionsRead(unitId: string): number {
  try {
    const value = Number(window.localStorage.getItem(`codeguru:course-read:${unitId}`));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Remember a new high-water mark; never moves backwards. */
export function markSectionsRead(unitId: string, count: number): void {
  if (count <= sectionsRead(unitId)) return;
  try {
    window.localStorage.setItem(`codeguru:course-read:${unitId}`, String(count));
  } catch {
    // Storage unavailable: progress shows for this visit only.
  }
}

export function setFinished(unitId: string, finished: boolean): void {
  const units = finishedUnits();
  if (finished) units.add(unitId);
  else units.delete(unitId);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...units]));
  } catch {
    // Storage unavailable (private window): the checkmark just will not stick.
  }
  window.dispatchEvent(new Event(COURSE_PROGRESS_EVENT));
}
