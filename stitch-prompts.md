# Stitch Design Prompts for SoupFinance

These prompts are for Google Stitch to create missing design screens. Each prompt creates 6 screens.

**Design Style to Maintain:**
- Orange brand color (#f24a0d)
- Light cream background (#f8f6f5)
- Dark brown for dark mode (#221510)
- Manrope font
- Material icons (outlined style)
- Rounded corners on cards and buttons
- Clean, professional accounting software look

---

## Prompt 1: Loading and Progress Screens (6 screens)

```
Create 6 screens for a corporate accounting web app showing loading states:

1. Full page loading - A centered spinning circle loader on a light cream background with the text "Loading..." below it. Show a faded company logo above the spinner.

2. Table loading skeleton - An invoice list page where the table rows are replaced with gray animated shimmer rectangles. Show 5 placeholder rows with boxes where the invoice number, client name, date, and amount would be.

3. Dashboard cards loading - A dashboard with 4 stat cards at the top, but each card shows gray shimmer boxes instead of real numbers. The sidebar and header should look normal.

4. Button loading state - A form with a "Save Invoice" button that shows a small spinning circle inside the button with the text "Saving..." The button should look slightly faded and not clickable.

5. File upload progress - A modal popup showing a file being uploaded. Include a progress bar that is 65% filled with orange, the filename "invoice-backup.pdf", file size, and a cancel button.

6. Data syncing indicator - A small banner at the top of a page showing "Syncing your data..." with a spinning icon and a subtle blue background. The rest of the page shows normal content below.

Style: Clean corporate look, orange as accent color, light cream backgrounds, rounded corners, professional feel.
```

---

## Prompt 2: Empty State Screens (6 screens)

```
Create 6 screens for a corporate accounting web app showing empty states when there is no data:

1. No invoices yet - An invoice list page that is empty. Show a friendly illustration of an empty folder or document, with the heading "No invoices yet" and text "Create your first invoice to get started." Include an orange "Create Invoice" button.

2. No search results - A search results page showing "No results found for 'xyz'" with an illustration of a magnifying glass finding nothing. Add text "Try adjusting your search or filters" and a "Clear Search" button.

3. No payments recorded - A payments page that is empty. Show an illustration of an empty wallet or coins, heading "No payments recorded", and text "Payments will appear here once recorded." Include an "Add Payment" button.

4. No clients added - A client list page with no clients. Show an illustration of people silhouettes, heading "No clients yet", text "Add your first client to start sending invoices." Include an "Add Client" button.

5. No notifications - A notifications dropdown panel that is empty. Show a small bell icon with "No notifications" text and "You're all caught up!" message in a clean dropdown box.

6. Welcome new user dashboard - A dashboard for a brand new user with no data. Show empty stat cards with "$0" values, a welcome message "Welcome to SoupFinance!", and quick action buttons: "Add Client", "Create Invoice", "Set Up Company".

Style: Friendly illustrations, encouraging messages, orange accent buttons, light backgrounds, not sad or negative feeling.
```

---

## Prompt 3: Error State Screens (6 screens)

```
Create 6 screens for a corporate accounting web app showing error states:

1. Form validation errors - An invoice form where some fields have errors. Show red borders around the "Client" dropdown (empty) and "Due Date" field (invalid). Below each field show red text like "Please select a client" and "Due date cannot be in the past". The Save button should still be visible.

2. Page not found (404) - A full page error showing a large "404" number, an illustration of a lost document or broken link, heading "Page not found", text "The page you're looking for doesn't exist or has been moved." Include a "Go to Dashboard" button.

3. Server error (500) - A full page error showing "Something went wrong" with an illustration of a broken server or gears, text "We're having technical difficulties. Please try again later." Include "Try Again" and "Contact Support" buttons.

4. No internet connection - A full page showing an illustration of a disconnected wifi or broken cable, heading "No internet connection", text "Please check your connection and try again." Include a "Retry" button.

5. Session expired - A popup modal in the center of a faded page, showing a clock or lock icon, heading "Session Expired", text "Your session has timed out for security reasons. Please log in again." Include a "Log In Again" button.

6. Access denied - A full page showing a lock or shield icon, heading "Access Denied", text "You don't have permission to view this page. Contact your administrator if you think this is a mistake." Include a "Go Back" button.

Style: Clear error messaging, red for errors but not aggressive, helpful text, easy-to-find action buttons, professional look.
```

---

## Prompt 4: Notification and Alert Screens (6 screens)

```
Create 6 screens for a corporate accounting web app showing notifications and alerts:

1. Notification dropdown panel - When the bell icon is clicked, show a dropdown panel with a list of 5 notifications. Each notification has an icon, title like "Invoice #1234 paid", time like "2 hours ago", and some are unread (with a blue dot). Include "Mark all as read" link at top and "View all" link at bottom.

2. Success alert banner - A green banner at the top of a page (below the header) showing a checkmark icon and text "Invoice successfully sent to client@email.com" with an X button to close it.

3. Warning alert banner - A yellow/amber banner at the top of a page showing a warning triangle icon and text "Your subscription expires in 7 days. Upgrade now to avoid interruption." with "Upgrade" and "Dismiss" buttons.

4. Error alert banner - A red banner at the top of a page showing an error icon and text "Failed to save invoice. Please try again." with a "Retry" button and X to close.

5. Info alert banner - A blue banner at the top of a page showing an info icon and text "System maintenance scheduled for Sunday 2am-4am. You may experience brief downtime." with an X to close.

6. Toast notification stack - The bottom-right corner of a page showing 3 stacked small toast popups: one green "Payment recorded", one blue "Report exported", one orange "Reminder set". Each has an X to close and auto-fades.

Style: Distinct colors for each type (green=success, yellow=warning, red=error, blue=info), not too tall, easy to dismiss, professional.
```

---

## Prompt 5: Modal and Dialog Screens (6 screens)

```
Create 6 screens for a corporate accounting web app showing popup modals and dialogs:

1. Delete confirmation - A centered modal on a darkened background asking "Delete Invoice #1234?" with text "This action cannot be undone. The invoice and all related data will be permanently removed." Show a red "Delete" button and gray "Cancel" button.

2. Discard changes confirmation - A modal asking "Discard unsaved changes?" with text "You have unsaved changes that will be lost if you leave this page." Show "Discard" button (red), "Save Draft" button (orange outline), and "Cancel" button (gray).

3. Success confirmation - A modal with a green checkmark circle icon, heading "Invoice Sent Successfully!", text "Invoice #1234 has been sent to client@email.com", and a single "Done" button (orange).

4. Session timeout warning - A modal with a clock icon, heading "Are you still there?" text "Your session will expire in 5 minutes due to inactivity." Show "Stay Logged In" button (orange) and "Log Out" button (gray).

5. Export options modal - A modal titled "Export Report" with radio button options: "PDF Document", "Excel Spreadsheet", "CSV File". Include a date range selector and "Export" button (orange) plus "Cancel" button.

6. Quick edit modal - A modal titleDesign Style to Maintain:

Orange brand color (#f24a0d)
Light cream background (#f8f6f5)
Dark brown for dark mode (#221510)
Manrope font
Material icons (outlined style)
Rounded corners on cards and buttons
Clean, professional accounting software lookd "Edit Client Details" with form fields for Company Name, Email, Phone, Address in a compact layout. Show "Save Changes" button (orange) and "Cancel" button. Include X button in top right corner.

Style: Centered modals, dark semi-transparent backdrop, rounded corners, clear action buttons, not too wide (around 400-500px), professional.
```

---

## Prompt 6: Mobile Navigation Screens (6 screens)

```
Create 6 mobile phone screens for a corporate accounting app showing mobile navigation:

1. Mobile header with hamburger menu - A mobile view of the dashboard showing a header with hamburger menu icon (3 lines) on the left, "SoupFinance" logo in center, and notification bell on right. Show the dashboard content below.

2. Mobile sidebar menu open - The same screen but with a slide-out menu from the left covering 80% of the screen. Show menu items: Dashboard, Invoices, Payments, Clients, Reports, Settings, Help, Log Out. Include user avatar and name at top. Dark overlay on the right side.

3. Mobile bottom navigation bar - A mobile view with a fixed bottom bar containing 5 icons with labels: Home, Invoices, Add (big plus button in center), Payments, More. The current page icon should be highlighted in orange.

4. Mobile invoice list as cards - Instead of a table, show invoices as stacked cards on mobile. Each card shows invoice number, client name, amount, date, and status badge. Cards should be full width with clear spacing.

5. Mobile form layout - A mobile view of the new invoice form with fields stacked vertically, full-width inputs, and the action buttons stacked at the bottom (Cancel, Save Draft, Send - each full width).

6. Mobile filter drawer - A slide-up panel from the bottom (covering 70% of screen) showing filter options: Status checkboxes (Paid, Pending, Overdue), Date Range, Amount Range. Include "Apply Filters" button at bottom and "Clear All" link.

Style: Touch-friendly with large tap targets, clean mobile UI, proper spacing for thumbs, orange accents, white backgrounds.
```

---

## Prompt 7: Form Element Screens (6 screens)

```
Create 6 screens showing form element styles for a corporate accounting web app:

1. Checkbox styles - A settings page showing different checkbox states: unchecked, checked (with orange checkmark), disabled unchecked (grayed out), disabled checked (grayed with checkmark). Group them in a "Notification Preferences" section with labels like "Email notifications", "SMS alerts", "Weekly reports".

2. Radio button styles - A form section titled "Payment Method" showing radio button options: "Bank Transfer", "Credit Card", "PayPal", "Check". Show one selected (filled orange circle), others unselected (empty circles), and one disabled option (grayed out).

3. Toggle switch styles - A settings page with toggle switches for: "Dark Mode" (off), "Auto-save drafts" (on, showing orange toggle), "Send reminders" (on), "Two-factor authentication" (disabled/grayed). Each toggle should have a label on the left and the switch on the right.

4. Multi-select dropdown - A form field labeled "Assign to Teams" showing a dropdown that allows selecting multiple items. Show selected items as small tags/chips inside the field: "Sales", "Finance" with X buttons to remove. The dropdown is open showing more options with checkboxes.

5. Date range picker - A filter section showing a date range selector. Show two date fields "Start Date" and "End Date" with calendar icons. Show an open calendar popup below with two months visible side by side, with a date range highlighted in orange between the selected dates.

6. Search autocomplete - A search field labeled "Search Clients" that is being typed in, showing "Acm" with a dropdown below showing matching suggestions: "Acme Corporation", "Acme Industries", "Acme LLC" with the matching letters highlighted in orange.

Style: Consistent with the app's orange accent color, clear interactive states, proper spacing, professional form design.
```

---

## Prompt 8: Interactive Element Screens (6 screens)

```
Create 6 screens showing interactive UI elements for a corporate accounting web app:

1. User profile dropdown - The top-right corner of the header showing a clicked user avatar with an open dropdown menu containing: user name and email at top, then menu items "My Profile", "Account Settings", "Billing", divider line, "Help Center", "Log Out" (in red text).

2. Action dropdown menu - An invoice list row showing a "..." (three dots) button that has been clicked, revealing a dropdown with options: "View Details", "Edit Invoice", "Download PDF", "Send Reminder", divider line, "Duplicate", "Delete" (in red text).

3. Tooltip examples - A form page showing three tooltips in different positions: one above a help icon (?) next to "Tax Rate" label showing "Applied automatically based on client location", one below an info icon showing "Invoice numbers are generated automatically", one to the right of a field.

4. Avatar with status - A team members list showing 4 user avatars with different status indicators: green dot (online), yellow dot (away), red dot (busy), gray dot (offline). Show names beside each avatar.

5. Slide-over panel from right - A page with a slide-over panel coming from the right side (covering about 40% of the screen) titled "Invoice Details" showing invoice info in a vertical layout. The left side of the page is darkened. Include an X button to close the panel.

6. Context menu popover - A right-click menu appearing on an invoice row showing options in a floating box with shadow: "Open", "Open in New Tab", "Copy Invoice Number", "Copy Link", divider, "Print", "Archive". Show an arrow pointing to where it was clicked.

Style: Subtle shadows on dropdowns, clear hover states, orange accent for selected items, professional and clean.
```

---

## How to Use These Prompts

1. Copy one prompt at a time into Google Stitch
2. After generating, download all 6 screens
3. Rename files to match the naming convention:
   - `loading-spinner/code.html` and `loading-spinner/screen.png`
   - `table-skeleton/code.html` and `table-skeleton/screen.png`
   - etc.
4. Place in the `soupfinance-designs/` folder
5. Move to the next prompt

## Expected New Folders

After completing all prompts, you should have 48 new design folders:

### Batch 1: Loading States
- `loading-page-spinner/`
- `loading-table-skeleton/`
- `loading-dashboard-skeleton/`
- `loading-button-state/`
- `loading-file-upload/`
- `loading-data-sync/`

### Batch 2: Empty States
- `empty-invoices/`
- `empty-search-results/`
- `empty-payments/`
- `empty-clients/`
- `empty-notifications/`
- `empty-welcome-dashboard/`

### Batch 3: Error States
- `error-form-validation/`
- `error-404-not-found/`
- `error-500-server/`
- `error-no-internet/`
- `error-session-expired/`
- `error-access-denied/`

### Batch 4: Notifications & Alerts
- `notification-dropdown-panel/`
- `alert-banner-success/`
- `alert-banner-warning/`
- `alert-banner-error/`
- `alert-banner-info/`
- `toast-notification-stack/`

### Batch 5: Modals & Dialogs
- `modal-delete-confirmation/`
- `modal-discard-changes/`
- `modal-success-confirmation/`
- `modal-session-timeout/`
- `modal-export-options/`
- `modal-quick-edit/`

### Batch 6: Mobile Navigation
- `mobile-header-hamburger/`
- `mobile-sidebar-open/`
- `mobile-bottom-navigation/`
- `mobile-invoice-cards/`
- `mobile-form-layout/`
- `mobile-filter-drawer/`

### Batch 7: Form Elements
- `form-checkbox-styles/`
- `form-radio-button-styles/`
- `form-toggle-switch-styles/`
- `form-multi-select-dropdown/`
- `form-date-range-picker/`
- `form-search-autocomplete/`

### Batch 8: Interactive Elements
- `interactive-user-dropdown/`
- `interactive-action-menu/`
- `interactive-tooltip-examples/`
- `interactive-avatar-status/`
- `interactive-slide-over-panel/`
- `interactive-context-menu/`
