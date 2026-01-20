# SoupFinance Design System Rules

This document defines the design system for SoupFinance based on the HTML mockups in `soupfinance-designs/`.

---

## Design Foundations

### Color Palette

| Token | Value | Usage | Reference |
|-------|-------|-------|-----------|
| `primary` | `#f24a0d` | Buttons, links, active states, accents | All designs |
| `background-light` | `#f8f6f5` | Page background (light mode) | `financial-overview-dashboard/` |
| `background-dark` | `#221510` | Page background (dark mode) | All designs |
| `surface-light` | `#FFFFFF` | Cards, modals, sidebars (light) | `new-invoice-form/` |
| `surface-dark` | `#1E293B` or `#1f1715` | Cards, modals, sidebars (dark) | `payment-entry-form/` |
| `text-light` | `#181311` | Primary text (light mode) | All designs |
| `text-dark` | `#E2E8F0` | Primary text (dark mode) | `new-invoice-form/` |
| `subtle-text` | `#8a6b60` (light) / `#94A3B8` (dark) | Secondary text, labels | All designs |
| `border-light` | `#e6dedb` | Borders (light mode) | All designs |
| `border-dark` | `#334155` or `white/10` | Borders (dark mode) | All designs |
| `danger` | `#EF4444` / `#D94141` | Error states, delete actions | `invoice-approval-workflow/` |

### Extended Color System

For some designs, additional semantic colors are used:

```javascript
// From new-invoice-form/
"danger": "#EF4444"              // Red-500 - delete buttons

// From item-creation-modal/
"primary-accent": "hsl(25, 95%, 55%)"   // #f2661b - alternative orange
"secondary-accent": "hsl(5, 85%, 60%)"  // #e94b3a - red for errors
"heading-text": "hsl(210, 15%, 25%)"    // #363d45 - dark charcoal
"body-text": "hsl(210, 10%, 45%)"       // #697078 - lighter gray
"border-color": "hsl(210, 20%, 85%)"    // #d2d8de - light gray

// From invoice-approval-workflow/
"orange-primary": "#F7931E"      // Alternative orange for approve
"red-secondary": "#D94141"       // Red for reject
```

### Typography

| Property | Value | Reference |
|----------|-------|-----------|
| **Font Family** | `Manrope` (Google Fonts) | All designs |
| **Fallback** | `"Noto Sans", sans-serif` | All designs |
| **CSS Class** | `font-display` | All designs |

**Font Weights Used:**
- `400` - Normal body text
- `500` - Medium (nav items, labels)
- `600` - Semibold (table headers)
- `700` - Bold (buttons, section headers)
- `800` - Extra Bold (page headings)

**Text Sizes:**
| Element | Size | Weight | Tracking |
|---------|------|--------|----------|
| Page heading | `text-3xl` to `text-4xl` | `font-black` | `tracking-[-0.033em]` |
| Section heading | `text-lg` to `text-[22px]` | `font-bold` | `tracking-[-0.015em]` |
| Body text | `text-base` | `font-normal` | Default |
| Small text | `text-sm` | `font-medium` or `font-normal` | Default |
| Labels | `text-sm` | `font-medium` | Default |
| Tiny/Caption | `text-xs` | `font-medium` | Default |

**Reference:** `financial-overview-dashboard/`, `new-invoice-form/`

### Border Radius

| Token | Value | Usage | Reference |
|-------|-------|-------|-----------|
| `DEFAULT` | `0.25rem` (4px) | Small elements | Tailwind config |
| `lg` | `0.5rem` (8px) | Inputs, buttons | All forms |
| `xl` | `0.75rem` (12px) | Cards, modals, panels | `balance-sheet-report/` |
| `full` | `9999px` | Pills, avatars, circular buttons | All designs |

### Icons

| Property | Value | Reference |
|----------|-------|-----------|
| **Icon Set** | Material Symbols Outlined | All designs |
| **CDN** | `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined` | All designs |
| **Default Settings** | `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24` | All designs |
| **Filled Variant** | `'FILL' 1` | Active nav items |
| **Icon Size** | `text-xl` (20px) or `text-base` (16px) | Context-dependent |

**CSS for Icons:**
```css
.material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
.material-symbols-outlined.fill {
    font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

**Reference:** `general-ledger-entries/`

---

## Layout Components

### Page Layout

Standard layout structure:

```html
<div class="relative flex min-h-screen w-full">
  <!-- SideNavBar (sticky, w-64) -->
  <aside class="flex h-screen w-64 flex-col border-r sticky top-0">...</aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto">
    <div class="p-6 lg:p-8 max-w-7xl mx-auto">...</div>
  </main>
</div>
```

**Alternative: Top Nav Layout** (used in `new-invoice-form/`, `invoice-approval-workflow/`):
```html
<div class="flex h-full grow flex-col">
  <!-- TopNavBar (sticky) -->
  <header class="border-b sticky top-0 z-10">...</header>

  <!-- Main Content -->
  <main class="flex-1">...</main>
</div>
```

**Reference:** `balance-sheet-report/`, `new-invoice-form/`

### Side Navigation Bar

**Structure:**
```html
<aside class="flex h-screen w-64 flex-col border-r border-[#e6dedb] dark:border-gray-700 bg-white dark:bg-[#1a0f0a] sticky top-0">
  <div class="flex flex-col justify-between p-4 h-full">
    <!-- Logo & Company -->
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-3 px-3">
        <div class="size-10 rounded-full bg-cover bg-center"></div>
        <div class="flex flex-col">
          <h1 class="text-base font-medium">Company Name</h1>
          <p class="text-sm text-[#8a6b60]">Subtitle</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex flex-col gap-2 mt-4">
        <!-- Nav Item (Default) -->
        <a class="flex items-center gap-3 px-3 py-2 text-[#8a6b60] hover:bg-[#f5f1f0] rounded-lg">
          <span class="material-symbols-outlined">dashboard</span>
          <p class="text-sm font-medium">Dashboard</p>
        </a>

        <!-- Nav Item (Active) -->
        <a class="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">receipt_long</span>
          <p class="text-sm font-bold">Invoices</p>
        </a>
      </nav>
    </div>

    <!-- Bottom Links (Help, Logout) -->
    <div class="flex flex-col gap-1">...</div>
  </div>
</aside>
```

**Reference:** `balance-sheet-report/`, `ar-aging-report/`, `audit-trail-log/`

### Top Navigation Bar

**Structure:**
```html
<header class="flex items-center justify-between whitespace-nowrap border-b border-[#e6dedb] px-6 lg:px-10 py-3 bg-white sticky top-0 z-10">
  <!-- Left: Logo/Brand -->
  <div class="flex items-center gap-4">
    <div class="size-6 text-primary"><!-- SVG Logo --></div>
    <h2 class="text-lg font-bold">App Name</h2>
  </div>

  <!-- Center: Navigation (optional) -->
  <nav class="hidden md:flex items-center gap-6">
    <a class="text-sm font-medium text-[#8a6b60] hover:text-primary">Dashboard</a>
    <a class="text-sm font-bold text-primary">Invoices</a>
  </nav>

  <!-- Right: Actions & Avatar -->
  <div class="flex items-center gap-4">
    <button class="size-10 rounded-full bg-[#f5f1f0]"><!-- Notification icon --></button>
    <div class="size-10 rounded-full bg-cover"></div>
  </div>
</header>
```

**Reference:** `new-invoice-form/`, `invoice-approval-workflow/`

### Page Header

**Structure:**
```html
<div class="flex flex-wrap justify-between items-center gap-4 mb-8">
  <!-- Title & Subtitle -->
  <div class="flex flex-col gap-1">
    <p class="text-3xl font-black tracking-[-0.033em]">Page Title</p>
    <p class="text-base font-normal text-[#8a6b60]">Page description here.</p>
  </div>

  <!-- Action Buttons -->
  <div class="flex flex-wrap gap-3">
    <button class="...">Cancel</button>
    <button class="...">Save Draft</button>
    <button class="... bg-primary text-white">Save</button>
  </div>
</div>
```

**Reference:** `new-invoice-form/`, `balance-sheet-report/`

---

## UI Components

### Buttons

**Primary Button:**
```html
<button class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90">
  <span class="truncate">Save</span>
</button>
```

**Secondary Button (Ghost/Outline):**
```html
<button class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30">
  <span class="truncate">Save Draft</span>
</button>
```

**Neutral Button:**
```html
<button class="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-[#f5f1f0] dark:bg-gray-700 text-[#181311] dark:text-white text-sm font-bold hover:bg-gray-200">
  <span class="truncate">Cancel</span>
</button>
```

**Outline Button:**
```html
<button class="flex items-center justify-center gap-2 rounded-lg h-10 px-4 border border-primary text-primary hover:bg-primary/10">
  <span class="material-symbols-outlined">picture_as_pdf</span>
  <span class="text-sm font-bold">PDF</span>
</button>
```

**Icon Button (Circular):**
```html
<button class="flex items-center justify-center size-10 rounded-full bg-[#f5f1f0] text-[#181311]">
  <span class="material-symbols-outlined">notifications</span>
</button>
```

**Danger Button:**
```html
<button class="... bg-red-secondary hover:bg-red-secondary/90 text-white">
  <span class="material-symbols-outlined">cancel</span>
  <span>Reject</span>
</button>
```

**Button Sizes:**
- Default: `h-10 px-4`
- Large: `h-14 px-6` (login form submit)
- Small: `h-9 px-3`

**Reference:** `new-invoice-form/`, `invoice-approval-workflow/`, `balance-sheet-report/`

### Form Inputs

**Text Input:**
```html
<label class="flex flex-col">
  <p class="text-sm font-medium pb-2">Label</p>
  <input class="form-input flex w-full h-12 rounded-lg border border-[#e6dedb] bg-white dark:bg-background-dark px-4 text-base placeholder:text-[#8a6b60] focus:border-primary focus:ring-2 focus:ring-primary/50 focus:outline-0"
         placeholder="Enter value" />
</label>
```

**Select Dropdown:**
```html
<label class="flex flex-col">
  <p class="text-sm font-medium pb-2">Label</p>
  <select class="form-select flex w-full h-12 rounded-lg border border-[#e6dedb] bg-white dark:bg-background-dark px-3 text-base focus:border-primary focus:ring-2 focus:ring-primary/50">
    <option>Option 1</option>
    <option>Option 2</option>
  </select>
</label>
```

**Textarea:**
```html
<label class="flex flex-col">
  <p class="text-sm font-medium pb-2">Notes</p>
  <textarea class="form-textarea w-full rounded-lg border border-[#e6dedb] bg-white p-4 focus:border-primary focus:ring-primary/50"
            rows="3"
            placeholder="Add notes..."></textarea>
</label>
```

**Date Input:**
```html
<input class="form-input h-12 rounded-lg border border-[#e6dedb] px-3" type="date" value="2024-10-26" />
```

**Currency Input (with prefix):**
```html
<div class="relative">
  <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-[#8a6b60]">$</span>
  <input class="form-input w-full h-12 pl-7 pr-4 rounded-lg border border-[#e6dedb]" type="text" value="2500.00" />
</div>
```

**Search Input:**
```html
<div class="relative">
  <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
  <input class="w-full pl-10 pr-4 py-2 rounded-lg border border-[#e6dedb] focus:ring-primary"
         type="search"
         placeholder="Search..." />
</div>
```

**Read-only Input:**
```html
<input class="form-input h-12 rounded-lg border border-[#e6dedb] bg-background-light/50 text-[#8a6b60] cursor-not-allowed"
       readonly
       value="INV-2024-00123" />
```

**Reference:** `new-invoice-form/`, `payment-entry-form/`, `item-creation-modal/`

### Cards

**Basic Card:**
```html
<div class="bg-white dark:bg-surface-dark rounded-xl border border-[#e6dedb] dark:border-gray-700 shadow-sm">
  <div class="px-6 py-4 border-b border-[#e6dedb]">
    <h2 class="text-[22px] font-bold">Section Title</h2>
  </div>
  <div class="p-6">
    <!-- Content -->
  </div>
</div>
```

**Stat Card:**
```html
<div class="flex flex-col gap-2 rounded-xl p-6 border border-[#e6dedb] bg-white">
  <p class="text-[#8a6b60] text-base font-medium">Total Revenue</p>
  <p class="text-[#181311] tracking-tight text-2xl font-bold">$125,430.50</p>
  <p class="text-green-600 text-sm font-medium flex items-center gap-1">
    <span class="material-symbols-outlined text-base">arrow_upward</span>+2.5%
  </p>
</div>
```

**Highlighted Card (primary accent):**
```html
<div class="bg-primary/10 dark:bg-primary/20 p-4 rounded-lg border border-primary/30">
  <p class="text-sm text-primary/80">Remaining Balance</p>
  <p class="text-2xl font-bold text-primary">$2,500.00</p>
</div>
```

**Reference:** `financial-overview-dashboard/`, `balance-sheet-report/`, `payment-entry-form/`

### Tables

**Standard Data Table:**
```html
<div class="rounded-xl border border-[#e6dedb] bg-white overflow-hidden">
  <div class="p-6 border-b border-[#e6dedb]">
    <h3 class="text-lg font-bold">Table Title</h3>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-sm text-left">
      <thead class="text-xs text-[#8a6b60] uppercase bg-[#f5f1f0]">
        <tr>
          <th class="px-6 py-3">Column 1</th>
          <th class="px-6 py-3">Column 2</th>
          <th class="px-6 py-3 text-right">Amount</th>
          <th class="px-6 py-3 text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-[#e6dedb] hover:bg-primary/5">
          <td class="px-6 py-4 font-medium text-primary">INV-0123</td>
          <td class="px-6 py-4">Value</td>
          <td class="px-6 py-4 text-right">$2,500.00</td>
          <td class="px-6 py-4 text-center">
            <span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Paid</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**Hierarchical/Expandable Table (Balance Sheet style):**
```html
<tbody>
  <!-- Parent Row -->
  <tr class="bg-gray-50 font-bold">
    <td class="p-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-lg">expand_more</span> Assets
    </td>
    <td class="text-right p-4">$1,450,830.00</td>
  </tr>
  <!-- Child Row (indented) -->
  <tr class="hover:bg-primary/10">
    <td class="pl-12 p-2">Current Assets</td>
    <td class="text-right p-2 font-medium">$943,039.00</td>
  </tr>
  <!-- Grandchild Row (more indented) -->
  <tr class="hover:bg-primary/10 text-[#8a6b60]">
    <td class="pl-16 p-2">Cash and cash equivalents</td>
    <td class="text-right p-2">$250,120.00</td>
  </tr>
</tbody>
```

**Reference:** `invoice-management/`, `balance-sheet-report/`, `financial-overview-dashboard/`

### Status Badges

```html
<!-- Paid / Success -->
<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Paid</span>

<!-- Pending / Warning -->
<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">Pending</span>

<!-- Overdue / Error -->
<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Overdue</span>

<!-- Sent / Info -->
<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">Sent</span>

<!-- Draft / Neutral -->
<span class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Draft</span>
```

**Reference:** `invoice-management/`, `payment-entry-form/`

### Modals

**Structure:**
```html
<!-- Overlay -->
<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
  <!-- Modal Container -->
  <div class="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#e6dedb] p-6">
      <p class="text-xl font-bold">Modal Title</p>
      <button class="flex size-8 items-center justify-center rounded-full hover:bg-black/10">
        <span class="material-symbols-outlined text-2xl">close</span>
      </button>
    </div>

    <!-- Body -->
    <div class="p-6">
      <!-- Form fields -->
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-3 border-t border-[#e6dedb] p-6">
      <button class="... bg-transparent ring-1 ring-[#e6dedb]">Cancel</button>
      <button class="... bg-primary text-white">Confirm</button>
    </div>
  </div>
</div>
```

**Reference:** `item-creation-modal/`

### Workflow/Timeline

**Vertical Timeline:**
```html
<div class="grid grid-cols-[32px_1fr] gap-x-2">
  <!-- Completed Step -->
  <div class="flex flex-col items-center gap-1 pt-1.5">
    <div class="text-green-500">
      <span class="material-symbols-outlined">task_alt</span>
    </div>
    <div class="w-[2px] bg-gray-200 h-full grow"></div>
  </div>
  <div class="flex flex-col pb-6">
    <p class="text-base font-medium">Submitted</p>
    <p class="text-sm text-[#8a6b60]">Completed by Sales Dept on 2023-10-25</p>
  </div>

  <!-- Current Step (animated) -->
  <div class="flex flex-col items-center gap-1">
    <div class="w-[2px] bg-gray-200 h-1"></div>
    <div class="text-orange-500 animate-pulse">
      <span class="material-symbols-outlined">hourglass_top</span>
    </div>
    <div class="w-[2px] bg-gray-200 h-full grow"></div>
  </div>
  <div class="flex flex-col pb-6">
    <p class="text-orange-500 text-base font-bold">Manager Review</p>
    <p class="text-sm text-[#8a6b60]">Pending approval</p>
  </div>

  <!-- Pending Step -->
  <div class="flex flex-col items-center gap-1">
    <div class="w-[2px] bg-gray-200 h-1"></div>
    <div class="text-gray-400">
      <span class="material-symbols-outlined">radio_button_unchecked</span>
    </div>
  </div>
  <div class="flex flex-col">
    <p class="text-[#8a6b60] text-base font-medium">Finance Review</p>
    <p class="text-gray-400 text-sm">Awaiting review</p>
  </div>
</div>
```

**Reference:** `invoice-approval-workflow/`

### Filter Chips

```html
<button class="flex h-9 items-center gap-2 rounded-lg bg-[#f5f1f0] pl-4 pr-2 text-[#181311] hover:bg-gray-200">
  <p class="text-sm font-medium">Filter Label</p>
  <span class="material-symbols-outlined text-base">arrow_drop_down</span>
</button>
```

**Reference:** `audit-trail-log/`, `balance-sheet-report/`

### Pagination

```html
<div class="flex items-center justify-between mt-4">
  <p class="text-sm text-gray-600">
    Showing <span class="font-semibold">1</span> to <span class="font-semibold">5</span> of <span class="font-semibold">50</span> results
  </p>
  <div class="flex items-center">
    <a class="flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
      <span class="material-symbols-outlined">chevron_left</span>
    </a>
    <a class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">1</a>
    <a class="flex size-9 items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100">2</a>
    <a class="flex size-9 items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100">3</a>
    <span class="flex size-9 items-center justify-center text-sm text-gray-600">...</span>
    <a class="flex size-9 items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100">10</a>
    <a class="flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
      <span class="material-symbols-outlined">chevron_right</span>
    </a>
  </div>
</div>
```

**Reference:** `invoice-management/`

### Breadcrumbs

```html
<div class="flex flex-wrap gap-2">
  <a class="text-[#8a6b60] text-sm font-medium" href="#">Dashboard</a>
  <span class="text-[#8a6b60] text-sm">/</span>
  <a class="text-[#8a6b60] text-sm font-medium" href="#">Reports</a>
  <span class="text-[#8a6b60] text-sm">/</span>
  <span class="text-[#181311] text-sm font-medium">Current Page</span>
</div>
```

**Reference:** `ar-aging-report/`

### File Upload Dropzone

```html
<div class="flex items-center justify-center w-full">
  <label class="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-[#f5f1f0] hover:bg-gray-100">
    <div class="flex flex-col items-center justify-center pt-5 pb-6">
      <span class="material-symbols-outlined text-gray-500 mb-2">cloud_upload</span>
      <p class="text-sm text-gray-500"><span class="font-semibold">Click to upload</span> or drag and drop</p>
      <p class="text-xs text-gray-500">PDF, PNG, JPG or GIF (MAX. 5MB)</p>
    </div>
    <input class="hidden" type="file" />
  </label>
</div>
```

**Reference:** `payment-entry-form/`

---

## Charts & Data Visualization

### Donut Chart (SVG)

```html
<div class="relative flex items-center justify-center h-48">
  <svg class="w-full h-full" viewBox="0 0 36 36">
    <!-- Background ring -->
    <circle class="stroke-current text-orange-200" cx="18" cy="18" r="15.9" fill="transparent" stroke-width="3"></circle>
    <!-- Data ring -->
    <circle class="stroke-current text-primary" cx="18" cy="18" r="15.9" fill="transparent"
            stroke-dasharray="65, 35" stroke-dashoffset="25" stroke-width="3"></circle>
  </svg>
  <!-- Center label -->
  <div class="absolute flex flex-col items-center">
    <span class="text-xs text-[#8a6b60]">Total</span>
    <span class="text-xl font-bold">$1.45M</span>
  </div>
</div>
```

### Progress Bar

```html
<div class="flex flex-col gap-1">
  <div class="flex justify-between text-sm">
    <span class="text-[#8a6b60]">Label</span>
    <span class="font-bold">$1.45M</span>
  </div>
  <div class="w-full h-2 bg-gray-200 rounded-full">
    <div class="h-2 bg-primary rounded-full" style="width: 65%;"></div>
  </div>
</div>
```

### Stacked Progress Bar

```html
<div class="w-full h-2 bg-gray-200 rounded-full flex">
  <div class="h-2 bg-red-500 rounded-l-full" style="width: 46.9%;"></div>
  <div class="h-2 bg-gray-400 rounded-r-full" style="width: 53.1%;"></div>
</div>
```

**Reference:** `balance-sheet-report/`, `financial-overview-dashboard/`

---

## Dark Mode

Dark mode is implemented using Tailwind's `class` strategy. Toggle by adding/removing `dark` class on `<html>`.

**Key Dark Mode Patterns:**

```html
<!-- Background -->
<body class="bg-background-light dark:bg-background-dark">

<!-- Surface (cards) -->
<div class="bg-white dark:bg-[#1f1715]">

<!-- Text -->
<p class="text-[#181311] dark:text-white">Primary text</p>
<p class="text-[#8a6b60] dark:text-gray-400">Secondary text</p>

<!-- Borders -->
<div class="border-[#e6dedb] dark:border-gray-700">

<!-- Inputs -->
<input class="bg-white dark:bg-background-dark border-[#e6dedb] dark:border-gray-600">

<!-- Hover States -->
<a class="hover:bg-[#f5f1f0] dark:hover:bg-white/10">

<!-- Active Navigation -->
<a class="bg-primary/10 dark:bg-primary/20 text-primary">
```

---

## Screen Catalog

### Authentication
| Screen | Path | Description |
|--------|------|-------------|
| Login | `login-authentication/` | Split-screen login with branding |

### Dashboard
| Screen | Path | Description |
|--------|------|-------------|
| Financial Overview | `financial-overview-dashboard/` | KPIs, charts, recent invoices table |
| Reporting Hub | `reporting-and-analytics/` | Analytics overview |

### Invoices
| Screen | Path | Description |
|--------|------|-------------|
| Invoice List | `invoice-management/` | Paginated table with status badges |
| New Invoice Form | `new-invoice-form/` | Full invoice creation form with line items |
| Invoice Preview | `invoice-draft-preview/` | Preview before sending |
| Line Items Table | `invoice-line-items-table/` | Editable line items component |
| Invoice Metadata | `advanced-invoice-metadata/` | Extended invoice details |
| Status Summary | `invoice-status-summary/` | Invoice status dashboard |
| Status Log | `invoice-status-update-log/` | Status change history |
| Validation | `invoice-validation-checker/` | Invoice validation rules |
| Approval Workflow | `invoice-approval-workflow/` | Multi-step approval with timeline |
| Archive | `closed-invoice-archive/` | Completed/closed invoices |

### Payments
| Screen | Path | Description |
|--------|------|-------------|
| Payment Entry | `payment-entry-form/` | Record payment against invoice |
| Payment Allocation | `payment-allocation-screen/` | Allocate payments to invoices |
| Payment History | `payment-history-report/` | Payment transaction history |

### Vendors/Clients
| Screen | Path | Description |
|--------|------|-------------|
| Client Management | `vendor-client-management/` | Client CRUD list |
| Vendor Payment Analysis | `vendor-payment-analysis/` | Vendor payment trends |

### Items/Services
| Screen | Path | Description |
|--------|------|-------------|
| Services Catalog | `item-services-catalog-browser/` | Browse services/products |
| Item Creation Modal | `item-creation-modal/` | Add new item modal |
| Services Grid | `services-selection-grid/` | Select services grid |

### Financial Reports
| Screen | Path | Description |
|--------|------|-------------|
| Balance Sheet | `balance-sheet-report/` | Assets/Liabilities/Equity |
| Income Statement | `income-statement-report/` | Revenue/Expenses/Net Income |
| Cash Flow Statement | `cash-flow-statement-report/` | Cash flow operations |
| Trial Balance | `trial-balance-report/` | Debits/Credits balance |
| P&L Summary | `profit-and-loss-summary-report/` | Profit & Loss |
| Budget vs Actual | `budget-vs-actual-variance-report/` | Budget variance analysis |
| Expense Breakdown | `expense-category-breakdown/` | Expense by category |

### Equity Reports
| Screen | Path | Description |
|--------|------|-------------|
| Statement of Changes | `statement-of-changes-in-equity/` | Equity changes |
| Retained Earnings | `retained-earnings-statement/` | Retained earnings |

### Aging Reports
| Screen | Path | Description |
|--------|------|-------------|
| A/R Aging | `ar-aging-report/` | Accounts receivable aging |
| A/P Aging | `ap-aging-report/` | Accounts payable aging |

### General Ledger
| Screen | Path | Description |
|--------|------|-------------|
| GL Entries | `general-ledger-entries/` | Ledger transactions |
| GL Integration | `gl-integration-mapping/` | Account mapping |
| GL Reconciliation | `gl-reconciliation-report/` | Reconciliation report |

### Other Reports
| Screen | Path | Description |
|--------|------|-------------|
| Tax Liability | `tax-liability-report/` | Tax obligations |
| Inventory Valuation | `inventory-valuation-report/` | Inventory value |
| Customer Credit Limit | `customer-credit-limit-report/` | Credit limits |
| Audit Trail | `audit-trail-log/` | System audit log |

### Utilities
| Screen | Path | Description |
|--------|------|-------------|
| Amount Due Tracker | `amount-due-tracker/` | Outstanding amounts |
| Amount Due Summary | `amount-due-summary/` | Due amounts overview |
| Overdue Reminders | `overdue-reminder-generator/` | Generate overdue notices |
| Tax Calculator | `tax-and-discount-calculator/` | Tax & discount tool |

### Loading States
| Screen | Path | Description |
|--------|------|-------------|
| Full Page Spinner | `loading-full-page-spinner/` | Centered spinner with "Loading" text |
| Table Skeleton | `loading-table-skeleton/` | Invoice table placeholder rows |
| Dashboard Skeleton | `loading-dashboard-skeleton/` | Dashboard cards with shimmer |
| Button Saving | `loading-button-saving-state/` | Button with spinner and "Saving..." |
| Data Sync Indicator | `loading-data-sync-indicator/` | Top banner with sync progress |

### Empty States
| Screen | Path | Description |
|--------|------|-------------|
| No Invoices | `empty-state-no-invoices/` | CTA to create first invoice |
| No Clients | `empty-state-no-clients/` | CTA to add first client |
| No Payments | `empty-state-no-payments/` | CTA to record payment |
| No Notifications | `empty-state-no-notifications/` | Bell icon with "All caught up" |
| No Search Results | `empty-state-no-search-results/` | Try different keywords |
| Welcome Dashboard | `empty-state-welcome-dashboard/` | New user onboarding checklist |

### Error States
| Screen | Path | Description |
|--------|------|-------------|
| 404 Not Found | `error-404-page-not-found/` | Page not found with home link |
| 500 Server Error | `error-500-internal-server/` | Server error with support contact |
| 403 Access Denied | `error-403-access-denied/` | Permission denied screen |
| Offline Connection | `error-offline-connection/` | No internet connection |
| Session Expired | `error-session-expired-page/` | Full page session expired |

### Alerts & Notifications
| Screen | Path | Description |
|--------|------|-------------|
| Success Banner | `alert-banner-success/` | Green banner with checkmark |
| Error Banner | `alert-banner-error/` | Red banner with retry button |
| Warning Banner | `alert-banner-warning/` | Yellow banner with action |
| Info Banner | `alert-banner-info/` | Blue banner with dismiss |
| Toast Stack | `alert-toast-notification-stack/` | Stacked toast notifications |
| Notification Dropdown | `interactive-notification-dropdown/` | Header notification popover |

### Modals & Dialogs
| Screen | Path | Description |
|--------|------|-------------|
| Delete Confirmation | `modal-delete-confirmation/` | Destructive action modal |
| Discard Changes | `modal-discard-changes/` | Unsaved changes warning |
| Export Options | `modal-export-options/` | PDF/Excel/CSV export selection |
| File Upload Progress | `modal-file-upload-progress/` | Upload progress with cancel |
| Quick Edit Client | `modal-quick-edit-client/` | Inline client edit form |
| Session Timeout | `modal-session-timeout/` | "Stay logged in?" warning |
| Success Confirmation | `modal-success-confirmation/` | Success checkmark modal |
| Invoice Detail Panel | `panel-invoice-detail-slideover/` | Right-side slide-over panel |

### Form Elements (Component Styles)
| Screen | Path | Description | Also applies to |
|--------|------|-------------|-----------------|
| Checkbox Styles | `form-checkbox-styles/` | Settings notification preferences | Any checkbox group |
| Radio Button Styles | `form-radio-button-styles/` | Payment method selection | Any radio selection |
| Toggle Switch Styles | `form-toggle-switch-styles/` | General preferences toggles | Any on/off settings |
| Multi-select Dropdown | `form-multiselect-dropdown/` | Team assignment with tags | Any multi-select |
| Date Range Picker | `form-date-range-picker/` | Calendar popup with range | Any date filters |
| Search Autocomplete | `form-search-autocomplete/` | Grouped search results | Any search field |
| Validation Errors | `form-validation-error-states/` | Inline field error messages | Any form validation |
| GL Transactions Base | `gl-transactions-base-page/` | Base GL page layout | Reference for data tables |

### Interactive Elements
| Screen | Path | Description | Also applies to |
|--------|------|-------------|-----------------|
| User Profile Dropdown | `interactive-user-profile-dropdown/` | Header profile menu | Any user menu |
| Action Dropdown | `interactive-action-dropdown-menu/` | Row three-dot menu | Any action menus |
| Tooltip Examples | `interactive-tooltip-examples/` | Form field help icons | Any tooltip usage |
| Avatar Status | `interactive-avatar-status-team/` | Team member status dots | Any presence indicators |
| Invoice Actions | `interactive-invoice-actions/` | Table row action menu | Any table actions |
| Context Menu | `interactive-context-menu/` | Right-click popover menu | Any context menus |
| Team Status Card | `interactive-team-status-card/` | Standalone team widget | Any team displays |

### P&L Report Variants
| Screen | Path | Description |
|--------|------|-------------|
| Table Layout | `report-pnl-table-layout/` | Standard hierarchical table |
| Expandable Sections | `report-pnl-expandable/` | Collapsible category sections |
| Comparison View | `report-pnl-comparison/` | Year-over-year columns |
| Dashboard View | `report-pnl-dashboard/` | Charts and summary cards |
| Annotated | `report-pnl-annotated/` | Notes and highlights |
| Simplified Summary | `report-pnl-simplified/` | Executive summary view |

### Mobile Navigation
| Screen | Path | Description |
|--------|------|-------------|
| Bottom Navigation | `mobile-bottom-nav/` | 5-icon bottom bar (primary) |
| Mobile Header | `mobile-header/` | Header with search (primary) |
| Side Navigation | `mobile-sidenav/` | Organized slide-out menu (primary) |
| Filter Drawer | `mobile-filter-drawer/` | Bottom sheet filter panel (primary) |
| Invoice List | `mobile-invoice-list/` | Card-based invoice list (primary) |
| Invoice Form | `mobile-invoice-form/` | Sectioned mobile form (primary) |
| Bottom Nav (Alt) | `mobile-bottom-nav-alt/` | Alternative icon style |
| Header (Alt) | `mobile-header-alt/` | Basic header variant |
| Sidenav (Alt) | `mobile-sidenav-alt/` | Simple menu variant |
| Filter Drawer (Alt) | `mobile-filter-drawer-alt/` | Simplified filters |
| Invoice List (Alt) | `mobile-invoice-list-alt/` | Alternative card layout |
| Invoice Form (Alt) | `mobile-invoice-form-alt/` | Basic mobile form |

---

## Tailwind Configuration Template

Use this as the base `tailwind.config.js` when implementing:

```javascript
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#f24a0d",
        "background-light": "#f8f6f5",
        "background-dark": "#221510",
        "surface-light": "#FFFFFF",
        "surface-dark": "#1E293B",
        "text-light": "#181311",
        "text-dark": "#E2E8F0",
        "subtle-text-light": "#8a6b60",
        "subtle-text-dark": "#94A3B8",
        "border-light": "#e6dedb",
        "border-dark": "#334155",
        "danger": "#EF4444",
      },
      fontFamily: {
        "display": ["Manrope", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
```

---

## Implementation Checklist

When building components from these designs:

- [ ] Use semantic color tokens (`primary`, `background-light`, etc.)
- [ ] Include both light and dark mode variants
- [ ] Use Manrope font from Google Fonts
- [ ] Use Material Symbols Outlined icons
- [ ] Implement responsive breakpoints (`sm:`, `md:`, `lg:`)
- [ ] Use proper focus states (`focus:ring-2 focus:ring-primary/50`)
- [ ] Add hover states to interactive elements
- [ ] Maintain consistent spacing (4px grid: `p-1`, `p-2`, `p-4`, `p-6`, `p-8`)
- [ ] Use `truncate` for text that may overflow
- [ ] Add `overflow-hidden` to containers with rounded corners
