/**
 * KYC Status Page
 * Shows KYC approval workflow status and timeline
 * Reference: soupfinance-designs/invoice-approval-workflow/ (workflow timeline pattern)
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCorporate, listDocuments, listDirectors } from '../../api/endpoints/corporate';
import type { CorporateDocuments } from '../../types';

// Added: Document type labels for checklist
const DOCUMENT_LABELS: Record<CorporateDocuments['documentType'], string> = {
  CERTIFICATE_OF_INCORPORATION: 'Certificate of Incorporation',
  BOARD_RESOLUTION: 'Board Resolution',
  MEMORANDUM: 'Memorandum & Articles',
  PROOF_OF_ADDRESS: 'Proof of Address',
};

// Added: KYC status configuration
type KycStepStatus = 'completed' | 'current' | 'pending';

interface KycStep {
  id: string;
  label: string;
  description: string;
  status: KycStepStatus;
  completedAt?: string;
  completedBy?: string;
}

export function KycStatusPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const corporateId = searchParams.get('id');

  // Added: Fetch corporate data
  const { data: corporate, isLoading: corporateLoading } = useQuery({
    queryKey: ['corporate', corporateId],
    queryFn: () => getCorporate(corporateId!),
    enabled: !!corporateId,
  });

  // Added: Fetch documents for checklist
  const { data: documents = [] } = useQuery({
    queryKey: ['documents', corporateId],
    queryFn: () => listDocuments(corporateId!),
    enabled: !!corporateId,
  });

  // Added: Fetch directors for checklist
  const { data: directors = [] } = useQuery({
    queryKey: ['directors', corporateId],
    queryFn: () => listDirectors(corporateId!),
    enabled: !!corporateId,
  });

  // Added: Derive workflow steps from KYC status
  const getWorkflowSteps = (): KycStep[] => {
    const kycStatus = corporate?.kycStatus || 'PENDING';

    const steps: KycStep[] = [
      {
        id: 'submitted',
        label: 'Documents Submitted',
        description: 'KYC documents have been uploaded and submitted for review',
        status: 'completed',
        completedAt: corporate?.dateCreated,
        completedBy: 'System',
      },
      {
        id: 'compliance_review',
        label: 'Compliance Review',
        description: 'Compliance team reviewing submitted documents',
        status: kycStatus === 'PENDING' ? 'current' : 'completed',
      },
      {
        id: 'verification',
        label: 'Document Verification',
        description: 'Verifying authenticity of submitted documents',
        status: kycStatus === 'PENDING' ? 'pending' : kycStatus === 'APPROVED' ? 'completed' : 'current',
      },
      {
        id: 'approval',
        label: kycStatus === 'REJECTED' ? 'Application Rejected' : 'Application Approved',
        description:
          kycStatus === 'REJECTED'
            ? 'Your application requires additional information'
            : 'Your corporate account has been approved',
        status:
          kycStatus === 'APPROVED'
            ? 'completed'
            : kycStatus === 'REJECTED'
              ? 'completed'
              : 'pending',
      },
    ];

    return steps;
  };

  const steps = getWorkflowSteps();

  // Added: Get step icon
  const getStepIcon = (status: KycStepStatus, isRejected: boolean = false) => {
    if (status === 'completed') {
      if (isRejected) {
        return (
          <span className="material-symbols-outlined text-danger">cancel</span>
        );
      }
      return (
        <span className="material-symbols-outlined text-green-500">task_alt</span>
      );
    }
    if (status === 'current') {
      return (
        <span className="material-symbols-outlined text-primary animate-pulse">
          hourglass_top
        </span>
      );
    }
    return (
      <span className="material-symbols-outlined text-gray-400">
        radio_button_unchecked
      </span>
    );
  };

  if (corporateLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  const isApproved = corporate?.kycStatus === 'APPROVED';
  const isRejected = corporate?.kycStatus === 'REJECTED';

  return (
    <div className="flex flex-col gap-6" data-testid="kyc-status-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-border-light dark:border-border-dark">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            KYC Application Status
          </h1>
          <p className="text-subtle-text">
            {corporate?.name || 'Your company'} - Application #{corporateId?.slice(0, 8)}
          </p>
        </div>
        {isApproved && (
          <button
            onClick={() => navigate('/dashboard')}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 flex items-center gap-2"
          >
            Go to Dashboard
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        )}
        {isRejected && (
          <button
            onClick={() => navigate(`/onboarding/documents?id=${corporateId}`)}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 flex items-center gap-2"
          >
            Update Documents
            <span className="material-symbols-outlined text-base">edit_document</span>
          </button>
        )}
      </div>

      {/* Status Banner */}
      {isApproved && (
        <div className="p-4 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-2xl">
            verified
          </span>
          <div>
            <p className="font-bold text-green-800 dark:text-green-200">KYC Approved</p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your corporate account has been verified and approved. You can now access all
              features.
            </p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">
            error
          </span>
          <div>
            <p className="font-bold text-red-800 dark:text-red-200">Additional Information Required</p>
            <p className="text-sm text-red-700 dark:text-red-300">
              Please review the feedback below and update your documents accordingly.
            </p>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel: Workflow Timeline */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-6">
              Approval Workflow
            </h2>

            <div className="grid grid-cols-[32px_1fr] gap-x-2">
              {steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                const isRejectedStep = step.id === 'approval' && isRejected;

                return (
                  <div key={step.id} className="contents">
                    {/* Icon Column */}
                    <div className="flex flex-col items-center gap-1">
                      {index > 0 && (
                        <div className="w-[2px] bg-border-light dark:bg-border-dark h-1"></div>
                      )}
                      {getStepIcon(step.status, isRejectedStep)}
                      {!isLast && (
                        <div className="w-[2px] bg-border-light dark:bg-border-dark h-full grow"></div>
                      )}
                    </div>

                    {/* Content Column */}
                    <div className={`flex flex-col ${isLast ? '' : 'pb-6'}`}>
                      <p
                        className={`text-base font-medium ${
                          step.status === 'completed'
                            ? isRejectedStep
                              ? 'text-danger'
                              : 'text-text-light dark:text-text-dark'
                            : step.status === 'current'
                              ? 'text-primary font-bold'
                              : 'text-subtle-text'
                        }`}
                      >
                        {step.label}
                      </p>
                      <p
                        className={`text-sm ${
                          step.status === 'pending'
                            ? 'text-gray-400 dark:text-gray-600'
                            : 'text-subtle-text'
                        }`}
                      >
                        {step.description}
                      </p>
                      {step.completedAt && step.status === 'completed' && (
                        <p className="text-xs text-subtle-text mt-1">
                          {new Date(step.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel: Application Summary */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Company Summary */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Company Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-subtle-text">Company Name</p>
                <p className="font-medium text-text-light dark:text-text-dark">
                  {corporate?.name || '-'}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-subtle-text">Registration Number</p>
                <p className="font-medium text-text-light dark:text-text-dark">
                  {corporate?.certificateOfIncorporationNumber || '-'}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-subtle-text">Email</p>
                <p className="font-medium text-text-light dark:text-text-dark">
                  {corporate?.email || '-'}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-subtle-text">Phone</p>
                <p className="font-medium text-text-light dark:text-text-dark">
                  {corporate?.phoneNumber || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Document Checklist */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Document Checklist
            </h2>
            <div className="space-y-3">
              {Object.entries(DOCUMENT_LABELS).map(([type, label]) => {
                const doc = documents.find((d) => d.documentType === type);
                const isUploaded = !!doc;

                return (
                  <div
                    key={type}
                    className="flex items-center justify-between py-3 border-b border-border-light dark:border-border-dark last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`material-symbols-outlined ${
                          isUploaded ? 'text-green-500' : 'text-gray-400'
                        }`}
                      >
                        {isUploaded ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span
                        className={
                          isUploaded
                            ? 'text-text-light dark:text-text-dark'
                            : 'text-subtle-text'
                        }
                      >
                        {label}
                      </span>
                    </div>
                    {isUploaded && doc && (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        View
                        <span className="material-symbols-outlined text-base">open_in_new</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Directors List */}
          <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-4">
              Directors & Signatories ({directors.length})
            </h2>
            {directors.length === 0 ? (
              <p className="text-subtle-text">No directors added</p>
            ) : (
              <div className="space-y-3">
                {directors.map((director) => (
                  <div
                    key={director.id}
                    className="flex items-center justify-between py-3 border-b border-border-light dark:border-border-dark last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-primary font-bold">
                          {director.firstName[0]}
                          {director.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-text-light dark:text-text-dark">
                          {director.firstName} {director.lastName}
                        </p>
                        <p className="text-sm text-subtle-text">{director.email}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {director.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Next Steps */}
          <div className="bg-primary/10 dark:bg-primary/20 rounded-xl border border-primary/30 p-6">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              {isApproved ? 'What Happens Next?' : isRejected ? 'Action Required' : 'What Happens Next?'}
            </h2>
            {isApproved ? (
              <ul className="space-y-2 text-sm text-subtle-text">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    check
                  </span>
                  Your account is now fully activated
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    check
                  </span>
                  You can start creating invoices and managing your finances
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    check
                  </span>
                  All platform features are now available
                </li>
              </ul>
            ) : isRejected ? (
              <ul className="space-y-2 text-sm text-subtle-text">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-danger text-base mt-0.5">
                    priority_high
                  </span>
                  Review the compliance team's feedback
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-danger text-base mt-0.5">
                    priority_high
                  </span>
                  Upload any missing or corrected documents
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-danger text-base mt-0.5">
                    priority_high
                  </span>
                  Resubmit for review
                </li>
              </ul>
            ) : (
              <ul className="space-y-2 text-sm text-subtle-text">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    schedule
                  </span>
                  Our compliance team will review your documents within 2-3 business days
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    mail
                  </span>
                  You'll receive an email notification once the review is complete
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-primary text-base mt-0.5">
                    support_agent
                  </span>
                  Contact support if you have any questions
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
