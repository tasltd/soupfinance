/**
 * Scheduled Reports Page
 *
 * Added: Manage report schedules - create, edit, pause/resume, view history.
 * Reports are generated automatically (daily/weekly/monthly) and emailed to recipients.
 *
 * @see grails-app/controllers/soupbroker/finance/ReportScheduleController.groovy
 * @see grails-app/services/soupbroker/job/ReportScheduleJobService.groovy
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  toggleScheduleStatus,
  deleteSchedule,
  getScheduleHistory,
  REPORT_TYPE_LABELS,
  FREQUENCY_LABELS,
  DATE_RANGE_LABELS,
  type ReportSchedule,
  type ReportScheduleHistory,
  type SaveScheduleRequest,
  type UpdateScheduleRequest,
  type ReportType,
  type ScheduleFrequency,
  type DateRangeType,
  type ExportFormat,
  type ScheduleStatus,
} from '../../api/endpoints/report-schedules';

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    PAUSED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

// =============================================================================
// Schedule Form Modal
// =============================================================================

interface ScheduleFormProps {
  schedule?: ReportSchedule;
  onSubmit: (data: SaveScheduleRequest | UpdateScheduleRequest) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

function ScheduleFormModal({ schedule, onSubmit, onClose, isSubmitting }: ScheduleFormProps) {
  const [name, setName] = useState(schedule?.name || '');
  const [reportType, setReportType] = useState<ReportType>(schedule?.reportType || 'TRIAL_BALANCE');
  const [frequency, setFrequency] = useState<ScheduleFrequency>(schedule?.frequency || 'WEEKLY');
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>(schedule?.dateRangeType || 'LAST_MONTH');
  const [exportFormat, setExportFormat] = useState<ExportFormat>(schedule?.exportFormat || 'PDF');
  const [recipients, setRecipients] = useState(schedule?.recipients || '');
  const [emailSubject, setEmailSubject] = useState(schedule?.emailSubject || '');
  const [emailMessage, setEmailMessage] = useState(schedule?.emailMessage || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: SaveScheduleRequest = {
      name,
      reportType,
      frequency,
      dateRangeType,
      exportFormat,
      recipients,
      emailSubject: emailSubject || undefined,
      emailMessage: emailMessage || undefined,
    };
    if (schedule) {
      onSubmit({ ...payload, id: schedule.id } as UpdateScheduleRequest);
    } else {
      onSubmit(payload);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark">
          <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
            {schedule ? 'Edit Schedule' : 'New Schedule'}
          </h2>
          <button onClick={onClose} className="text-subtle-text hover:text-text-light dark:hover:text-text-dark">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Schedule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
              placeholder="e.g., Weekly Trial Balance"
            />
          </div>

          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
            >
              {Object.entries(REPORT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Frequency + Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
              >
                {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Date Range</label>
              <select
                value={dateRangeType}
                onChange={(e) => setDateRangeType(e.target.value as DateRangeType)}
                className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
              >
                {Object.entries(DATE_RANGE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export Format */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Export Format</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
            >
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel (XLSX)</option>
              <option value="CSV">CSV</option>
            </select>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Recipients</label>
            <input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
              placeholder="email1@example.com, email2@example.com"
            />
            <p className="text-xs text-subtle-text mt-1">Comma-separated email addresses</p>
          </div>

          {/* Email Subject */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Email Subject (optional)</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark"
              placeholder="Leave blank for default subject"
            />
          </div>

          {/* Email Message */}
          <div>
            <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">Email Message (optional)</label>
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark resize-none"
              placeholder="Optional message body for the email"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-background-light dark:hover:bg-background-dark"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : schedule ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// History Panel
// =============================================================================

interface HistoryPanelProps {
  scheduleId: string;
  scheduleName: string;
  onClose: () => void;
}

function HistoryPanel({ scheduleId, scheduleName, onClose }: HistoryPanelProps) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['schedule-history', scheduleId],
    queryFn: () => getScheduleHistory(scheduleId, { max: 20 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark">
          <div>
            <h2 className="text-xl font-bold text-text-light dark:text-text-dark">Execution History</h2>
            <p className="text-sm text-subtle-text">{scheduleName}</p>
          </div>
          <button onClick={onClose} className="text-subtle-text hover:text-text-light dark:hover:text-text-dark">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-center text-subtle-text py-8">No execution history yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((entry: ReportScheduleHistory) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border-light dark:border-border-dark"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {statusBadge(entry.status)}
                      <span className="text-sm text-subtle-text">{REPORT_TYPE_LABELS[entry.reportType]}</span>
                    </div>
                    <p className="text-xs text-subtle-text">
                      {entry.reportFromDate && entry.reportToDate
                        ? `${formatDate(entry.reportFromDate)} — ${formatDate(entry.reportToDate)}`
                        : 'No date range'}
                    </p>
                    {entry.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 line-clamp-2">{entry.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-subtle-text">
                    <p>{formatDate(entry.executedAt)}</p>
                    <p className="text-xs">{entry.exportFormat}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export function ScheduledReportsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ReportSchedule | undefined>();
  const [historySchedule, setHistorySchedule] = useState<{ id: string; name: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<ScheduleStatus | ''>('');

  // Added: Fetch schedules
  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ['report-schedules', filterStatus],
    queryFn: () => getSchedules({
      max: 50,
      sort: 'dateCreated',
      order: 'desc',
      ...(filterStatus ? { status: filterStatus } : {}),
    }),
  });

  // Added: Create mutation
  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      setShowForm(false);
    },
  });

  // Added: Update mutation
  const updateMutation = useMutation({
    mutationFn: updateSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      setShowForm(false);
      setEditSchedule(undefined);
    },
  });

  // Added: Toggle status mutation
  const toggleMutation = useMutation({
    mutationFn: toggleScheduleStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
  });

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
  });

  const handleSubmit = (data: SaveScheduleRequest | UpdateScheduleRequest) => {
    if ('id' in data) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (schedule: ReportSchedule) => {
    if (window.confirm(`Delete schedule "${schedule.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(schedule.id);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="scheduled-reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/reports" className="text-subtle-text hover:text-primary">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
              Scheduled Reports
            </h1>
          </div>
          <p className="text-subtle-text">Automate report generation and email delivery</p>
        </div>
        <button
          onClick={() => { setEditSchedule(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Schedule
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        {(['', 'ACTIVE', 'PAUSED', 'CANCELLED'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status as ScheduleStatus | '')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === status
                ? 'bg-primary text-white'
                : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark border border-border-light dark:border-border-dark hover:border-primary'
            }`}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      {/* Schedules List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          Failed to load schedules. Check that the Finance module is enabled for this tenant.
        </div>
      ) : !schedules || schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-subtle-text">
          <span className="material-symbols-outlined text-5xl">event_repeat</span>
          <p>No scheduled reports yet</p>
          <button
            onClick={() => { setEditSchedule(undefined); setShowForm(true); }}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90"
          >
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {schedules.map((schedule: ReportSchedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between p-5 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-text-light dark:text-text-dark">{schedule.name}</h3>
                  {statusBadge(schedule.status)}
                  {schedule.lastExecutionStatus && (
                    <span className="text-xs text-subtle-text">
                      Last run: {statusBadge(schedule.lastExecutionStatus)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-subtle-text">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">description</span>
                    {REPORT_TYPE_LABELS[schedule.reportType]}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {FREQUENCY_LABELS[schedule.frequency]}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">date_range</span>
                    {DATE_RANGE_LABELS[schedule.dateRangeType]}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">file_present</span>
                    {schedule.exportFormat}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-subtle-text">
                  {schedule.nextExecutionAt && (
                    <span>Next run: {formatDate(schedule.nextExecutionAt)}</span>
                  )}
                  {schedule.lastExecutedAt && (
                    <span>Last run: {formatDate(schedule.lastExecutedAt)}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistorySchedule({ id: schedule.id, name: schedule.name })}
                  className="p-2 rounded-lg text-subtle-text hover:text-primary hover:bg-background-light dark:hover:bg-background-dark"
                  title="View history"
                >
                  <span className="material-symbols-outlined text-xl">history</span>
                </button>
                <button
                  onClick={() => toggleMutation.mutate(schedule.id)}
                  className="p-2 rounded-lg text-subtle-text hover:text-primary hover:bg-background-light dark:hover:bg-background-dark"
                  title={schedule.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                >
                  <span className="material-symbols-outlined text-xl">
                    {schedule.status === 'ACTIVE' ? 'pause_circle' : 'play_circle'}
                  </span>
                </button>
                <button
                  onClick={() => { setEditSchedule(schedule); setShowForm(true); }}
                  className="p-2 rounded-lg text-subtle-text hover:text-primary hover:bg-background-light dark:hover:bg-background-dark"
                  title="Edit"
                >
                  <span className="material-symbols-outlined text-xl">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(schedule)}
                  className="p-2 rounded-lg text-subtle-text hover:text-red-500 hover:bg-background-light dark:hover:bg-background-dark"
                  title="Delete"
                >
                  <span className="material-symbols-outlined text-xl">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ScheduleFormModal
          schedule={editSchedule}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditSchedule(undefined); }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* History Modal */}
      {historySchedule && (
        <HistoryPanel
          scheduleId={historySchedule.id}
          scheduleName={historySchedule.name}
          onClose={() => setHistorySchedule(null)}
        />
      )}
    </div>
  );
}
