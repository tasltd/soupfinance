/**
 * Invoice Form Page (Create/Edit)
 * Reference: soupfinance-designs/new-invoice-form/
 *
 * ARCHITECTURE (2026-02-05 refactored):
 * Uses the backend domain model:
 *   - accountServices (FK) replaces "client" as the invoice recipient
 *   - invoiceDate replaces issueDate
 *   - paymentDate replaces dueDate
 *   - invoiceItemList replaces items
 *
 * The Account Services dropdown is populated from:
 *   1. Existing invoices (unique accountServices seen before)
 *   2. Broker KYC clients (with account services lookup)
 *
 * Added: data-testid attributes for E2E testing
 * Changed (2026-02-01): Added tax rate dropdown from domain data API
 * Changed (2026-02-01): Added service description autocomplete for line items
 * Changed (2026-02-05): Replaced invoiceClient with accountServices
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoice, createInvoice, updateInvoice, sendInvoice, listInvoices } from '../../api/endpoints/invoices';
import { listTaxRates, listInvoiceServices } from '../../api/endpoints/domainData';
import { useFormatCurrency } from '../../stores';
import type { InvoiceItem } from '../../types';

// Line item type for form state (without id for new items)
interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
}

// Account services option for dropdown
interface AccountServicesOption {
  id: string;
  displayName: string;
}

export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const isEdit = !!id;

  // Form state — uses backend field names
  const [accountServicesId, setAccountServicesId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch existing invoices to extract known account services for dropdown
  const { data: existingInvoices } = useQuery({
    queryKey: ['invoices-for-form'],
    queryFn: () => listInvoices({ max: 100 }),
  });

  // Build unique account services options from existing invoices
  const accountServicesOptions: AccountServicesOption[] = useMemo(() => {
    if (!existingInvoices) return [];
    const seen = new Map<string, string>();
    for (const inv of existingInvoices) {
      if (inv.accountServices?.id && !seen.has(inv.accountServices.id)) {
        seen.set(inv.accountServices.id, inv.accountServices.serialised || inv.accountServices.id);
      }
    }
    return Array.from(seen.entries()).map(([asId, displayName]) => ({
      id: asId,
      displayName,
    }));
  }, [existingInvoices]);

  // Fetch tax rates for dropdown
  const { data: taxRates } = useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => listTaxRates(),
  });

  // Fetch service descriptions for autocomplete
  const { data: serviceDescriptions } = useQuery({
    queryKey: ['invoice-services'],
    queryFn: () => listInvoiceServices({ max: 100 }),
  });

  // Fetch invoice data when editing
  const { data: invoice, isLoading: invoiceLoading, error: invoiceError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: isEdit,
  });

  // Populate form when invoice data loads
  useEffect(() => {
    if (invoice) {
      setAccountServicesId(invoice.accountServices?.id || '');
      setInvoiceDate(invoice.invoiceDate || '');
      setPaymentDate(invoice.paymentDate || '');
      setNotes(invoice.notes || '');
      setPurchaseOrderNumber(invoice.purchaseOrderNumber || '');
      if (invoice.invoiceItemList && invoice.invoiceItemList.length > 0) {
        setLineItems(
          invoice.invoiceItemList.map((item: InvoiceItem) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate || 0,
            discountPercent: item.discountPercent || 0,
          }))
        );
      }
    }
  }, [invoice]);

  // Create mutation (draft)
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

  // Update mutation
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

  // Send mutation (save and send)
  const sendMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      let invoiceId = id;
      if (isEdit) {
        await updateInvoice(id!, data);
      } else {
        const newInvoice = await createInvoice(data);
        invoiceId = newInvoice.id;
      }
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

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    return sum + item.quantity * item.unitPrice;
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

  // Handle line item changes
  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Build form data for submission (uses backend field names)
  const buildFormData = () => {
    if (!accountServicesId) {
      setFormError('Please select an account');
      return null;
    }
    if (!invoiceDate) {
      setFormError('Please enter an invoice date');
      return null;
    }
    if (!paymentDate) {
      setFormError('Please enter a due date');
      return null;
    }
    if (lineItems.length === 0 || lineItems.every((item) => !item.description)) {
      setFormError('Please add at least one line item');
      return null;
    }

    // Build form data with backend FK format
    const formData: Record<string, unknown> = {
      'accountServices.id': accountServicesId,
      invoiceDate,
      paymentDate,
      notes,
      purchaseOrderNumber,
    };

    // Include line items as indexed fields (Grails binding format)
    lineItems.forEach((item, index) => {
      formData[`invoiceItemList[${index}].description`] = item.description;
      formData[`invoiceItemList[${index}].quantity`] = item.quantity;
      formData[`invoiceItemList[${index}].unitPrice`] = item.unitPrice;
      if (item.id) {
        formData[`invoiceItemList[${index}].id`] = item.id;
      }
    });

    return formData;
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const formData = buildFormData();
    if (!formData) return;

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleSaveAndSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const formData = buildFormData();
    if (!formData) return;
    sendMutation.mutate(formData);
  };

  const isPending = createMutation.isPending || updateMutation.isPending || sendMutation.isPending;

  // Loading state for edit mode
  if (isEdit && invoiceLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-8 text-center text-subtle-text" data-testid="invoice-form-loading">
          Loading invoice...
        </div>
      </div>
    );
  }

  if (isEdit && invoiceError) {
    return (
      <div className="flex flex-col gap-6" data-testid="invoice-form-page">
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-12 text-center" data-testid="invoice-form-error">
          <span className="material-symbols-outlined text-6xl text-danger/50 mb-4">error</span>
          <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-2">Failed to load invoice</h3>
          <p className="text-subtle-text mb-4">The invoice could not be found or there was an error loading it.</p>
          <button onClick={() => navigate('/invoices')} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-white font-bold text-sm">
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
            {isEdit ? 'Update invoice details' : 'Create a new invoice'}
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
            {/* Account Services (replaces Client dropdown) */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Account <span className="text-danger">*</span>
              </label>
              <select
                value={accountServicesId}
                onChange={(e) => setAccountServicesId(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="invoice-account-select"
              >
                <option value="">Select an account</option>
                {accountServicesOptions.map((as) => (
                  <option key={as.id} value={as.id}>
                    {as.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice Number (read-only for existing) */}
            {isEdit && invoice?.number && (
              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={String(invoice.number)}
                  readOnly
                  className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 px-3 text-subtle-text cursor-not-allowed"
                  data-testid="invoice-number-input"
                />
              </div>
            )}

            {/* Invoice Date */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Invoice Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="invoice-date-input"
              />
            </div>

            {/* Payment Date (Due Date) */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Due Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="invoice-due-date-input"
              />
            </div>

            {/* PO Number */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                PO Number
              </label>
              <input
                type="text"
                value={purchaseOrderNumber}
                onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                placeholder="Purchase order number"
                data-testid="invoice-po-number-input"
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
                          list="service-descriptions"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          placeholder="Item description"
                          data-testid={`invoice-item-description-${index}`}
                        />
                        <datalist id="service-descriptions">
                          {serviceDescriptions?.map((service) => (
                            <option key={service.id} value={service.name}>
                              {service.description}
                            </option>
                          ))}
                        </datalist>
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
                        <select
                          value={item.taxRate}
                          onChange={(e) => updateLineItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-2 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          data-testid={`invoice-item-taxRate-${index}`}
                        >
                          {taxRates?.map((tax) => (
                            <option key={tax.id} value={tax.rate}>
                              {tax.name}
                            </option>
                          )) || <option value="0">No Tax</option>}
                        </select>
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
