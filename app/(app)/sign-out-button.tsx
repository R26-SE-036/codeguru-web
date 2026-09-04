'use client';

import { signOut } from '@/lib/api';

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="rounded-cg border border-line px-3 py-1.5 text-sm text-body transition hover:bg-card-alt hover:text-ink"
    >
      Sign out
    </button>
  );
}
