/**
 * Payment receipt helpers.
 *
 * Added (SOUPFIN-179): BillPayment.paymentReceipt is a SoupBrokerFile. The
 * form sends the file as a base64 `data:` URI in the JSON body
 * (.claude/rules/soupfinance-api-json.md); the backend file utility turns that
 * string into a SoupBrokerFile record. InvoicePayment has no receipt field,
 * so only outgoing (bill) payments carry one.
 */

/** MIME types the dropzone accepts. Matches the payment-entry-form design. */
export const RECEIPT_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

/** `accept` attribute for the file input. Extensions cover browsers that report no MIME type. */
export const RECEIPT_ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

/** 5 MB, the limit printed on the dropzone. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * MIME type of a receipt file: the browser's own value, or one inferred from
 * the extension when the browser reports none.
 */
export function receiptMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? '';
}

/** File extension for a downloaded receipt, from its content type. Empty when unknown. */
export function receiptExtension(contentType: string): string {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const ext = Object.entries(EXTENSION_TYPES).find(([, mime]) => mime === type)?.[0];
  return ext ? `.${ext}` : '';
}

/** Human-readable size, e.g. "1.2 MB" or "640 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Checks a picked file against the dropzone rules.
 * Returns the message to show, or null when the file is acceptable.
 */
export function validateReceiptFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const type = receiptMimeType(file);
  if (!(RECEIPT_ACCEPTED_TYPES as readonly string[]).includes(type)) {
    return `${file.name} is not a PDF, PNG or JPG file.`;
  }
  if (file.size === 0) {
    return `${file.name} is empty. Choose another file.`;
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return `${file.name} is ${formatFileSize(file.size)}. Receipts must be 5 MB or smaller.`;
  }
  return null;
}

/**
 * Reads a file as a `data:<mime>;base64,<payload>` URI.
 * The MIME part uses receiptMimeType so a file with no browser type still
 * carries one.
 */
export function readReceiptAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma < 0) {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      resolve(`data:${receiptMimeType(file)};base64,${result.slice(comma + 1)}`);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
