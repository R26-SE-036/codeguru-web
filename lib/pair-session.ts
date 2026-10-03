/**
 * Shared facts about a PairPath session, for every page that shows one.
 *
 * A session is either on an exercise from the bank (EXERCISE) or has no
 * question at all (FREE) - the pair writes whatever they like. Older responses
 * carry no `mode`, and every one of those is an exercise session.
 */

export type SessionMode = 'EXERCISE' | 'FREE';

export function isFreeSession(session: { mode?: string | null } | null | undefined): boolean {
  return session?.mode === 'FREE';
}

/** What a session is called in a heading or a list. */
export function sessionTitle(
  session: { mode?: string | null; question?: { title?: string } | null } | null | undefined,
): string {
  if (isFreeSession(session)) return 'Free coding';
  return session?.question?.title ?? 'Pair session';
}

/**
 * Where a free session's editor starts: an empty program that compiles.
 *
 * The code runner looks for a public class to compile, so a blank editor would
 * fail on the first Run with an error about a missing class - a strange first
 * thing to show a pair who have not written anything yet.
 */
export const FREE_STARTER_CODE = `public class Main {
    public static void main(String[] args) {

    }
}
`;
