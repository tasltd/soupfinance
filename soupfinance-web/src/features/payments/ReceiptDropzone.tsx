/**
 * Receipt dropzone for the payment form.
 * Reference: soupfinance-designs/payment-entry-form/ (dropzone)
 *
 * Added (SOUPFIN-179): click or drag a PDF, PNG or JPG of up to 5 MB. The
 * parent owns the chosen file; this component only validates and reports it.
 */
import { useId, useRef, useState } from 'react';
import { RECEIPT_ACCEPT_ATTR, formatFileSize, validateReceiptFile } from './receipt';

interface ReceiptDropzoneProps {
  file: File | null;
  error: string;
  disabled?: boolean;
  /** Called with a file that passed validation. */
  onSelect: (file: File) => void;
  /** Called with the message for a file that failed validation. */
  onReject: (message: string) => void;
  onRemove: () => void;
}

export function ReceiptDropzone({ file, error, disabled, onSelect, onReject, onRemove }: ReceiptDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    const message = validateReceiptFile(picked);
    if (message) onReject(message);
    else onSelect(picked);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="receipt-field">
      <label htmlFor={inputId} className="text-sm font-medium text-text-light dark:text-text-dark">
        Payment Receipt
      </label>
      {file ? (
        <div
          className="flex items-center gap-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark px-4 py-3"
          data-testid="receipt-selected"
        >
          <span className="material-symbols-outlined text-primary">
            {file.type.startsWith('image/') ? 'image' : 'picture_as_pdf'}
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium text-text-light dark:text-text-dark truncate" data-testid="receipt-file-name">
              {file.name}
            </span>
            <span className="text-xs text-subtle-text">{formatFileSize(file.size)}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onRemove();
              if (inputRef.current) inputRef.current.value = '';
            }}
            disabled={disabled}
            className="flex size-8 items-center justify-center rounded-full text-subtle-text hover:bg-black/10 dark:hover:bg-white/10"
            aria-label={`Remove ${file.name}`}
            data-testid="receipt-remove"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-border-light dark:border-border-dark bg-[#f5f1f0] dark:bg-background-dark hover:bg-primary/5'
          }`}
          data-testid="receipt-dropzone"
        >
          <span className="material-symbols-outlined text-subtle-text mb-2">cloud_upload</span>
          <p className="text-sm text-subtle-text">
            <span className="font-semibold text-text-light dark:text-text-dark">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-subtle-text">PDF, PNG or JPG (max. 5 MB)</p>
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={RECEIPT_ACCEPT_ATTR}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        data-testid="receipt-input"
      />
      {error && (
        <p className="text-sm text-danger" role="alert" data-testid="receipt-error">
          {error}
        </p>
      )}
    </div>
  );
}
