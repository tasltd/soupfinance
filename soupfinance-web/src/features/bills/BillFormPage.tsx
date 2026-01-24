/**
 * Bill Form Page (Create/Edit)
 * Reference: soupfinance-designs/new-invoice-form/ (adapted for bills)
 *
 * Added: Full API integration with createBill/updateBill endpoints
 * Added: Vendor dropdown fetched from listVendors API
 * Added: Line items table with add/remove functionality
 * Added: Loading, error, and validation states
 * Added: data-testid attributes for E2E testing
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBill, createBill, updateBill } from '../../api/endpoints/bills';
import { listVendors } from '../../api/endpoints/vendors';
import type { BillItem } from '../../types';

// Added: Line item type for form state (without id for new items)
interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export function BillFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  // Added: Form state
  const [vendorId, setVendorId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Added: Fetch vendors for dropdown
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => listVendors({ max: 100 }),
  });

  // Added: Fetch bill data when editing
  const { data: bill, isLoading: billLoading, error: billError } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => getBill(id!),
    enabled: isEdit,
  });

  // Added: Populate form when bill data loads
  useEffect(() => {
    if (bill) {
      setVendorId(bill.vendor?.id || '');
      setIssueDate(bill.issueDate || '');
      setDueDate(bill.dueDate || '');
      setNotes(bill.notes || '');
      if (bill.items && bill.items.length > 0) {
        setLineItems(
          bill.items.map((item: BillItem) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          }))
        );
      }
    }
  }, [bill]);

  // Added: Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createBill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      navigate('/bills');
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to create bill');
    },
  });

  // Added: Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateBill(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['bill', id] });
      navigate(`/bills/${id}`);
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to update bill');
    },
  });

  // Added: Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + lineTotal;
  }, 0);

  const taxAmount = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (lineTotal * item.taxRate) / 100;
  }, 0);

  const totalAmount = subtotal + taxAmount;

  // Added: Handle line item changes
  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  // Added: Add new line item
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
    ]);
  };

  // Added: Remove line item
  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Added: Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate
    if (!vendorId) {
      setFormError('Please select a vendor');
      return;
    }
    if (!issueDate) {
      setFormError('Please enter an issue date');
      return;
    }
    if (!dueDate) {
      setFormError('Please enter a due date');
      return;
    }
    if (lineItems.length === 0 || lineItems.every((item) => !item.description)) {
      setFormError('Please add at least one line item');
      return;
    }

    // Added: Build form data with foreign key format
    const formData: Record<string, unknown> = {
      'vendor.id': vendorId,
      issueDate,
      dueDate,
      notes,
      subtotal,
      taxAmount,
      totalAmount,
      status: isEdit ? undefined : 'DRAFT',
    };

    // Added: Include line items as indexed fields (Grails binding format)
    lineItems.forEach((item, index) => {
      formData[`items[${index}].description`] = item.description;
      formData[`items[${index}].quantity`] = item.quantity;
      formData[`items[${index}].unitPrice`] = item.unitPrice;
      formData[`items[${index}].taxRate`] = item.taxRate;
      formData[`items[${index}].amount`] = item.quantity * item.unitPrice * (1 + item.taxRate / 100);
      if (item.id) {
        formData[`items[${index}].id`] = item.id;
      }
    });

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Added: Loading state for edit mode
  if (isEdit && billLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="bill-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="bill-form-loading">
          Loading bill...
        </div>
      </div>
    );
  }

  // Added: Error state for edit mode
  if (isEdit && billError) {
    return (
      <div className="flex flex-col gap-6" data-testid="bill-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="bill-form-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load bill</h3>
          <p className="text-subtle-text mb-4">The bill could not be found or there was an error loading it.</p>
          <button
            onClick={() => navigate('/bills')}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            Back to Bills
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="bill-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="bill-form-heading">
            {isEdit ? 'Edit Bill' : 'New Bill'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update bill details' : 'Record an expense from a vendor'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/bills')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="bill-form-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="bill-form-save-button"
          >
            {isPending ? 'Saving...' : isEdit ? 'Update Bill' : 'Save Bill'}
          </button>
        </div>
      </div>

      {/* Form Error */}
      {formError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-danger" data-testid="bill-form-error-message">
          {formError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bill Details Card */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="bill-details-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Bill Details</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Vendor <span className="text-danger">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="bill-vendor-select"
              >
                <option value="">Select a vendor</option>
                {vendorsLoading ? (
                  <option disabled>Loading vendors...</option>
                ) : (
                  vendors?.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Issue Date */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Issue Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="bill-issue-date-input"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Due Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="bill-due-date-input"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark p-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                placeholder="Add notes about this bill..."
                data-testid="bill-notes-textarea"
              />
            </div>
          </div>
        </div>

        {/* Line Items Card */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="bill-items-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Line Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="h-9 px-3 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center hover:bg-primary/20"
              data-testid="bill-add-item-button"
            >
              <span className="material-symbols-outlined text-base mr-1">add</span>
              Add Item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-items-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right w-24">Qty</th>
                  <th className="px-4 py-3 text-right w-32">Unit Price</th>
                  <th className="px-4 py-3 text-right w-24">Tax %</th>
                  <th className="px-4 py-3 text-right w-32">Amount</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => {
                  const lineAmount = item.quantity * item.unitPrice * (1 + item.taxRate / 100);
                  return (
                    <tr key={index} className="border-b border-border-light dark:border-border-dark">
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          placeholder="Item description"
                          data-testid={`bill-item-description-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          min="0"
                          step="1"
                          data-testid={`bill-item-quantity-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          min="0"
                          step="0.01"
                          data-testid={`bill-item-unitPrice-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.taxRate}
                          onChange={(e) => updateLineItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          min="0"
                          max="100"
                          step="0.1"
                          data-testid={`bill-item-taxRate-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-text-light dark:text-text-dark">
                        ${lineAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          className="text-danger hover:text-danger/70 disabled:opacity-30 disabled:cursor-not-allowed"
                          data-testid={`bill-item-remove-${index}`}
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 bg-background-light dark:bg-background-dark border-t border-border-light dark:border-border-dark">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-text-light dark:text-text-dark">
                  <span className="text-subtle-text">Subtotal</span>
                  <span data-testid="bill-subtotal">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-text-light dark:text-text-dark">
                  <span className="text-subtle-text">Tax</span>
                  <span data-testid="bill-tax">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-text-light dark:text-text-dark border-t border-border-light dark:border-border-dark pt-2">
                  <span>Total</span>
                  <span data-testid="bill-total">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
