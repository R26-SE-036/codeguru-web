/**
 * What each plan includes, stated once: the plans page compares from this, and
 * the downgrade warning lists what would be lost from it.
 *
 * Only features that exist, and only differences the proxy actually enforces
 * (lib/plan-gate.ts). A comparison table that promises what the app does not
 * do is a false advertisement, however small.
 */

export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  detail?: string;
  free: Cell;
  pro: Cell;
}

export interface FeatureGroup {
  area: 'Code Coach' | 'Study' | 'Practice' | 'Pair' | 'Your plan';
  tone: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    area: 'Code Coach',
    tone: 'text-hue-insight',
    rows: [
      { label: 'VS Code extension', detail: 'Underlines beginner mistakes in Java as you type', free: true, pro: true },
      { label: 'Three hint levels', detail: 'Concept, guidance and a targeted fix for your own line', free: true, pro: true },
      { label: 'Overview and Insights', detail: 'Your mastery, error patterns and fix rate', free: true, pro: true },
      { label: 'Report a wrong finding', free: true, pro: true },
    ],
  },
  {
    area: 'Study',
    tone: 'text-hue-study',
    rows: [
      { label: 'Lessons written for your mistakes', detail: 'With a worked example and a flowchart', free: '3 a month', pro: 'Unlimited' },
      { label: 'A quiz for every lesson', free: 'With each lesson', pro: 'Unlimited' },
      { label: 'Learning map', detail: 'Every concept: mastered, in progress, ready to start', free: false, pro: true },
      { label: 'Quiz history and mastery charts', free: false, pro: true },
      { label: 'Review-due reminders', free: false, pro: true },
    ],
  },
  {
    area: 'Practice',
    tone: 'text-hue-play',
    rows: [
      { label: 'Daily challenge', detail: 'One question a day, double XP', free: true, pro: true },
      { label: 'XP, levels, streaks and achievements', free: true, pro: true },
      { label: 'Free play', detail: 'Bug Hunt, Drag & Drop, Code Trace and Code Fix - any concept, any time', free: false, pro: true },
      { label: 'Rounds picked for your weakest concept', free: false, pro: true },
      { label: 'Leaderboards', detail: 'This week, all time and today', free: false, pro: true },
    ],
  },
  {
    area: 'Pair',
    tone: 'text-hue-pair',
    rows: [
      { label: 'Exercise sessions with a partner', free: true, pro: true },
      { label: 'Live collaboration nudges and hints', free: true, pro: true },
      { label: 'Review quiz and the model solution', free: true, pro: true },
      { label: 'Free coding', detail: 'No topic, no set task - build anything together', free: false, pro: true },
      { label: 'Your code beside the model solution', detail: 'Differing lines marked', free: false, pro: true },
      { label: 'Your path to the solution', detail: 'What to change, why, and what it would have done', free: false, pro: true },
      { label: 'Pair analytics', detail: "The model's reading of each session, and whether nudges helped", free: false, pro: true },
    ],
  },
  {
    area: 'Your plan',
    tone: 'text-muted',
    rows: [
      { label: 'Price', free: 'LKR 0', pro: 'From LKR 408 a month' },
      { label: 'Cancel or downgrade', free: '-', pro: 'Any time' },
    ],
  },
];

/** What a Pro student gives up by moving to Free, for the downgrade warning. */
export const PRO_ONLY: string[] = [
  'Unlimited lessons and quizzes (Free keeps 3 a month)',
  ...FEATURE_GROUPS.flatMap((group) =>
    group.area === 'Your plan' ? [] : group.rows.filter((row) => row.free === false).map((row) => row.label),
  ),
];

export const PLAN_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Is the VS Code extension really free?',
    a: 'Yes, always. Live mistake detection and every hint level are on the Free plan, and stay there.',
  },
  {
    q: 'How do I pay?',
    a: 'Through PayHere, by card. You type your card details on PayHere’s own page - Code Guru never sees or stores them.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from Plan & billing. Cancelling stops the renewal and you keep Pro until the end of what you paid for. You can resume before then.',
  },
  {
    q: 'What happens if I downgrade to Free?',
    a: 'You move to Free straight away and the renewal stops. Everything you have done is kept: your lessons, XP, achievements and pair sessions are all still there when you come back.',
  },
  {
    q: 'What does monthly or yearly mean?',
    a: 'Monthly renews every 30 days. Yearly is paid once for 365 days and costs the same as ten months.',
  },
  {
    q: 'What is the free lesson limit?',
    a: 'Free includes three Study lessons a month, with their quizzes. Opening the same lesson again does not count twice, and the three come back at midnight on the 1st.',
  },
];
