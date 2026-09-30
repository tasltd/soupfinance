/**
 * SOUPFIN-89 — generatePdfFromHtml handed html2pdf.js an element it could not see
 *
 * html2pdf.js renders a clone of the element passed to `.from()`, and the clone
 * keeps that element's inline styles. The old code hid that same element with
 * `position:absolute; left:-9999px`, so the clone rendered 9999px out of frame
 * and every PDF was a blank page. These tests pin the contract that fixes it:
 * the element html2pdf receives is attached, carries the template, and has no
 * inline offset of its own. The browser-level proof (a real PDF with ink on
 * the page) is e2e/soupfin-89-invoice-pdf.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Invoice } from '../../../types';

interface Seen {
  element: HTMLElement;
  connected: boolean;
  inlineLeft: string;
  inlinePosition: string;
  html: string;
}

const seen: Seen[] = [];
let failWith: Error | null = null;
const pdfBlob = new Blob(['%PDF-1.3 fake'], { type: 'application/pdf' });

// A chainable stand-in for html2pdf.js that records what it was asked to
// render at the moment it renders, which is when the real library clones it.
vi.mock('html2pdf.js', () => ({
  default: () => {
    let source: HTMLElement | null = null;
    const worker = {
      from(el: HTMLElement) {
        source = el;
        return worker;
      },
      set() {
        return worker;
      },
      async output() {
        const el = source!;
        seen.push({
          element: el,
          connected: el.isConnected,
          inlineLeft: el.style.left,
          inlinePosition: el.style.position,
          html: el.innerHTML,
        });
        if (failWith) throw failWith;
        return pdfBlob;
      },
    };
    return worker;
  },
}));

import { generatePdfFromHtml, generateInvoicePdfBlob } from '..';

const format = (amount: number | null | undefined) => `GHS ${(amount ?? 0).toFixed(2)}`;

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-089',
    number: 1089,
    invoiceDate: '2026-09-30',
    paymentDate: '2026-10-30',
    status: 'SENT',
    accountServices: { id: 'as-1', serialised: 'Zenith Retail Ltd' },
    invoiceItemList: [
      { id: 'ii-1', description: 'Advisory retainer', quantity: 2, unitPrice: 1500 },
    ],
    subtotal: 3000,
    taxAmount: 450,
    totalAmount: 3450,
    amountPaid: 0,
    amountDue: 3450,
    ...overrides,
  } as Invoice;
}

describe('generatePdfFromHtml (SOUPFIN-89)', () => {
  beforeEach(() => {
    seen.length = 0;
    failWith = null;
    document.body.innerHTML = '';
  });

  it('hands html2pdf an attached element with no off-screen offset of its own', async () => {
    const blob = await generatePdfFromHtml('<div class="page"><h1>INVOICE</h1></div>');

    expect(blob).toBe(pdfBlob);
    expect(seen).toHaveLength(1);
    const [{ element, connected, inlineLeft, inlinePosition, html }] = seen;
    // The clone inherits these; any offset here moves the clone out of frame.
    expect(inlineLeft).toBe('');
    expect(inlinePosition).toBe('');
    expect(element.getAttribute('style')).toBeNull();
    // Attached, so the template's <style> block applies while it is cloned.
    expect(connected).toBe(true);
    expect(html).toContain('<h1>INVOICE</h1>');
  });

  it('keeps the live copy off-screen by hiding a wrapper, not the rendered element', async () => {
    await generatePdfFromHtml('<p>hidden from the user</p>');

    const holder = seen[0].element.parentElement!;
    expect(holder.parentElement).toBeNull(); // removed again afterwards
    expect(holder.style.position).toBe('absolute');
    expect(holder.style.left).toBe('-9999px');
  });

  it('leaves nothing behind in the page once the PDF is produced', async () => {
    document.body.innerHTML = '<main id="app">app</main>';

    await generatePdfFromHtml('<p>one</p>');
    await generatePdfFromHtml('<p>two</p>');

    expect(document.body.innerHTML).toBe('<main id="app">app</main>');
  });

  it('cleans up and rethrows when html2pdf fails', async () => {
    failWith = new Error('canvas exploded');

    await expect(generatePdfFromHtml('<p>x</p>')).rejects.toThrow('canvas exploded');
    expect(document.body.children).toHaveLength(0);
  });

  it('renders an empty HTML string without throwing (zero edge)', async () => {
    await expect(generatePdfFromHtml('')).resolves.toBe(pdfBlob);
    expect(seen[0].html).toBe('');
    expect(seen[0].inlineLeft).toBe('');
  });
});

describe('generateInvoicePdfBlob (SOUPFIN-89)', () => {
  beforeEach(() => {
    seen.length = 0;
    failWith = null;
    document.body.innerHTML = '';
  });

  it('renders the invoice number, client, lines and totals into the element html2pdf draws', async () => {
    const blob = await generateInvoicePdfBlob(makeInvoice(), { name: 'BrightPath Consulting Ltd' }, format);

    expect(blob).toBe(pdfBlob);
    const { html, inlineLeft } = seen[0];
    expect(inlineLeft).toBe('');
    expect(html).toContain('BrightPath Consulting Ltd');
    expect(html).toContain('1089');
    expect(html).toContain('Zenith Retail Ltd');
    expect(html).toContain('Advisory retainer');
    expect(html).toContain('GHS 3000.00'); // line amount 2 x 1500
    expect(html).toContain('GHS 3450.00'); // total and balance due
  });

  it('renders an invoice with no line items (zero edge)', async () => {
    await generateInvoicePdfBlob(makeInvoice({ invoiceItemList: [] }), { name: 'Co' }, format);

    const { html } = seen[0];
    expect(html).toContain('INVOICE');
    expect(html).toContain('Balance Due');
    expect(seen[0].element.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('renders every row of a 500-line invoice (overflow edge)', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => ({
      id: `ii-${i}`,
      description: `Line ${i + 1} ${'x'.repeat(200)}`,
      quantity: 1,
      unitPrice: 1_000_000 + i,
    }));

    await generateInvoicePdfBlob(makeInvoice({ invoiceItemList: lines }), { name: 'Co' }, format);

    const rows = seen[0].element.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(500);
    expect(rows[499].textContent).toContain('Line 500');
    expect(seen[0].inlineLeft).toBe('');
  });

  it('escapes client text instead of injecting it into the rendered element', async () => {
    await generateInvoicePdfBlob(
      makeInvoice({ accountServices: { id: 'as-1', serialised: '<img src=x onerror=alert(1)>' } }),
      { name: 'Co' },
      format
    );

    expect(seen[0].element.querySelector('img')).toBeNull();
    expect(seen[0].html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
