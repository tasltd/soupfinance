# Stitch Design Mapping

**Date**: 2026-01-20
**Query**: Review all PNG files in "new designs from stitch prompt" folder, identify actual content, pick best versions of duplicates
**Duration**: ~30 minutes

## Executive Summary

The Stitch-generated designs folder contains 60 design variants across 12 unique design types. The `general_ledger_entries_*` folders (1-12) are mislabeled - they actually contain various UI components like checkboxes, radio buttons, toggles, date pickers, etc., overlaid on a base GL Transactions page. Similarly, `profit_&_loss_summary_report_*` folders contain different P&L report variations but are actually correctly labeled.

## Duplicates Analysis

| Design Type | Variants | Best Version | Reason |
|-------------|----------|--------------|--------|
| GL Transactions (base page) | _4, _10, _11 | `general_ledger_entries_11` | Cleanest base layout without interactive overlays |
| Checkbox Settings | _1 | `general_ledger_entries_1` | Only version |
| Radio Button Payment | _2 | `general_ledger_entries_2` | Only version |
| Toggle Switches | _3 | `general_ledger_entries_3` | Only version |
| Multi-select Dropdown | _4 | `general_ledger_entries_4` | Only version (tags visible) |
| Date Range Picker | _5 | `general_ledger_entries_5` | Only version |
| Search Autocomplete | _6 | `general_ledger_entries_6` | Only version |
| User Profile Dropdown | _7 | `general_ledger_entries_7` | Only version |
| Action Dropdown (3-dot) | _8 | `general_ledger_entries_8` | Only version |
| Tooltips | _9 | `general_ledger_entries_9` | Only version |
| Avatar Status Indicators | _10 | `general_ledger_entries_10` | Shows team members in sidebar |
| Mobile Bottom Nav | _1, _2 | `mobile_bottom_navigation_bar_1` | Cleaner icon set, better alignment |
| Mobile Dashboard Header | _1, _2 | `mobile_dashboard_header_2` | More complete header with search |
| Mobile Side Nav | _1, _2 | `mobile_side_navigation_menu_2` | Better organized menu structure |
| Mobile Filter Drawer | _1, _2 | `mobile_filter_bottom_drawer_1` | More comprehensive filter options |
| Mobile Invoice Form | _1, _2 | `mobile_invoice_form_layout_2` | Better form layout with sections |
| Mobile Invoice Card List | _1, _2 | `mobile_invoice_card_list_1` | Cleaner card design |
| P&L Report Variants | _1 to _6 | See notes below | All unique, different data views |

### P&L Report Variants (All Unique)

- `_1`: Standard P&L table layout
- `_2`: P&L with expandable sections
- `_3`: P&L with comparison columns
- `_4`: P&L dashboard view with charts
- `_5`: P&L with annotations
- `_6`: P&L simplified summary view

**Recommendation**: Keep all 6 P&L variants as they represent different visualization approaches.

## Complete Design Mapping

| Original Folder | Actual Content | New Name | Category | Notes |
|----------------|----------------|----------|----------|-------|
| `404_page_not_found` | 404 error page with illustration | `error-404-page-not-found` | error-states | Standard 404 with home link |
| `500_internal_server_error` | 500 error page with support info | `error-500-internal-server` | error-states | Shows support contact |
| `access_denied_error` | 403 forbidden page | `error-403-access-denied` | error-states | Permission denied screen |
| `button_saving_state` | Form with "Saving..." button spinner | `loading-button-saving-state` | loading-states | Invoice form with saving indicator |
| `dashboard_cards_loading` | Dashboard skeleton loading | `loading-dashboard-skeleton` | loading-states | Full dashboard with card placeholders |
| `data_syncing_indicator` | Dashboard with sync progress bar | `loading-data-sync-indicator` | loading-states | Bank feed syncing 34% |
| `delete_confirmation_modal` | Delete invoice confirmation dialog | `modal-delete-confirmation` | modals-dialogs | Red destructive action modal |
| `discard_changes_modal` | Unsaved changes warning dialog | `modal-discard-changes` | modals-dialogs | Three-button modal (Discard/Save/Cancel) |
| `empty_state:_no_clients` | No clients empty state | `empty-state-no-clients` | empty-states | CTA to add first client |
| `empty_state:_no_invoices` | No invoices empty state | `empty-state-no-invoices` | empty-states | CTA to create first invoice |
| `empty_state:_no_notifications` | No notifications empty state | `empty-state-no-notifications` | empty-states | Bell icon with message |
| `empty_state:_no_payments` | No payments empty state | `empty-state-no-payments` | empty-states | CTA to record payment |
| `empty_state:_no_search_results` | No search results empty state | `empty-state-no-search-results` | empty-states | Try different keywords message |
| `error_alert_banner` | Error toast/banner on invoice list | `alert-banner-error` | alerts-notifications | "Failed to save" with retry button |
| `export_options_modal` | Export format selection modal | `modal-export-options` | modals-dialogs | PDF/Excel/CSV with date range |
| `file_upload_progress_modal` | File upload progress dialog | `modal-file-upload-progress` | modals-dialogs | 65% progress bar with cancel |
| `full_page_loading_state` | Full page loading spinner | `loading-full-page-spinner` | loading-states | Centered spinner with "Loading" text |
| `general_ledger_entries_1` | **Checkbox styles** (notification settings) | `form-checkbox-styles` | form-elements | Settings page with checkboxes |
| `general_ledger_entries_2` | **Radio button styles** (payment methods) | `form-radio-button-styles` | form-elements | Payment method selection |
| `general_ledger_entries_3` | **Toggle switch styles** (general prefs) | `form-toggle-switch-styles` | form-elements | Settings with multiple toggles |
| `general_ledger_entries_4` | **Multi-select dropdown** (assign teams) | `form-multiselect-dropdown` | form-elements | GL page with team tags dropdown |
| `general_ledger_entries_5` | **Date range picker** (calendar popup) | `form-date-range-picker` | form-elements | Two-month calendar picker |
| `general_ledger_entries_6` | **Search autocomplete** (client search) | `form-search-autocomplete` | form-elements | Grouped results (Clients/Invoices) |
| `general_ledger_entries_7` | **User profile dropdown** | `interactive-user-profile-dropdown` | interactive-elements | Profile menu with nav options |
| `general_ledger_entries_8` | **Action dropdown** (three-dot menu) | `interactive-action-dropdown-menu` | interactive-elements | Row actions (View/Edit/Delete) |
| `general_ledger_entries_9` | **Tooltips** (form field help) | `interactive-tooltip-examples` | interactive-elements | Help icons with tooltip hints |
| `general_ledger_entries_10` | **Avatar status indicators** (team) | `interactive-avatar-status-team` | interactive-elements | GL page with team member sidebar |
| `general_ledger_entries_11` | **GL Transactions base** (no overlays) | `gl-transactions-base-page` | form-elements | Clean base GL transactions page |
| `general_ledger_entries_12` | **GL Transactions base** (variant) | `gl-transactions-variant` | form-elements | Similar to _11, duplicate |
| `info_alert_banner` | Info banner on dashboard | `alert-banner-info` | alerts-notifications | System maintenance notice |
| `invoice_action_dropdown_menu` | Invoice row action menu | `interactive-invoice-actions` | interactive-elements | Table with action dropdown open |
| `invoice_details_slide-over_panel` | Invoice detail slide-over | `panel-invoice-detail-slideover` | modals-dialogs | Right-side invoice preview panel |
| `invoice_form_validation_errors` | Form validation error states | `form-validation-error-states` | form-elements | Fields with error messages |
| `mobile_bottom_navigation_bar_1` | Mobile bottom nav (v1) | `mobile-bottom-nav-v1` | mobile-navigation | 5-icon bottom bar |
| `mobile_bottom_navigation_bar_2` | Mobile bottom nav (v2) | `mobile-bottom-nav-v2` | mobile-navigation | Alternative icon style |
| `mobile_dashboard_header_1` | Mobile header (v1) | `mobile-header-v1` | mobile-navigation | Basic header |
| `mobile_dashboard_header_2` | Mobile header (v2) | `mobile-header-v2` | mobile-navigation | Header with search |
| `mobile_filter_bottom_drawer_1` | Mobile filter drawer (v1) | `mobile-filter-drawer-v1` | mobile-navigation | Comprehensive filters |
| `mobile_filter_bottom_drawer_2` | Mobile filter drawer (v2) | `mobile-filter-drawer-v2` | mobile-navigation | Simplified filters |
| `mobile_invoice_card_list_1` | Mobile invoice cards (v1) | `mobile-invoice-list-v1` | mobile-navigation | Card-based invoice list |
| `mobile_invoice_card_list_2` | Mobile invoice cards (v2) | `mobile-invoice-list-v2` | mobile-navigation | Alternative card layout |
| `mobile_invoice_form_layout_1` | Mobile invoice form (v1) | `mobile-invoice-form-v1` | mobile-navigation | Basic mobile form |
| `mobile_invoice_form_layout_2` | Mobile invoice form (v2) | `mobile-invoice-form-v2` | mobile-navigation | Sectioned mobile form |
| `mobile_side_navigation_menu_1` | Mobile side nav (v1) | `mobile-sidenav-v1` | mobile-navigation | Slide-out menu |
| `mobile_side_navigation_menu_2` | Mobile side nav (v2) | `mobile-sidenav-v2` | mobile-navigation | Organized menu with sections |
| `notification_dropdown_panel` | Notification dropdown panel | `interactive-notification-dropdown` | alerts-notifications | Header notification popover |
| `offline_error_state` | Offline/connection error | `error-offline-connection` | error-states | No internet connection page |
| `profit_&_loss_summary_report_1` | P&L table layout | `report-pnl-table-layout` | form-elements | Standard P&L table |
| `profit_&_loss_summary_report_2` | P&L expandable sections | `report-pnl-expandable` | form-elements | Collapsible sections |
| `profit_&_loss_summary_report_3` | P&L with comparison | `report-pnl-comparison` | form-elements | YoY comparison columns |
| `profit_&_loss_summary_report_4` | P&L dashboard view | `report-pnl-dashboard` | form-elements | Charts and summary |
| `profit_&_loss_summary_report_5` | P&L with annotations | `report-pnl-annotated` | form-elements | Notes and highlights |
| `profit_&_loss_summary_report_6` | P&L simplified summary | `report-pnl-simplified` | form-elements | Executive summary view |
| `quick_edit_client_modal` | Client edit modal | `modal-quick-edit-client` | modals-dialogs | Edit client details form |
| `right-click_context_menu_popover` | Right-click context menu | `interactive-context-menu` | interactive-elements | Invoice list context menu |
| `session_expired_timeout` | Session expired page | `error-session-expired-page` | error-states | Full page session expired |
| `session_timeout_modal` | Session timeout warning modal | `modal-session-timeout` | modals-dialogs | "Stay logged in?" dialog |
| `success_alert_banner` | Success banner on list | `alert-banner-success` | alerts-notifications | "Invoice sent" confirmation |
| `success_confirmation_modal` | Success confirmation modal | `modal-success-confirmation` | modals-dialogs | "Invoice Sent!" with checkmark |
| `table_skeleton_loading` | Table skeleton loading | `loading-table-skeleton` | loading-states | Invoice table placeholders |
| `team_member_status_avatars` | Team availability card | `interactive-team-status-card` | interactive-elements | Team members with status dots |
| `toast_notification_stack` | Stacked toast notifications | `alert-toast-notification-stack` | alerts-notifications | Multiple toasts (success/info/warning) |
| `warning_alert_banner` | Warning banner on dashboard | `alert-banner-warning` | alerts-notifications | "Subscription expiring" notice |
| `welcome_dashboard_empty_state` | Welcome/onboarding empty state | `empty-state-welcome-dashboard` | empty-states | New user onboarding checklist |

## Category Summary

| Category | Count | Description |
|----------|-------|-------------|
| form-elements | 17 | Checkboxes, radios, toggles, dropdowns, pickers, validation |
| interactive-elements | 9 | Dropdowns, menus, tooltips, avatars, context menus |
| modals-dialogs | 8 | Delete, discard, export, upload, edit, success, timeout, slideover |
| loading-states | 5 | Full page, skeleton, button, sync indicator |
| empty-states | 6 | No clients, invoices, payments, notifications, search, welcome |
| error-states | 5 | 404, 500, 403, offline, session expired |
| alerts-notifications | 6 | Success, error, warning, info banners, toast stack, notification panel |
| mobile-navigation | 12 | Bottom nav, header, filter drawer, invoice list, form, sidenav |

**Total**: 68 designs (60 folders with some variants)

## Recommendations

### Recommended Best Versions for Each Category

**Form Elements:**
- Checkbox: `general_ledger_entries_1` (comprehensive settings context)
- Radio: `general_ledger_entries_2` (payment method context)
- Toggle: `general_ledger_entries_3` (preferences context)
- Multi-select: `general_ledger_entries_4` (team assignment)
- Date Picker: `general_ledger_entries_5` (range selection)
- Autocomplete: `general_ledger_entries_6` (grouped results)
- Validation: `invoice_form_validation_errors` (inline errors)

**Interactive Elements:**
- Profile Dropdown: `general_ledger_entries_7`
- Action Menu: `general_ledger_entries_8` or `invoice_action_dropdown_menu`
- Tooltips: `general_ledger_entries_9`
- Context Menu: `right-click_context_menu_popover`
- Notifications: `notification_dropdown_panel`
- Team Status: `team_member_status_avatars` (standalone) or `general_ledger_entries_10` (in-context)

**Modals:**
- Delete: `delete_confirmation_modal`
- Discard: `discard_changes_modal`
- Export: `export_options_modal`
- Upload: `file_upload_progress_modal`
- Quick Edit: `quick_edit_client_modal`
- Success: `success_confirmation_modal`
- Timeout: `session_timeout_modal`
- Detail View: `invoice_details_slide-over_panel`

**Loading States:**
- Full Page: `full_page_loading_state`
- Table: `table_skeleton_loading`
- Dashboard: `dashboard_cards_loading`
- Button: `button_saving_state`
- Sync: `data_syncing_indicator`

**Empty States:**
- No Clients: `empty_state:_no_clients`
- No Invoices: `empty_state:_no_invoices`
- No Payments: `empty_state:_no_payments`
- No Notifications: `empty_state:_no_notifications`
- No Search: `empty_state:_no_search_results`
- Welcome: `welcome_dashboard_empty_state`

**Error States:**
- 404: `404_page_not_found`
- 500: `500_internal_server_error`
- 403: `access_denied_error`
- Offline: `offline_error_state`
- Session: `session_expired_timeout`

**Alerts:**
- Success: `success_alert_banner`
- Error: `error_alert_banner`
- Warning: `warning_alert_banner`
- Info: `info_alert_banner`
- Toasts: `toast_notification_stack`

**Mobile:**
- Bottom Nav: `mobile_bottom_navigation_bar_1`
- Header: `mobile_dashboard_header_2`
- Side Nav: `mobile_side_navigation_menu_2`
- Filter: `mobile_filter_bottom_drawer_1`
- Invoice List: `mobile_invoice_card_list_1`
- Invoice Form: `mobile_invoice_form_layout_2`

### Duplicates to Remove

The following can be considered duplicates and one version kept:
- `general_ledger_entries_11` and `general_ledger_entries_12` - keep `_11`
- Mobile variants - keep the recommended best version, archive the other

### Next Steps

1. Create new folder structure with correct names
2. Move best versions to new folders
3. Archive duplicate/inferior versions
4. Update design system docs with component screenshots
