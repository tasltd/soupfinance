# SoupFinance API: JSON Only

## Rule

**ALWAYS use `application/json` content type** for all API requests in the SoupFinance frontend.

## Implementation

The `apiClient` in `src/api/client.ts` is configured with:
```typescript
headers: {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
}
```

## What NOT to do

- Do NOT use `application/x-www-form-urlencoded`
- Do NOT use `toFormData()` helper (deprecated)
- Do NOT use `URLSearchParams` for request bodies

## Correct Patterns

### Creating entities with CSRF token
```typescript
const csrf = await getCsrfToken('vendor');
const response = await apiClient.post('/vendor/save.json', {
  name: 'Acme Corp',
  email: 'contact@acme.com',
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});
```

### Foreign key references (nested objects)
```typescript
// Use nested objects for foreign keys
const response = await apiClient.post('/voucher/save.json', {
  voucherType: 'PAYMENT',
  amount: 1000,
  vendor: { id: vendorId },      // Correct: nested object
  cashAccount: { id: accountId }, // Correct: nested object
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});
```

### Array fields (e.g., journal entry lines)
```typescript
const response = await apiClient.post('/ledgerTransaction/saveMultiple.json', {
  groupDate: '2026-02-03',
  description: 'Monthly rent',
  ledgerTransactionList: [
    { ledgerAccount: { id: '1' }, amount: 1000, transactionState: 'DEBIT' },
    { ledgerAccount: { id: '2' }, amount: 1000, transactionState: 'CREDIT' },
  ],
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});
```

## Exception: File Uploads

For actual file uploads, use `multipart/form-data`:
```typescript
const formData = new FormData();
formData.append('name', 'Acme Corp');
formData.append('logoFile', fileObject);
formData.append('SYNCHRONIZER_TOKEN', csrf.SYNCHRONIZER_TOKEN);
formData.append('SYNCHRONIZER_URI', csrf.SYNCHRONIZER_URI);

const response = await apiClient.post('/vendor/save.json', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
```

**Alternative for images:** Use base64 or URL in JSON (no multipart needed):
```typescript
const response = await apiClient.post('/vendor/save.json', {
  name: 'Acme Corp',
  logo: base64ImageString, // or 'https://example.com/logo.png'
  SYNCHRONIZER_TOKEN: csrf.SYNCHRONIZER_TOKEN,
  SYNCHRONIZER_URI: csrf.SYNCHRONIZER_URI,
});
```
