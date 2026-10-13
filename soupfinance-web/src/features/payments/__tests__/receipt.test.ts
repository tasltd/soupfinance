/**
 * SOUPFIN-179: receipt file rules and the base64 data URI sent to the backend.
 */
import { describe, it, expect } from 'vitest';
import {
  RECEIPT_MAX_BYTES,
  formatFileSize,
  receiptExtension,
  readReceiptAsDataUrl,
  receiptMimeType,
  validateReceiptFile,
} from '../receipt';

function sized(name: string, type: string, size: number) {
  return { name, type, size };
}

describe('validateReceiptFile', () => {
  it.each([
    ['receipt.pdf', 'application/pdf'],
    ['receipt.png', 'image/png'],
    ['receipt.jpg', 'image/jpeg'],
  ])('accepts %s', (name, type) => {
    expect(validateReceiptFile(sized(name, type, 1024))).toBeNull();
  });

  it('accepts a file of exactly 5 MB', () => {
    expect(validateReceiptFile(sized('big.pdf', 'application/pdf', RECEIPT_MAX_BYTES))).toBeNull();
  });

  it('rejects one byte over 5 MB and names the size', () => {
    const message = validateReceiptFile(sized('big.pdf', 'application/pdf', RECEIPT_MAX_BYTES + 1));
    expect(message).toBe('big.pdf is 5.0 MB. Receipts must be 5 MB or smaller.');
  });

  it('rejects a file ten times the limit', () => {
    expect(validateReceiptFile(sized('scan.png', 'image/png', RECEIPT_MAX_BYTES * 10))).toMatch(
      /^scan\.png is 50\.0 MB\./
    );
  });

  it('rejects an empty file', () => {
    expect(validateReceiptFile(sized('blank.pdf', 'application/pdf', 0))).toBe(
      'blank.pdf is empty. Choose another file.'
    );
  });

  it.each([
    ['notes.txt', 'text/plain'],
    ['photo.gif', 'image/gif'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['noext', ''],
  ])('rejects %s', (name, type) => {
    expect(validateReceiptFile(sized(name, type, 10))).toBe(`${name} is not a PDF, PNG or JPG file.`);
  });

  it('accepts a PDF whose browser type is blank, by extension', () => {
    expect(validateReceiptFile(sized('RECEIPT.PDF', '', 10))).toBeNull();
  });
});

describe('receiptMimeType', () => {
  it('prefers the browser type', () => {
    expect(receiptMimeType({ name: 'x.pdf', type: 'image/png' })).toBe('image/png');
  });
  it('infers jpeg from either extension', () => {
    expect(receiptMimeType({ name: 'a.jpg', type: '' })).toBe('image/jpeg');
    expect(receiptMimeType({ name: 'a.JPEG', type: '' })).toBe('image/jpeg');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(640 * 1024)).toBe('640 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1.3 MB');
  });
});

describe('readReceiptAsDataUrl', () => {
  it('returns a data URI whose payload decodes to the original bytes', async () => {
    const content = '%PDF-1.4 SOUPFIN-179 receipt';
    const file = new File([content], 'receipt.pdf', { type: 'application/pdf' });
    const dataUrl = await readReceiptAsDataUrl(file);
    expect(dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(atob(dataUrl.split(',')[1])).toBe(content);
  });

  it('labels a file with no browser type by its extension', async () => {
    const file = new File(['png-bytes'], 'scan.png', { type: '' });
    const dataUrl = await readReceiptAsDataUrl(file);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(atob(dataUrl.split(',')[1])).toBe('png-bytes');
  });
});

describe('receiptExtension', () => {
  it('maps the stored content type to an extension', () => {
    expect(receiptExtension('application/pdf')).toBe('.pdf');
    expect(receiptExtension('image/png')).toBe('.png');
    expect(receiptExtension('image/jpeg')).toBe('.jpg');
    expect(receiptExtension('application/pdf;charset=UTF-8')).toBe('.pdf');
  });
  it('adds nothing for an unknown or missing type', () => {
    expect(receiptExtension('')).toBe('');
    expect(receiptExtension('application/octet-stream')).toBe('');
  });
});
