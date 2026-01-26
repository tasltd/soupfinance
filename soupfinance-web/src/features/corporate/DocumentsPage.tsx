/**
 * Documents Upload Page
 * KYC document upload for corporate onboarding
 * Reference: soupfinance-designs/payment-entry-form/ (file upload dropzone pattern)
 */
import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDocuments, uploadDocument, deleteDocument, submitKyc } from '../../api/endpoints/corporate';
import type { CorporateDocuments } from '../../types';

// Added: Document type configuration
const DOCUMENT_TYPES: {
  type: CorporateDocuments['documentType'];
  label: string;
  description: string;
  required: boolean;
}[] = [
  {
    type: 'CERTIFICATE_OF_INCORPORATION',
    label: 'Certificate of Incorporation',
    description: 'Official document proving company registration',
    required: true,
  },
  {
    type: 'BOARD_RESOLUTION',
    label: 'Board Resolution',
    description: 'Authorization to open and operate the account',
    required: true,
  },
  {
    type: 'MEMORANDUM',
    label: 'Memorandum & Articles',
    description: 'Company constitution and bylaws',
    required: false,
  },
  {
    type: 'PROOF_OF_ADDRESS',
    label: 'Proof of Address',
    description: 'Utility bill or bank statement (less than 3 months old)',
    required: true,
  },
];

export function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const corporateId = searchParams.get('id');
  const queryClient = useQueryClient();

  // Added: Upload state per document type
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [dragOverType, setDragOverType] = useState<string | null>(null);

  // Added: Fetch existing documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', corporateId],
    queryFn: () => listDocuments(corporateId!),
    enabled: !!corporateId,
  });

  // Added: Upload mutation
  const uploadMutation = useMutation({
    mutationFn: ({
      file,
      documentType,
    }: {
      file: File;
      documentType: CorporateDocuments['documentType'];
    }) => uploadDocument(corporateId!, file, documentType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', corporateId] });
      setUploadingType(null);
    },
    onError: () => {
      setUploadingType(null);
    },
  });

  // Added: Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', corporateId] });
    },
  });

  // Added: Submit KYC mutation
  const submitMutation = useMutation({
    mutationFn: () => submitKyc(corporateId!),
    onSuccess: () => {
      navigate(`/onboarding/status?id=${corporateId}`);
    },
  });

  // Added: File upload handler
  const handleFileUpload = useCallback(
    (file: File, documentType: CorporateDocuments['documentType']) => {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        alert('Only PDF, PNG, JPG, or GIF files are allowed');
        return;
      }

      setUploadingType(documentType);
      uploadMutation.mutate({ file, documentType });
    },
    [uploadMutation]
  );

  // Added: Drag and drop handlers
  const handleDragOver = (e: React.DragEvent, documentType: string) => {
    e.preventDefault();
    setDragOverType(documentType);
  };

  const handleDragLeave = () => {
    setDragOverType(null);
  };

  const handleDrop = (e: React.DragEvent, documentType: CorporateDocuments['documentType']) => {
    e.preventDefault();
    setDragOverType(null);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file, documentType);
    }
  };

  // Added: File input handler
  const handleFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    documentType: CorporateDocuments['documentType']
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, documentType);
    }
    // Reset input value to allow re-uploading same file
    e.target.value = '';
  };

  // Added: Get uploaded document for a type
  const getUploadedDocument = (type: CorporateDocuments['documentType']) => {
    return documents.find((doc) => doc.documentType === type);
  };

  // Added: Check if all required documents are uploaded
  const requiredDocsUploaded = DOCUMENT_TYPES.filter((dt) => dt.required).every((dt) =>
    getUploadedDocument(dt.type)
  );

  // Added: Navigation handlers
  const handleBack = () => {
    navigate(`/onboarding/directors?id=${corporateId}`);
  };

  const handleSubmit = () => {
    if (requiredDocsUploaded) {
      submitMutation.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="documents-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            KYC Documents
          </h1>
          <p className="text-subtle-text">Upload required documents for verification</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={!requiredDocsUploaded || submitMutation.isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {submitMutation.isPending ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">
                  progress_activity
                </span>
                Submitting...
              </>
            ) : (
              <>
                Submit for Review
                <span className="material-symbols-outlined text-base">send</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center justify-center size-6 rounded-full bg-green-500 text-white text-xs font-bold">
          <span className="material-symbols-outlined text-sm">check</span>
        </span>
        <span className="text-green-600 font-medium">Registration</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-green-500 text-white text-xs font-bold">
          <span className="material-symbols-outlined text-sm">check</span>
        </span>
        <span className="text-green-600 font-medium">Company Info</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-green-500 text-white text-xs font-bold">
          <span className="material-symbols-outlined text-sm">check</span>
        </span>
        <span className="text-green-600 font-medium">Directors</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-primary text-white text-xs font-bold">
          4
        </span>
        <span className="text-primary font-medium">Documents</span>
      </div>

      {/* Required Documents Notice */}
      {!requiredDocsUploaded && (
        <div className="p-4 rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-orange-600 dark:text-orange-400">
            warning
          </span>
          <p className="text-sm text-orange-800 dark:text-orange-200">
            Please upload all required documents marked with <span className="text-danger">*</span>{' '}
            before submitting for review.
          </p>
        </div>
      )}

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DOCUMENT_TYPES.map((docType) => {
            const uploadedDoc = getUploadedDocument(docType.type);
            const isUploading = uploadingType === docType.type;
            const isDragOver = dragOverType === docType.type;

            return (
              <div
                key={docType.type}
                className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden"
              >
                {/* Document Header */}
                <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-text-light dark:text-text-dark flex items-center gap-2">
                        {docType.label}
                        {docType.required && <span className="text-danger">*</span>}
                      </h3>
                      <p className="text-sm text-subtle-text mt-1">{docType.description}</p>
                    </div>
                    {uploadedDoc && (
                      <span className="flex items-center justify-center size-6 rounded-full bg-green-500 text-white">
                        <span className="material-symbols-outlined text-sm">check</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Upload Area or Uploaded File */}
                <div className="p-6">
                  {uploadedDoc ? (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-background-light dark:bg-background-dark">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-2xl">
                          description
                        </span>
                        <div>
                          <p className="text-sm font-medium text-text-light dark:text-text-dark truncate max-w-[200px]">
                            {uploadedDoc.fileName}
                          </p>
                          <p className="text-xs text-subtle-text">
                            Uploaded{' '}
                            {uploadedDoc.dateCreated &&
                              new Date(uploadedDoc.dateCreated).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={uploadedDoc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-symbols-outlined text-xl">visibility</span>
                        </a>
                        <button
                          onClick={() => deleteMutation.mutate(uploadedDoc.id)}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-full hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        isDragOver
                          ? 'border-primary bg-primary/10'
                          : 'border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark hover:bg-primary/5'
                      }`}
                      onDragOver={(e) => handleDragOver(e, docType.type)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, docType.type)}
                    >
                      {isUploading ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="material-symbols-outlined animate-spin text-primary text-3xl mb-2">
                            progress_activity
                          </span>
                          <p className="text-sm text-primary font-medium">Uploading...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <span className="material-symbols-outlined text-subtle-text text-3xl mb-2">
                            cloud_upload
                          </span>
                          <p className="mb-2 text-sm text-subtle-text">
                            <span className="font-semibold text-primary">Click to upload</span> or
                            drag and drop
                          </p>
                          <p className="text-xs text-subtle-text">PDF, PNG, JPG or GIF (MAX. 5MB)</p>
                        </div>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.gif"
                        onChange={(e) => handleFileInputChange(e, docType.type)}
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Additional Documents Section */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6">
        <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
          Additional Information
        </h3>
        <p className="text-sm text-subtle-text mb-4">
          Director ID copies should be uploaded via the Directors page. Each director can have their
          ID document attached to their profile.
        </p>
        <button
          onClick={() => navigate(`/onboarding/directors?id=${corporateId}`)}
          className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
        >
          Go to Directors
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
