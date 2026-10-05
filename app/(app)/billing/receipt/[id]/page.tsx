'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

import { loadPlan, formatDate, type Billing, type Payment } from '@/lib/use-plan';
import { Brand } from '@/components/brand';
import { Card, buttonClass } from '@/components/ui';

/**
 * A receipt for one payment, ready to print or save as PDF.
 *
 * Built from the student's own payment record in Code Coach - the same list
 * the billing page shows - so it says exactly what was recorded and nothing
 * more. A demo payment says so on the receipt: no money moved for it.
 */
export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<{ billing: Billing | null; payment: Payment | null } | null>(null);

  useEffect(() => {
    loadPlan(true).then((billing) =>
      setState({ billing, payment: billing?.payments.find((p) => p.payment_id === id) ?? null }),
    );
  }, [id]);

  if (!state) return <div className="cg-skeleton mx-auto h-96 max-w-2xl" />;

  const { payment } = state;
  if (!payment) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="p-8 text-center text-body">That receipt could not be found.</Card>
        <Link href="/billing" className={buttonClass({ variant: 'secondary' })}>Back to billing</Link>
      </div>
    );
  }

  const demo = payment.provider === 'demo';
  const amount = payment.amount
    ? `${payment.currency} ${Number(payment.amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
    : '—';
  const rows: Array<[string, string]> = [
    ['Receipt number', payment.payment_id],
    ['Order', payment.order_id ?? '—'],
    ['Date', new Date(payment.created_at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })],
    ['Paid with', demo ? 'Demo payment (no card, no charge)' : `PayHere${payment.method ? ` · ${payment.method}` : ''}`],
    ...(payment.provider_payment_id ? [['PayHere payment ID', payment.provider_payment_id] as [string, string]] : []),
    ['Status', payment.status.charAt(0).toUpperCase() + payment.status.slice(1)],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap justify-between gap-2 print:hidden">
        <Link href="/billing" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft size={14} aria-hidden />
          Billing
        </Link>
        <button type="button" onClick={() => window.print()} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <Printer size={14} aria-hidden />
          Print or save as PDF
        </button>
      </div>

      <Card className="p-8 print:border-0 print:shadow-none sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <Brand />
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Receipt</p>
            <p className="mt-1 text-sm text-body">{formatDate(payment.created_at)}</p>
          </div>
        </div>

        <div className="py-6">
          <p className="text-sm text-muted">Amount</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink">{amount}</p>
          {demo && (
            <p className="mt-2 inline-block rounded-full bg-warn/10 px-3 py-1 text-xs font-semibold text-warn">
              Demonstration - no money was charged
            </p>
          )}
        </div>

        <div className="rounded-cg border border-line">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="font-semibold text-ink">{payment.description}</span>
            <span className="font-semibold text-ink">{amount}</span>
          </div>
          <dl className="divide-y divide-line text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="break-all text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Code Guru is a final-year research project. Card payments are processed by PayHere; Code Guru never receives
          or stores card details. {state.billing?.checkout.sandbox && !demo ? 'This payment was made in the PayHere sandbox with a test card.' : ''}
        </p>
      </Card>
    </div>
  );
}
