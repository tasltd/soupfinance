/**
 * Added (SOUPFIN-159): the Before / After table for one audit event.
 */
import { propertyLabel } from '../../api/endpoints/auditTrail';
import type { AuditChange } from '../../types/auditTrail';

interface AuditChangeTableProps {
  changes: AuditChange[];
  testId?: string;
}

export function AuditChangeTable({ changes, testId = 'audit-changes' }: AuditChangeTableProps) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border-light dark:border-border-dark" data-testid={testId}>
      <table className="w-full text-xs text-left">
        <thead className="uppercase text-subtle-text bg-background-light dark:bg-background-dark">
          <tr>
            <th scope="col" className="px-3 py-2">Field</th>
            <th scope="col" className="px-3 py-2">Before</th>
            <th scope="col" className="px-3 py-2">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.property} className="border-t border-border-light dark:border-border-dark align-top">
              <td className="px-3 py-2 font-medium text-text-light dark:text-text-dark whitespace-nowrap">
                {propertyLabel(change.property)}
              </td>
              <td className="px-3 py-2 text-subtle-text break-all">{change.oldValue ?? '—'}</td>
              <td className="px-3 py-2 text-text-light dark:text-text-dark break-all">{change.newValue ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
