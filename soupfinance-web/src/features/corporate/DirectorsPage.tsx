/**
 * Directors/Signatories Page
 * Manage corporate directors and signatories for KYC
 * Reference: soupfinance-designs/vendor-client-management/ (CRUD list pattern)
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDirectors, addDirector, updateDirector, deleteDirector } from '../../api/endpoints/corporate';
import type { CorporateAccountPerson } from '../../types';

// Added: Role options for directors
const ROLE_OPTIONS: { value: CorporateAccountPerson['role']; label: string }[] = [
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'SIGNATORY', label: 'Authorized Signatory' },
  { value: 'BENEFICIAL_OWNER', label: 'Beneficial Owner' },
];

// Added: Empty form state
const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  role: 'DIRECTOR' as CorporateAccountPerson['role'],
};

export function DirectorsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const corporateId = searchParams.get('id');
  const queryClient = useQueryClient();

  // Added: Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDirector, setEditingDirector] = useState<CorporateAccountPerson | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Added: Fetch directors list
  const { data: directors = [], isLoading } = useQuery({
    queryKey: ['directors', corporateId],
    queryFn: () => listDirectors(corporateId!),
    enabled: !!corporateId,
  });

  // Added: Add director mutation
  const addMutation = useMutation({
    mutationFn: addDirector,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directors', corporateId] });
      handleCloseModal();
    },
  });

  // Added: Update director mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CorporateAccountPerson> }) =>
      updateDirector(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directors', corporateId] });
      handleCloseModal();
    },
  });

  // Added: Delete director mutation
  const deleteMutation = useMutation({
    mutationFn: deleteDirector,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directors', corporateId] });
      setDeleteConfirmId(null);
    },
  });

  // Added: Form handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenAddModal = () => {
    setEditingDirector(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (director: CorporateAccountPerson) => {
    setEditingDirector(director);
    setFormData({
      firstName: director.firstName,
      lastName: director.lastName,
      email: director.email,
      phoneNumber: director.phoneNumber,
      role: director.role,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDirector(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingDirector) {
      updateMutation.mutate({
        id: editingDirector.id,
        data: formData,
      });
    } else {
      addMutation.mutate({
        ...formData,
        corporate: { id: corporateId! },
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  // Added: Navigation handlers
  const handleBack = () => {
    navigate(`/onboarding/company?id=${corporateId}`);
  };

  const handleContinue = () => {
    navigate(`/onboarding/documents?id=${corporateId}`);
  };

  const isPending = addMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6" data-testid="directors-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark">
            Directors & Signatories
          </h1>
          <p className="text-subtle-text">
            Add directors, authorized signatories, and beneficial owners
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={directors.length === 0}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            Continue to Documents
            <span className="material-symbols-outlined text-base">arrow_forward</span>
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
        <span className="flex items-center justify-center size-6 rounded-full bg-primary text-white text-xs font-bold">
          3
        </span>
        <span className="text-primary font-medium">Directors</span>
        <span className="material-symbols-outlined text-subtle-text">chevron_right</span>
        <span className="flex items-center justify-center size-6 rounded-full bg-border-light text-subtle-text text-xs font-bold">
          4
        </span>
        <span className="text-subtle-text">Documents</span>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <p className="text-sm text-subtle-text">
          {directors.length} {directors.length === 1 ? 'person' : 'people'} added
        </p>
        <button
          onClick={handleOpenAddModal}
          className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Person
        </button>
      </div>

      {/* Directors Table */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
              progress_activity
            </span>
          </div>
        ) : directors.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-subtle-text mb-4">
              person_add
            </span>
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
              No directors added yet
            </h3>
            <p className="text-subtle-text mb-4 max-w-md">
              Add at least one director or authorized signatory to continue with the KYC process.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add First Person
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light dark:divide-border-dark">
                {directors.map((director) => (
                  <tr
                    key={director.id}
                    className="hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-text-light dark:text-text-dark">
                      {director.firstName} {director.lastName}
                    </td>
                    <td className="px-6 py-4 text-subtle-text">{director.email}</td>
                    <td className="px-6 py-4 text-subtle-text">{director.phoneNumber}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          director.role === 'DIRECTOR'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                            : director.role === 'SIGNATORY'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                        }`}
                      >
                        {ROLE_OPTIONS.find((r) => r.value === director.role)?.label || director.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(director)}
                          className="p-2 rounded-full hover:bg-primary/10 text-subtle-text hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(director.id)}
                          className="p-2 rounded-full hover:bg-danger/10 text-subtle-text hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="relative w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark p-6">
              <h3 className="text-xl font-bold text-text-light dark:text-text-dark">
                {editingDirector ? 'Edit Person' : 'Add Person'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="flex size-8 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    First Name <span className="text-danger">*</span>
                  </span>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    placeholder="John"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-light dark:text-text-dark">
                    Last Name <span className="text-danger">*</span>
                  </span>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    placeholder="Doe"
                    className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Email Address <span className="text-danger">*</span>
                </span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="john.doe@company.com"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Phone Number <span className="text-danger">*</span>
                </span>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  placeholder="+1 (555) 123-4567"
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Role <span className="text-danger">*</span>
                </span>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="h-12 px-4 rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {isPending ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-base">
                        progress_activity
                      </span>
                      Saving...
                    </>
                  ) : editingDirector ? (
                    'Update Person'
                  ) : (
                    'Add Person'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="relative w-full max-w-sm rounded-xl bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden p-6">
            <div className="flex flex-col items-center text-center">
              <div className="size-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-danger text-2xl">delete</span>
              </div>
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">
                Remove Person?
              </h3>
              <p className="text-subtle-text mb-6">
                This will remove this person from the KYC submission. This action cannot be undone.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 h-10 px-4 rounded-lg bg-danger text-white font-bold text-sm hover:bg-danger/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending ? (
                    <span className="material-symbols-outlined animate-spin text-base">
                      progress_activity
                    </span>
                  ) : (
                    'Remove'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
