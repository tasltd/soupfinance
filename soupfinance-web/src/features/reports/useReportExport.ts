/**
 * Added (SOUPFIN-103): one export implementation for every report.
 *
 * Each report page used to carry its own copy of this logic, and the copies had
 * drifted: only two had the SOUPFIN-14 timeout and error banner, the rest
 * failed silently into the console. The behaviour now lives here once:
 *
 * - one export at a time (double clicks are ignored);
 * - a 60 s timeout, so a hung backend export still ends;
 * - a visible error message instead of a console log;
 * - the SOUPFIN-60 format mapping (xlsx goes out as f=excel, saved as .xls);
 * - a browser-built file when the page provides one (Cash Flow's CSV).
 */
import { useCallback, useState } from 'react';
import {
  exportFinanceReport,
  getReportExtension,
  type ExportFormat,
  type ReportFilters,
} from '../../api/endpoints/reports';
import type { ReportDefinition } from './reportRegistry';

/** Export formats a page builds in the browser instead of asking the backend. */
export type ClientExports = Partial<Record<ExportFormat, () => Blob>>;

// Fix (SOUPFIN-14): hard timeout for hung exports.
export const EXPORT_TIMEOUT_MS = 60_000;

/**
 * Download name for a report export.
 * Range reports: `profit-loss-2026-08-01-to-2026-08-31.pdf`.
 * As-of reports: `balance-sheet-2026-08-31.pdf`.
 */
export function buildExportFilename(
  definition: Pick<ReportDefinition, 'export' | 'page'>,
  filters: Pick<ReportFilters, 'from' | 'to'>,
  format: ExportFormat
): string {
  const extension = getReportExtension(format);
  const dates =
    definition.page.dateMode === 'asOf' ? filters.to : `${filters.from}-to-${filters.to}`;
  return `${definition.export.fileStem}-${dates}.${extension}`;
}

/** Save a Blob as a file through a temporary link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** True when a format can be exported: by the backend or by the page. */
export function canExport(
  definition: ReportDefinition,
  format: ExportFormat,
  clientExports?: ClientExports
): boolean {
  return Boolean(clientExports?.[format] || definition.export.backendType);
}

export interface ReportExportState {
  exportingFormat: ExportFormat | null;
  exportError: string | null;
  clearExportError: () => void;
  runExport: (format: ExportFormat) => Promise<void>;
}

export function useReportExport(
  definition: ReportDefinition,
  filters: ReportFilters,
  clientExports?: ClientExports
): ReportExportState {
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (exportingFormat) return;
      setExportingFormat(format);
      setExportError(null);

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const buildInBrowser = clientExports?.[format];
        let blob: Blob;
        if (buildInBrowser) {
          blob = buildInBrowser();
        } else if (definition.export.backendType) {
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error('Export timed out. The report is taking too long, so try a narrower date range.')
                ),
              EXPORT_TIMEOUT_MS
            );
          });
          blob = await Promise.race([
            exportFinanceReport(definition.export.backendType, filters, format),
            timeout,
          ]);
        } else {
          throw new Error(`${format.toUpperCase()} export is not available for this report yet.`);
        }
        downloadBlob(blob, buildExportFilename(definition, filters, format));
      } catch (err) {
        console.error('Export failed:', err);
        setExportError(err instanceof Error ? err.message : 'Export failed. Please try again.');
      } finally {
        if (timer) clearTimeout(timer);
        setExportingFormat(null);
      }
    },
    [exportingFormat, clientExports, definition, filters]
  );

  return {
    exportingFormat,
    exportError,
    clearExportError: () => setExportError(null),
    runExport,
  };
}
