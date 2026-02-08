/**
 * Bill Form Page (Create/Edit)
 * Reference: soupfinance-designs/new-invoice-form/ (adapted for bills)
 *
 * Added: Full API integration with createBill/updateBill endpoints
 * Added: Vendor dropdown fetched from listVendors API
 * Added: Line items table with add/remove functionality
 * Added: Loading, error, and validation states
 * Added: data-testid attributes for E2E testing
 * Changed (2026-02-01): Added tax rate dropdown from domain data API
 * Changed (2026-02-01): Added service description autocomplete for line items
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBill, createBill, updateBill } from '../../api/endpoints/bills';
import { listVendors } from '../../api/endpoints/vendors';
import { listTaxRates, listBillServices, DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
import { useFormatCurrency } from '../../stores';
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
  const formatCurrency = useFormatCurrency();
  const isEdit = !!id;

  // Added: Form state
  // Changed: Use backend field names — billDate (not issueDate), paymentDate (not dueDate)
  const [vendorId, setVendorId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  // Added: Missing SSR fields (gap analysis §2.2)
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [salesOrderNumber, setSalesOrderNumber] = useState('');
  const [currency, setCurrency] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number | ''>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Added: Fetch vendors for dropdown
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => listVendors({ max: 100 }),
  });

  // Added (2026-02-01): Fetch tax rates for dropdown
  const { data: taxRates } = useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => listTaxRates(),
  });

  // Added (2026-02-01): Fetch service descriptions for autocomplete (BILL type)
  const { data: serviceDescriptions } = useQuery({
    queryKey: ['bill-services'],
    queryFn: () => listBillServices({ max: 100 }),
  });

  // Added: Fetch bill data when editing
  const { data: bill, isLoading: billLoading, error: billError } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => getBill(id!),
    enabled: isEdit,
  });

  // Added: Populate form when bill data loads
  // Changed: Use backend field names (billDate, paymentDate) with fallbacks
  useEffect(() => {
    if (bill) {
      setVendorId(bill.vendor?.id || '');
      setBillDate(bill.billDate || bill.issueDate || '');
      setPaymentDate(bill.paymentDate || bill.dueDate || '');
      setNotes(bill.notes || '');
      setPurchaseOrderNumber(bill.purchaseOrderNumber || '');
      setSalesOrderNumber(bill.salesOrderNumber || '');
      if (bill.currency) setCurrency(bill.currency);
      if (bill.exchangeRate) setExchangeRate(bill.exchangeRate);
      // Auto-expand advanced if advanced fields have values
      if (bill.purchaseOrderNumber || bill.salesOrderNumber || bill.currency || bill.exchangeRate) {
        setShowAdvanced(true);
      }
      const items = bill.items || bill.billItemList;
      if (items && items.length > 0) {
        setLineItems(
          items.map((item: BillItem) => ({
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

  // Added: Handle service/product selection - auto-fills description from selected service
  const handleServiceSelect = (index: number, serviceId: string) => {
    const service = serviceDescriptions?.find((s) => s.id === serviceId);
    if (service) {
      setLineItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                description: service.name,
                ...(service.defaultTaxRate != null && { taxRate: service.defaultTaxRate }),
              }
            : item
        )
      );
    }
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
    if (!billDate) {
      setFormError('Please enter a bill date');
      return;
    }
    if (!paymentDate) {
      setFormError('Please enter a due date');
      return;
    }
    if (lineItems.length === 0 || lineItems.every((item) => !item.description)) {
      setFormError('Please add at least one line item');
      return;
    }

    // Fix: Use nested object FK (dot-notation doesn't bind in JSON body)
    const formData: Record<string, unknown> = {
      vendor: { id: vendorId },
      billDate, // Changed: Backend uses billDate (not issueDate)
      paymentDate, // Changed: Backend uses paymentDate (not dueDate)
      notes,
      subtotal,
      taxAmount,
      totalAmount,
      status: isEdit ? undefined : 'DRAFT',
      // Added: New fields from gap analysis
      ...(purchaseOrderNumber && { purchaseOrderNumber }),
      ...(salesOrderNumber && { salesOrderNumber }),
      ...(currency && { currency }),
      ...(exchangeRate !== '' && { exchangeRate }),
    };

    // Fix: Use billItemList (Grails hasMany property name), not items
    lineItems.forEach((item, index) => {
      formData[`billItemList[${index}].description`] = item.description;
      formData[`billItemList[${index}].quantity`] = item.quantity;
      formData[`billItemList[${index}].unitPrice`] = item.unitPrice;
      formData[`billItemList[${index}].taxRate`] = item.taxRate;
      formData[`billItemList[${index}].amount`] = item.quantity * item.unitPrice * (1 + item.taxRate / 100);
      if (item.id) {
        formData[`billItemList[${index}].id`] = item.id;
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

            {/* Changed: Bill Date (backend: billDate, previously misnamed as issueDate) */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Bill Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                data-testid="bill-date-input"
              />
            </div>

            {/* Changed: Payment Date (backend: paymentDate, previously misnamed as dueDate) */}
            <div>
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Due Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
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

            {/* Added: Collapsible Advanced Options (PO/SO, currency/exchange rate) - gap analysis §2.2 */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                data-testid="bill-advanced-toggle"
              >
                <span className="material-symbols-outlined text-base transition-transform" style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)' }}>
                  chevron_right
                </span>
                Advanced Options
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark/50" data-testid="bill-advanced-section">
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
                      data-testid="bill-po-number-input"
                    />
                  </div>
                  {/* SO Number */}
                  <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                      SO Number
                    </label>
                    <input
                      type="text"
                      value={salesOrderNumber}
                      onChange={(e) => setSalesOrderNumber(e.target.value)}
                      className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                      placeholder="Sales order number"
                      data-testid="bill-so-number-input"
                    />
                  </div>
                  {/* Currency */}
                  <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                      data-testid="bill-currency-select"
                    >
                      <option value="">Account default</option>
                      {DEFAULT_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} - {c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Exchange Rate */}
                  {currency && (
                    <div>
                      <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                        Exchange Rate
                      </label>
                      <input
                        type="number"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value ? parseFloat(e.target.value) : '')}
                        className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                        placeholder="1.00"
                        min="0"
                        step="0.0001"
                        data-testid="bill-exchange-rate-input"
                      />
                    </div>
                  )}
                </div>
              )}
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
                  {/* Added: Service/Product reference dropdown column before Description */}
                  <th className="px-4 py-3 text-left w-44">Service/Product</th>
                  <th className="px-4 py-3 text-left">Description</th>
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
                      {/* Added: Service/Product dropdown - auto-fills description when selected */}
                      <td className="px-4 py-3">
                        <select
                          onChange={(e) => handleServiceSelect(index, e.target.value)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-2 text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm"
                          data-testid={`bill-item-service-${index}`}
                          defaultValue=""
                        >
                          <option value="">Select...</option>
                          {serviceDescriptions?.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
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
                        {/* Changed (2026-02-01): Tax rate dropdown from domain data */}
                        <select
                          value={item.taxRate}
                          onChange={(e) => updateLineItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-2 text-right text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50"
                          data-testid={`bill-item-taxRate-${index}`}
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
                  <span data-testid="bill-subtotal">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-text-light dark:text-text-dark">
                  <span className="text-subtle-text">Tax</span>
                  <span data-testid="bill-tax">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-text-light dark:text-text-dark border-t border-border-light dark:border-border-dark pt-2">
                  <span>Total</span>
                  <span data-testid="bill-total">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
