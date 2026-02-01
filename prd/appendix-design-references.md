# Design References

[← Back to PRD Index](../PRD.md)

---

## Design Assets Location

All UI mockups available in `soupfinance-designs/`:

- **114 screen designs**
- Dark and light mode variants
- Mobile and desktop layouts
- PNG screenshots for reference

---

## Design System

### Typography

| Property | Value |
|----------|-------|
| Font Family | Manrope (Google Fonts) |
| Font Weights | 400 (regular), 500 (medium), 600 (semibold), 700 (bold) |

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#f24a0d` | Buttons, links, accents |
| Background Light | `#ffffff` | Light mode background |
| Background Dark | `#1a1a1a` | Dark mode background |
| Text Primary | `#1a1a1a` | Main text (light mode) |
| Text Primary Dark | `#ffffff` | Main text (dark mode) |

### Icons

| Property | Value |
|----------|-------|
| Library | Material Symbols Outlined |
| Weight | 400 |
| Size | 20px (default), 24px (large) |

### Framework

| Property | Value |
|----------|-------|
| CSS Framework | TailwindCSS v4 |
| Design Tokens | Defined in `src/index.css` |

---

## Dark Mode

| Aspect | Implementation |
|--------|----------------|
| Strategy | CSS class on `<html>` element |
| Classes | `dark:bg-*`, `dark:text-*` |
| Persistence | localStorage `theme` key |
| Detection | `prefers-color-scheme` media query |

All components must include dark mode variants.

---

## Screen Categories

### Authentication (4 screens)
- Login
- Register
- Confirm Email
- Password Reset

### Dashboard (2 screens)
- Dashboard Light
- Dashboard Dark

### Invoices (6 screens)
- Invoice List
- Invoice Create
- Invoice Edit
- Invoice Detail
- Invoice Preview (Print)
- Invoice Send Modal

### Bills (5 screens)
- Bill List
- Bill Create
- Bill Edit
- Bill Detail
- Bill Payment Modal

### Vendors (4 screens)
- Vendor List
- Vendor Create
- Vendor Edit
- Vendor Detail

### Clients (5 screens)
- Client List
- Client Create (Individual)
- Client Create (Corporate)
- Client Edit
- Client Detail

### Ledger (4 screens)
- Chart of Accounts
- Account Detail
- Ledger Transactions
- Transaction Detail

### Accounting (6 screens)
- Journal Entry Form
- Journal Entry Detail
- Voucher List
- Payment Voucher
- Receipt Voucher
- Transaction Register

### Reports (8 screens)
- Reports Hub
- Trial Balance
- Profit & Loss
- Balance Sheet
- Cash Flow Statement
- AR Aging
- AP Aging
- Account Transactions

### Corporate KYC (5 screens)
- Company Info
- Directors List
- Add Director
- Documents Upload
- KYC Status

### Settings (6 screens)
- Settings Hub
- Account Settings
- User List
- User Form
- Bank Account List
- Bank Account Form

---

## Component Library

Documented in Storybook at `npm run storybook`:

### Layout Components
- MainLayout
- AuthLayout
- SideNav
- TopNav
- PageHeader

### Form Components
- Input
- Select
- Textarea
- Checkbox
- Radio
- DatePicker
- FileUpload

### Feedback Components
- AlertBanner
- Spinner
- Toast
- Tooltip
- Modal
- ConfirmDialog

### Data Components
- DataTable
- Pagination
- Badge
- Avatar
- Card

### Chart Components
- LineChart
- BarChart
- PieChart
- KpiCard

---

## Responsive Breakpoints

| Breakpoint | Range | Layout |
|------------|-------|--------|
| Mobile | 320px - 767px | Single column, hamburger menu |
| Tablet | 768px - 1023px | Collapsible sidebar |
| Desktop | 1024px+ | Full sidebar |

---

## Accessibility

| Requirement | Standard |
|-------------|----------|
| Keyboard Navigation | Full support |
| Screen Readers | ARIA labels |
| Color Contrast | WCAG 2.1 AA (4.5:1) |
| Focus Indicators | Visible focus rings |
| Alt Text | Required for images |

---

## File Naming Convention

```
{feature}-{screen}-{variant}.png

Examples:
invoices-list-light.png
invoices-list-dark.png
invoice-create-light.png
invoice-detail-mobile.png
```
