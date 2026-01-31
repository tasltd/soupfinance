/**
 * Invoice Form Page (Create/Edit)
 * Reference: soupfinance-designs/new-invoice-form/
 *
 * Added: Full API integration with createInvoice/updateInvoice/sendInvoice endpoints
 * Added: Client dropdown fetched from listClients API
 * Added: Line items table with add/remove functionality
 * Added: Loading, error, and validation states
 * Added: Save Draft and Save & Send functionality
 * Added: data-testid attributes for E2E testing
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoice, createInvoice, updateInvoice, sendInvoice } from '../../api/endpoints/invoices';
import { listClients } from '../../api/endpoints/clients';
import { useFormatCurrency } from '../../stores';
import type { InvoiceItem } from '../../types';

// Added: Line item type for form state (without id for new items)
interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
}

export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const isEdit = !!id;

  // Added: Form state
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Added: Fetch clients for dropdown
  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => listClients({ max: 100 }),
  });

  // Added: Fetch invoice data when editing
  const { data: invoice, isLoading: invoiceLoading, error: invoiceError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: isEdit,
  });

  // Added: Populate form when invoice data loads
  /* eslint-disable-next-line -- Syncing fetched data to form state is a valid use case */
  useEffect(() => {
    if (invoice) {
      setClientId(invoice.client?.id || '');
      setIssueDate(invoice.issueDate || '');
      setDueDate(invoice.dueDate || '');
      setNotes(invoice.notes || '');
      setTerms(invoice.terms || '');
      if (invoice.items && invoice.items.length > 0) {
        setLineItems(
          invoice.items.map((item: InvoiceItem) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            discountPercent: item.discountPercent || 0,
          }))
        );
      }
    }
  }, [invoice]);

  // Added: Create mutation (draft)
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/invoices');
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to create invoice');
    },
  });

  // Added: Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateInvoice(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      navigate(`/invoices/${id}`);
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to update invoice');
    },
  });

  // Added: Send mutation (save and send)
  const sendMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      // First create/update the invoice
      let invoiceId = id;
      if (isEdit) {
        await updateInvoice(id!, data);
      } else {
        const newInvoice = await createInvoice(data);
        invoiceId = newInvoice.id;
      }
      // Then send it
      return sendInvoice(invoiceId!);
    },
    onSuccess: (sentInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', sentInvoice.id] });
      navigate(`/invoices/${sentInvoice.id}`);
    },
    onError: (error: Error) => {
      setFormError(error.message || 'Failed to send invoice');
    },
  });

  // Added: Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + lineTotal;
  }, 0);

  const discountAmount = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return sum + (lineTotal * item.discountPercent) / 100;
  }, 0);

  const taxAmount = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unitPrice;
    const afterDiscount = lineTotal - (lineTotal * item.discountPercent) / 100;
    return sum + (afterDiscount * item.taxRate) / 100;
  }, 0);

  const totalAmount = subtotal - discountAmount + taxAmount;

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
      { description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 },
    ]);
  };

  // Added: Remove line item
  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Added: Build form data
  const buildFormData = () => {
    // Validate
    if (!clientId) {
      setFormError('Please select a client');
      return null;
    }
    if (!issueDate) {
      setFormError('Please enter an issue date');
      return null;
    }
    if (!dueDate) {
      setFormError('Please enter a due date');
      return null;
    }
    if (lineItems.length === 0 || lineItems.every((item) => !item.description)) {
      setFormError('Please add at least one line item');
      return null;
    }

    // Added: Build form data with foreign key format
    const formData: Record<string, unknown> = {
      'client.id': clientId,
      issueDate,
      dueDate,
      notes,
      terms,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
    };

    // Added: Include line items as indexed fields (Grails binding format)
    lineItems.forEach((item, index) => {
      formData[`items[${index}].description`] = item.description;
      formData[`items[${index}].quantity`] = item.quantity;
      formData[`items[${index}].unitPrice`] = item.unitPrice;
      formData[`items[${index}].taxRate`] = item.taxRate;
      formData[`items[${index}].discountPercent`] = item.discountPercent;
      // Calculate line amount after discount and tax
      const lineTotal = item.quantity * item.unitPrice;
      const afterDiscount = lineTotal - (lineTotal * item.discountPercent) / 100;
      const withTax = afterDiscount + (afterDiscount * item.taxRate) / 100;
      formData[`items[${index}].amount`] = withTax;
      if (item.id) {
        formData[`items[${index}].id`] = item.id;
      }
    });

    return formData;
  };

  // Added: Handle save draft
  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const formData = buildFormData();
    if (!formData) return;

    formData.status = 'DRAFT';

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  // Added: Handle save and send
  const handleSaveAndSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const formData = buildFormData();
    if (!formData) return;

    formData.status = isEdit ? undefined : 'DRAFT'; // Status will be updated by send
    sendMutation.mutate(formData);
  };

  const isPending = createMutation.isPending || updateMutation.isPending || sendMutation.isPending;

  // Added: Loading state for edit mode
  if (isEdit && invoiceLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="invoice-form-loading">
          Loading invoice...
        </div>
      </div>
    );
  }

  // Added: Error state for edit mode
  if (isEdit && invoiceError) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="invoice-form-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load invoice</h3>
          <p className="text-subtle-text mb-4">The invoice could not be found or there was an error loading it.</p>
          <button
            onClick={() => navigate('/invoices')}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="invoice-form-page">
      {/* Page Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-light dark:text-text-dark" data-testid="invoice-form-heading">
            {isEdit ? 'Edit Invoice' : 'New Invoice'}
          </h1>
          <p className="text-subtle-text">
            {isEdit ? 'Update invoice details' : 'Create a new invoice for your client'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/invoices')}
            className="h-10 px-4 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark font-medium text-sm hover:bg-primary/5"
            data-testid="invoice-form-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isPending}
            className="h-10 px-4 rounded-lg bg-primary/20 text-primary font-bold text-sm hover:bg-primary/30 disabled:opacity-50"
            data-testid="invoice-form-save-draft-button"
          >
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handleSaveAndSend}
            disabled={isPending}
            className="h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50"
            data-testid="invoice-form-save-send-button"
          >
            {sendMutation.isPending ? 'Sending...' : 'Save & Send'}
          </button>
        </div>
      </div>

      {/* Form Error */}
      {formError && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-danger" data-testid="invoice-form-error-message">
          {formError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSaveDraft} className="space-y-6">
        {/* Invoice Details Card */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark" data-testid="invoice-details-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Invoice Details</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Client <span className="text-danger">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="invoice-client-select"
              >
                <option value="">Select a client</option>
                {clientsLoading ? (
                  <option disabled>Loading clients...</option>
                ) : (
                  clients?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Invoice Number (read-only for existing) */}
            {isEdit && invoice?.invoiceNumber && (
              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoice.invoiceNumber}
                  readOnly
                  className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 px-3 text-subtle-text cursor-not-allowed"
                  data-testid="invoice-number-input"
                />
              </div>
            )}

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
                data-testid="invoice-issue-date-input"
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
                data-testid="invoice-due-date-input"
              />
            </div>

            {/* Terms */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Payment Terms
              </label>
              <input
                type="text"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                placeholder="e.g., Net 30, Due on receipt"
                data-testid="invoice-terms-input"
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
                placeholder="Add notes to appear on the invoice..."
                data-testid="invoice-notes-textarea"
              />
            </div>
          </div>
        </div>

        {/* Line Items Card */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark overflow-hidden" data-testid="invoice-items-card">
          <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">Line Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="h-9 px-3 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center hover:bg-primary/20"
              data-testid="invoice-add-item-button"
            >
              <span className="material-symbols-outlined text-base mr-1">add</span>
              Add Item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="invoice-items-table">
              <thead className="text-xs text-subtle-text uppercase bg-background-light dark:bg-background-dark">
                <tr>
                  <th className="px-6 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right w-20">Qty</th>
                  <th className="px-4 py-3 text-right w-28">Unit Price</th>
                  <th className="px-4 py-3 text-right w-20">Disc %</th>
                  <th className="px-4 py-3 text-right w-20">Tax %</th>
                  <th className="px-4 py-3 text-right w-28">Amount</th>
                  <th className="px-4 py-3 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => {
                  const lineTotal = item.quantity * item.unitPrice;
                  const afterDiscount = lineTotal - (lineTotal * item.discountPercent) / 100;
                  const lineAmount = afterDiscount + (afterDiscount * item.taxRate) / 100;
                  return (
                    <tr key={index} className="border-b border-border-light dark:border-border-dark">
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          placeholder="Item description"
                          data-testid={`invoice-item-description-${index}`}
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
                          data-testid={`invoice-item-quantity-${index}`}
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
                          data-testid={`invoice-item-unitPrice-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.discountPercent}
                          onChange={(e) => updateLineItem(index, 'discountPercent', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          min="0"
                          max="100"
                          step="0.1"
                          data-testid={`invoice-item-discountPercent-${index}`}
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
                          data-testid={`invoice-item-taxRate-${index}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-text-light dark:text-text-dark">
                        {formatCurrency(lineAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          className="text-danger hover:text-danger/70 disabled:opacity-30 disabled:cursor-not-allowed"
                          data-testid={`invoice-item-remove-${index}`}
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
                  <span data-testid="invoice-subtotal">{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-text-light dark:text-text-dark">
                    <span className="text-subtle-text">Discount</span>
                    <span className="text-danger" data-testid="invoice-discount">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-light dark:text-text-dark">
                  <span className="text-subtle-text">Tax</span>
                  <span data-testid="invoice-tax">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-text-light dark:text-text-dark border-t border-border-light dark:border-border-dark pt-2">
                  <span>Total</span>
                  <span data-testid="invoice-total">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
