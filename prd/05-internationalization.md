# Internationalization

[← Back to PRD Index](../PRD.md)

---

## Supported Languages

| Code | Language | Status |
|------|----------|--------|
| en | English | Default |
| de | German | Complete |
| fr | French | Complete |
| nl | Dutch | Complete |

---

## Language Detection

1. Check localStorage for `soupfinance_language`
2. Fall back to browser language preference
3. Default to English if no match

---

## Translation Namespaces

SoupFinance uses namespace-based translation organization:

| # | Namespace | Description |
|---|-----------|-------------|
| 1 | common | Shared UI elements (buttons, labels, placeholders) |
| 2 | auth | Authentication/login messages |
| 3 | navigation | Menu and navigation items |
| 4 | invoices | Invoice-related strings |
| 5 | bills | Vendor bill management strings |
| 6 | vendors | Vendor management strings |
| 7 | ledger | Chart of accounts, GL terminology |
| 8 | accounting | Journal entries, vouchers, transaction terms |
| 9 | payments | Payment tracking terminology |
| 10 | reports | Reports and analytics terms |
| 11 | dashboard | Dashboard KPI and overview text |
| 12 | corporate | KYC onboarding terminology |

---

## Implementation

### Library Stack
- **i18next**: Core translation library
- **react-i18next**: React hooks and components
- **i18next-browser-languagedetector**: Browser language detection

### Usage Pattern

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('invoices');

  return <h1>{t('title')}</h1>;
}
```

### Namespace Loading

```typescript
// Load multiple namespaces
const { t } = useTranslation(['common', 'invoices']);

// Access specific namespace
t('common:save');
t('invoices:status.paid');
```

---

## File Structure

```
src/i18n/
├── index.ts           # i18next configuration
└── locales/
    ├── en/
    │   ├── common.json
    │   ├── auth.json
    │   ├── navigation.json
    │   ├── invoices.json
    │   ├── bills.json
    │   ├── vendors.json
    │   ├── ledger.json
    │   ├── accounting.json
    │   ├── payments.json
    │   ├── reports.json
    │   ├── dashboard.json
    │   └── corporate.json
    ├── de/
    │   └── ... (same structure)
    ├── fr/
    │   └── ... (same structure)
    └── nl/
        └── ... (same structure)
```

---

## Language Persistence

```typescript
// Set language
i18n.changeLanguage('de');
localStorage.setItem('soupfinance_language', 'de');

// Get current language
const currentLang = i18n.language;
```

---

## Date/Number Formatting

- Dates formatted according to user's locale
- Numbers formatted with locale-appropriate separators
- Currency formatted via `useFormatCurrency` hook

```typescript
// Date formatting
new Date().toLocaleDateString(i18n.language);

// Number formatting
new Intl.NumberFormat(i18n.language).format(1234.56);
```
