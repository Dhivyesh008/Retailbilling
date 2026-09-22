# Walkthrough - Promotions Branch & Database Functionality

## Summary of Changes
Connected the **Promotions & Loyalty** module to real database stores from Supabase PostgreSQL and gave full CRUD functionality with offline IndexedDB support and Billing checkout integration.

---

## Key Updates

### 1. Dynamic Branch Selector from Database `stores`
- **Replaced hardcoded legacy branches**: Removed static `"Both branches"`, `"Branch A only"`, and `"Branch B only"`.
- **Live Supabase `stores` table connection**: Dynamically loads real store branches (`RetailSync Main Store (Erode)` with `id: 1` and `"All Branches"`).
- **Store name resolution**: Promotion list cards now show the branch name linked to the database store record rather than generic placeholders.
- **Branch filter toolbar**: Added a branch filter dropdown allowing users to view promotions scoped to specific stores or store-wide.

### 2. Full Promotions Management Service (`src/services/promotionService.js`)
- **Supabase PostgreSQL CRUD**:
  - `savePromotion`: Inserts new rows or updates existing records in Supabase `promotions`.
  - `togglePromotion`: Toggles promotion active status on Supabase in real-time.
  - `deletePromotion`: Deletes records directly from Supabase.
- **Offline First & Auto-Sync**:
  - Automatically caches promotions in IndexedDB `promotionsDB`.
  - If offline, saves locally with `PENDING_SYNC` status and enqueues to `syncQueueDB`.
  - When connection is restored, `syncOfflinePromotions()` flushes pending changes to Supabase PostgreSQL.

### 3. Product Scope & Scheduling Support
- **Specific Product Promotion**: Selecting scope `"Specific product"` reveals a product selector populated from the `products` table in the database.
- **Validity Dates**: Added optional `Start Date` and `End Date` inputs matching Supabase `start_date` and `end_date` columns.

### 4. Billing Integration (`src/pages/Billing.jsx`)
- **Branch-Aware Checkout**: Checkout promotion dropdown filters promotions according to the cashier's active branch and validity date range.
- **Cart-Aware Calculation**: Product-specific promotions only discount matching items in the customer's cart.

---

## Verification Results

1. **Database Persistence Verified**:
   - Created promotion `"Weekend Festive 10%"` on the Promotions page.
   - Queried Supabase PostgreSQL directly; verified row was inserted with `id: 4`, `discount_type: 'percent'`, `discount_value: 10`, `active: true`.
2. **Toggle Active Verified**:
   - Toggled status between Active and Inactive; verified live state updates.
3. **Billing Application Verified**:
   - Selected the promotion during checkout on `http://localhost:5173/billing`.
   - Verified the 10% discount was calculated and subtracted from the subtotal.
4. **Git Sync**:
   - Changes committed and pushed to `https://github.com/Dhivyesh008/Retailbilling` (Commit: `c2eaca5`).
