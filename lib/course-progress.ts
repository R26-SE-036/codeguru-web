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
