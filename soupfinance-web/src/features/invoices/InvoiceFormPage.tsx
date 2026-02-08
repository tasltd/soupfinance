/**
 * Invoice Form Page (Create/Edit)
 * Reference: soupfinance-designs/new-invoice-form/
 *
 * ARCHITECTURE (2026-02-05 refactored):
 * Uses the backend domain model:
 *   - accountServices (FK) is the invoice recipient on the backend
 *   - invoiceDate replaces issueDate
 *   - paymentDate replaces dueDate
 *   - invoiceItemList replaces items
 *
 * Changed (2026-02-06): Client dropdown pattern
 * The form shows a Client dropdown populated from /rest/client/index.json.
 * When a client is selected, the system resolves their accountServices FK
 * and sets it on the invoice before saving. This allows client metadata
 * (name, email, address) to be managed separately from the AccountServices.
 *
 * Added: data-testid attributes for E2E testing
 * Changed (2026-02-01): Added tax rate dropdown from domain data API
 * Changed (2026-02-01): Added service description autocomplete for line items
 * Changed (2026-02-05): Replaced invoiceClient with accountServices
 * Changed (2026-02-06): Replaced accountServices dropdown with Client dropdown
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoice, createInvoice, updateInvoice, sendInvoice } from '../../api/endpoints/invoices';
import { listClients, createClient } from '../../api/endpoints/clients';
import { listTaxRates, listInvoiceServices } from '../../api/endpoints/domainData';
import { useFormatCurrency } from '../../stores';
import { DEFAULT_CURRENCIES } from '../../api/endpoints/domainData';
import type { InvoiceItem, ClientType } from '../../types';

// Line item type for form state (without id for new items)
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

  // Form state — uses backend field names
  // Changed: selectedClientId drives the dropdown; accountServicesId is resolved from client
  const [selectedClientId, setSelectedClientId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  // Added: Missing SSR fields (gap analysis §2.1)
  const [salesOrderNumber, setSalesOrderNumber] = useState('');
  const [currency, setCurrency] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number | ''>('');
  // Added: Compliments field from backend Invoice domain (optional closing remarks)
  const [compliments, setCompliments] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Added: Inline client creation state
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientType, setNewClientType] = useState<ClientType>('INDIVIDUAL');
  const [newClientFirstName, setNewClientFirstName] = useState('');
  const [newClientLastName, setNewClientLastName] = useState('');
  const [newClientCompanyName, setNewClientCompanyName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientError, setNewClientError] = useState<string | null>(null);

  // Changed: Fetch clients from /rest/client/index.json for the dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-for-invoice'],
    queryFn: () => listClients({ max: 100 }),
  });

  // Fix: Resolve accountServicesId through client's portfolioList (not direct accountServices)
  // Client → portfolioList[0] → accountServices.id
  const selectedClient = clients?.find((c) => c.id === selectedClientId);
  const resolvedAccountServicesId = selectedClient?.portfolioList?.[0]?.accountServices?.id || '';

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

  // Populate form when invoice data loads (edit mode)
  // Changed: Resolve selectedClientId from invoice's accountServices FK
  useEffect(() => {
    if (invoice) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Populating form fields from loaded invoice data
      setInvoiceDate(invoice.invoiceDate || '');
      setPaymentDate(invoice.paymentDate || '');
      setNotes(invoice.notes || '');
      setPurchaseOrderNumber(invoice.purchaseOrderNumber || '');
      // Added: Populate new fields from existing invoice
      setSalesOrderNumber(invoice.salesOrderNumber || '');
      setCompliments(invoice.compliments || '');
      if (invoice.currency) setCurrency(invoice.currency);
      if (invoice.exchangeRate) setExchangeRate(invoice.exchangeRate);
      // Auto-expand advanced section if advanced fields have values
      if (invoice.salesOrderNumber || invoice.currency || invoice.exchangeRate || invoice.compliments) {
        setShowAdvanced(true);
      }
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

  // Changed: When clients load and we're editing, find which client owns this invoice's accountServices
  useEffect(() => {
    if (invoice && clients && !selectedClientId) {
      const invoiceAsId = invoice.accountServices?.id;
      if (invoiceAsId) {
        // Fix: Resolve through portfolioList (not direct accountServices)
        const owningClient = clients.find((c) => c.portfolioList?.some((p) => p.accountServices?.id === invoiceAsId));
        if (owningClient) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- Resolving client from invoice's accountServices FK
          setSelectedClientId(owningClient.id);
        }
      }
    }
  }, [invoice, clients, selectedClientId]);

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

  // Added: Inline client creation mutation
  const createClientMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createClient(data),
    onSuccess: (newClient) => {
      // Auto-select the newly created client
      setSelectedClientId(newClient.id);
      // Refresh clients list so the new client appears in dropdown
      queryClient.invalidateQueries({ queryKey: ['clients-for-invoice'] });
      // Reset and close the form
      resetNewClientForm();
    },
    onError: (error: Error) => {
      setNewClientError(error.message || 'Failed to create client');
    },
  });

  // Added: Reset new client form fields
  const resetNewClientForm = () => {
    setShowNewClientForm(false);
    setNewClientType('INDIVIDUAL');
    setNewClientFirstName('');
    setNewClientLastName('');
    setNewClientCompanyName('');
    setNewClientEmail('');
    setNewClientError(null);
  };

  // Added: Handle inline client creation
  const handleCreateClient = () => {
    setNewClientError(null);

    if (newClientType === 'INDIVIDUAL') {
      if (!newClientFirstName.trim() || !newClientLastName.trim()) {
        setNewClientError('First name and last name are required');
        return;
      }
    } else {
      if (!newClientCompanyName.trim()) {
        setNewClientError('Company name is required');
        return;
      }
    }

    if (!newClientEmail.trim()) {
      setNewClientError('Email is required');
      return;
    }

    const payload: Record<string, unknown> = {
      clientType: newClientType,
      email: newClientEmail.trim(),
    };

    if (newClientType === 'INDIVIDUAL') {
      payload.firstName = newClientFirstName.trim();
      payload.lastName = newClientLastName.trim();
      // Backend expects name field for display
      payload.name = `${newClientFirstName.trim()} ${newClientLastName.trim()}`;
    } else {
      payload.companyName = newClientCompanyName.trim();
      payload.name = newClientCompanyName.trim();
    }

    createClientMutation.mutate(payload);
  };

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
                // Auto-fill tax rate if service has a default
                ...(service.defaultTaxRate != null && { taxRate: service.defaultTaxRate }),
              }
            : item
        )
      );
    }
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
  // Changed: Validates client selection and resolves accountServices.id from client
  const buildFormData = () => {
    if (!selectedClientId) {
      setFormError('Please select a client');
      return null;
    }
    if (!resolvedAccountServicesId) {
      // Edge case: client exists but has no accountServices linked
      setFormError('Selected client has no account services. Please choose a different client.');
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

    // Fix: Use nested object FK (dot-notation doesn't bind in JSON body)
    const formData: Record<string, unknown> = {
      accountServices: { id: resolvedAccountServicesId },
      invoiceDate,
      paymentDate,
      notes,
      purchaseOrderNumber,
      // Added: New fields from gap analysis
      ...(salesOrderNumber && { salesOrderNumber }),
      ...(currency && { currency }),
      ...(exchangeRate !== '' && { exchangeRate }),
      // Added: Compliments field (optional closing remarks on invoice)
      ...(compliments && { compliments }),
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
            {/* Changed: Client dropdown with inline "New Client" creation */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                Client <span className="text-danger">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="flex-1 h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                  data-testid="invoice-client-select"
                >
                  <option value="">Select a client</option>
                  {clients?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {/* Added: New Client button to open inline creation form */}
                <button
                  type="button"
                  onClick={() => setShowNewClientForm(!showNewClientForm)}
                  className={`h-12 px-4 rounded-lg font-bold text-sm flex items-center gap-1 whitespace-nowrap transition-colors ${
                    showNewClientForm
                      ? 'bg-danger/10 text-danger hover:bg-danger/20'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                  data-testid="invoice-new-client-button"
                >
                  <span className="material-symbols-outlined text-base">
                    {showNewClientForm ? 'close' : 'person_add'}
                  </span>
                  {showNewClientForm ? 'Cancel' : 'New Client'}
                </button>
              </div>
              {/* NOTE: Show warning if selected client has no accountServices */}
              {selectedClientId && !resolvedAccountServicesId && (
                <p className="text-xs text-danger mt-1">This client has no linked account services.</p>
              )}

              {/* Added: Inline client creation form */}
              {showNewClientForm && (
                <div className="mt-3 p-4 rounded-lg border border-primary/30 bg-primary/5" data-testid="invoice-new-client-form">
                  <h3 className="text-sm font-bold text-text-light dark:text-text-dark mb-3">Quick Add Client</h3>

                  {/* Client type toggle */}
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setNewClientType('INDIVIDUAL')}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                        newClientType === 'INDIVIDUAL'
                          ? 'bg-primary text-white'
                          : 'bg-white dark:bg-background-dark text-subtle-text border border-border-light dark:border-border-dark'
                      }`}
                      data-testid="new-client-type-individual"
                    >
                      <span className="material-symbols-outlined text-sm">person</span>
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewClientType('CORPORATE')}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                        newClientType === 'CORPORATE'
                          ? 'bg-primary text-white'
                          : 'bg-white dark:bg-background-dark text-subtle-text border border-border-light dark:border-border-dark'
                      }`}
                      data-testid="new-client-type-corporate"
                    >
                      <span className="material-symbols-outlined text-sm">business</span>
                      Corporate
                    </button>
                  </div>

                  {/* Fields based on type */}
                  <div className="space-y-2">
                    {newClientType === 'INDIVIDUAL' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newClientFirstName}
                          onChange={(e) => setNewClientFirstName(e.target.value)}
                          placeholder="First name *"
                          className="h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-1 focus:ring-primary/50"
                          data-testid="new-client-first-name"
                        />
                        <input
                          type="text"
                          value={newClientLastName}
                          onChange={(e) => setNewClientLastName(e.target.value)}
                          placeholder="Last name *"
                          className="h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-1 focus:ring-primary/50"
                          data-testid="new-client-last-name"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={newClientCompanyName}
                        onChange={(e) => setNewClientCompanyName(e.target.value)}
                        placeholder="Company name *"
                        className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-1 focus:ring-primary/50"
                        data-testid="new-client-company-name"
                      />
                    )}

                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="Email address *"
                      className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-sm text-text-light dark:text-text-dark placeholder:text-subtle-text focus:border-primary focus:ring-1 focus:ring-primary/50"
                      data-testid="new-client-email"
                    />
                  </div>

                  {/* Error message */}
                  {newClientError && (
                    <p className="text-xs text-danger mt-2">{newClientError}</p>
                  )}

                  {/* Create button */}
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={createClientMutation.isPending}
                    className="mt-3 h-9 w-full rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                    data-testid="new-client-create-button"
                  >
                    {createClientMutation.isPending ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        Creating...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">add</span>
                        Create & Select
                      </>
                    )}
                  </button>
                </div>
              )}
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

            {/* Added: Sales Order Number (gap analysis §2.1) */}
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
                data-testid="invoice-so-number-input"
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

            {/* Added: Collapsible Advanced Options (currency/exchange rate) - gap analysis §4.1 */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                data-testid="invoice-advanced-toggle"
              >
                <span className="material-symbols-outlined text-base transition-transform" style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)' }}>
                  chevron_right
                </span>
                Advanced Options
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark/50" data-testid="invoice-advanced-section">
                  {/* Currency */}
                  <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                      data-testid="invoice-currency-select"
                    >
                      <option value="">Account default</option>
                      {DEFAULT_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} - {c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Exchange Rate - only show when currency differs from account default */}
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
                        data-testid="invoice-exchange-rate-input"
                      />
                    </div>
                  )}
                  {/* Added: Compliments (optional closing remarks on invoice) */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
                      Compliments
                    </label>
                    <textarea
                      value={compliments}
                      onChange={(e) => setCompliments(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark p-3 text-text-light dark:text-text-dark focus:border-primary focus:ring-2 focus:ring-primary/50"
                      placeholder="Closing remarks or thank you message..."
                      data-testid="invoice-compliments-textarea"
                    />
                  </div>
                </div>
              )}
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
                  {/* Added: Service/Product reference dropdown column before Description */}
                  <th className="px-4 py-3 text-left w-44">Service/Product</th>
                  <th className="px-4 py-3 text-left">Description</th>
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
                      {/* Added: Service/Product dropdown - auto-fills description when selected */}
                      <td className="px-4 py-3">
                        <select
                          onChange={(e) => handleServiceSelect(index, e.target.value)}
                          className="w-full h-10 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-background-dark px-2 text-text-light dark:text-text-dark focus:border-primary focus:ring-1 focus:ring-primary/50 text-sm"
                          data-testid={`invoice-item-service-${index}`}
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
