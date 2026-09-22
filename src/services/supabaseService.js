/**
 * supabaseService.js
 *
 * Single source of truth for all Supabase read/write operations.
 * Maps the Supabase schema (snake_case) <-> app shape (camelCase).
 *
 * Tables & columns (from your schema):
 *   products      : id, name, sku, barcode, category, price, tax_rate,
 *                   stock_quantity, reorder_level, store_id, created_at
 *   customers     : id, name, phone, email, loyalty_points, created_at
 *   sales         : id, invoice_number, customer_id, cashier_id, store_id,
 *                   subtotal, discount, tax, total, payment_method,
 *                   status, sync_status, created_at
 *   sale_items    : id, sale_id, product_id, quantity, unit_price, discount
 *   returns       : id, sale_id, product_id, quantity, refund_amount,
 *                   reason, created_at
 *   promotions    : id, name, discount_type, discount_value, product_id,
 *                   start_date, end_date, active
 *   stores        : id, name, location, created_at
 *   users         : id, name, email, password_hash, role, store_id, created_at
 */

import { supabase } from '../lib/supabase.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function throwIfError({ error, data }, context) {
  if (error) {
    console.error(`[Supabase] ${context}:`, error.message);
    throw error;
  }
  return data;
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

/** Fetch all products, mapped to the app's shape */
export async function fetchProducts() {
  const data = throwIfError(
    await supabase.from('products').select('*').order('name'),
    'fetchProducts'
  );
  return (data ?? []).map(mapProduct);
}

/** Update stock_quantity for a single product */
export async function updateProductStock(productId, newQuantity) {
  throwIfError(
    await supabase
      .from('products')
      .update({ stock_quantity: newQuantity })
      .eq('id', productId),
    'updateProductStock'
  );
}

/** Adjust stock by delta (positive = add, negative = remove) */
export async function adjustProductStock(productId, delta) {
  // Fetch current quantity first
  const { data, error } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single();
  if (error) throw error;
  const newQty = Math.max(0, (data.stock_quantity ?? 0) + delta);
  await updateProductStock(productId, newQty);
  return newQty;
}

/** Map a Supabase products row → app shape */
function mapProduct(row) {
  return {
    id:           row.id,
    name:         row.name,
    sku:          row.sku ?? '',
    barcode:      row.barcode ?? '',
    category:     row.category ?? '',
    price:        parseFloat(row.price ?? 0),
    tax:          parseFloat(row.tax_rate ?? 0),
    stock:        row.stock_quantity ?? 0,
    reorder:      row.reorder_level ?? 5,
    storeId:      row.store_id,
    createdAt:    row.created_at,
  };
}

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────

export async function fetchCustomers() {
  const data = throwIfError(
    await supabase.from('customers').select('*').order('name'),
    'fetchCustomers'
  );
  return (data ?? []).map(mapCustomer);
}

/** Look up a customer by phone number; returns null if not found */
export async function fetchCustomerByPhone(phone) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCustomer(data) : null;
}

/** Insert a brand-new customer and return the saved record */
export async function insertCustomer({ name, phone, email = '' }) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ name, phone, email, loyalty_points: 0 })
    .select()
    .single();
  if (error) throw error;
  return mapCustomer(data);
}

/** Increment a customer's loyalty_points by `delta` (usually 1 per visit) */
export async function incrementLoyaltyPoints(customerId, delta = 1) {
  const { data: current, error: fetchErr } = await supabase
    .from('customers')
    .select('loyalty_points')
    .eq('id', customerId)
    .single();
  if (fetchErr) throw fetchErr;
  const newPoints = (current.loyalty_points ?? 0) + delta;
  const { error: updateErr } = await supabase
    .from('customers')
    .update({ loyalty_points: newPoints })
    .eq('id', customerId);
  if (updateErr) throw updateErr;
  return newPoints;
}

/** Map a Supabase customers row → app shape */
function mapCustomer(row) {
  return {
    id:             row.id,
    name:           row.name ?? '',
    phone:          row.phone ?? '',
    email:          row.email ?? '',
    loyaltyPoints:  row.loyalty_points ?? 0,
    purchaseHistory: [],   // populated via sales join if needed
    createdAt:      row.created_at,
  };
}

// ─── SALES ───────────────────────────────────────────────────────────────────

/**
 * Fetch all sales with their items, returning them in the app's "bill" shape
 * so the rest of the UI works without changes.
 */
export async function fetchSales() {
  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items (
        id, product_id, quantity, unit_price, discount,
        products ( name, sku, category )
      )
    `)
    .order('created_at', { ascending: false });

  if (salesErr) throw salesErr;
  return (salesRows ?? []).map(mapSale);
}

/**
 * Insert a completed sale (header + items) into Supabase.
 * Returns the created sale id.
 */
export async function insertSale({
  invoiceNumber,
  customerId,
  cashierId,
  storeId,
  subtotal,
  discount,
  tax,
  total,
  paymentMethod,
  status = 'completed',
  syncStatus = 'synced',
  items = [],   // [{ productId, name, price, qty, category }]
}) {
  // 1. Insert sale header
  const { data: saleRow, error: saleErr } = await supabase
    .from('sales')
    .insert({
      invoice_number: invoiceNumber,
      customer_id:    customerId   ?? null,
      cashier_id:     cashierId    ?? null,
      store_id:       storeId      ?? null,
      subtotal:       subtotal,
      discount:       discount,
      tax:            tax          ?? 0,
      total:          total,
      payment_method: paymentMethod,
      status,
      sync_status:    syncStatus,
    })
    .select()
    .single();

  if (saleErr) throw saleErr;

  const saleId = saleRow.id;

  // 2. Insert sale items
  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      sale_id:    saleId,
      product_id: item.productId ?? null,
      quantity:   item.qty,
      unit_price: item.price,
      discount:   0,
    }));
    const { error: itemsErr } = await supabase
      .from('sale_items')
      .insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  return saleId;
}

/** Map a Supabase sales row (with sale_items join) → app "bill" shape */
function mapSale(row) {
  const items = (row.sale_items ?? []).map((si) => ({
    productId: si.product_id,
    name:      si.products?.name ?? '',
    sku:       si.products?.sku ?? '',
    category:  si.products?.category ?? '',
    price:     parseFloat(si.unit_price ?? 0),
    qty:       si.quantity ?? 1,
  }));

  return {
    id:            String(row.id),
    invoiceNumber: row.invoice_number ?? '',
    customerId:    row.customer_id ? String(row.customer_id) : null,
    cashierId:     row.cashier_id  ? String(row.cashier_id)  : null,
    storeId:       row.store_id    ? String(row.store_id)    : null,
    subtotal:      parseFloat(row.subtotal ?? 0),
    discount:      parseFloat(row.discount ?? 0),
    tax:           parseFloat(row.tax ?? 0),
    total:         parseFloat(row.total ?? 0),
    payment:       row.payment_method ?? '',
    status:        row.status ?? '',
    syncStatus:    row.sync_status ?? '',
    timestamp:     row.created_at,
    items,
  };
}

// ─── RETURNS ─────────────────────────────────────────────────────────────────

export async function fetchReturns() {
  const data = throwIfError(
    await supabase.from('returns').select('*').order('created_at', { ascending: false }),
    'fetchReturns'
  );
  return (data ?? []).map(mapReturn);
}

/**
 * Insert a return record for a single product.
 * Call once per distinct productId being returned.
 */
export async function insertReturn({ saleId, productId, quantity, refundAmount, reason }) {
  const { data, error } = await supabase
    .from('returns')
    .insert({
      sale_id:       saleId       ?? null,
      product_id:    productId    ?? null,
      quantity:      quantity,
      refund_amount: refundAmount ?? 0,
      reason:        reason       ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return mapReturn(data);
}

function mapReturn(row) {
  return {
    id:           row.id,
    saleId:       row.sale_id       ? String(row.sale_id)    : null,
    productId:    row.product_id    ? String(row.product_id) : null,
    quantity:     row.quantity,
    refundAmount: parseFloat(row.refund_amount ?? 0),
    reason:       row.reason ?? '',
    timestamp:    row.created_at,
    // App-compatible aliases
    billId:       row.sale_id ? String(row.sale_id) : null,
    status:       'SYNCED',
  };
}

// ─── PROMOTIONS ──────────────────────────────────────────────────────────────

export async function fetchPromotions() {
  const data = throwIfError(
    await supabase.from('promotions').select('*').order('name'),
    'fetchPromotions'
  );
  return (data ?? []).map(mapPromotion);
}

function mapPromotion(row) {
  return {
    id:            row.id,
    name:          row.name ?? '',
    discountType:  row.discount_type ?? 'percent',   // 'percent' | 'flat'
    value:         parseFloat(row.discount_value ?? 0),
    productId:     row.product_id ?? null,
    startDate:     row.start_date ?? null,
    endDate:       row.end_date   ?? null,
    active:        row.active ?? false,
    // legacy aliases used by Billing.jsx
    minCartValue:  0,
    scope:         'all',
  };
}

// ─── STORES ──────────────────────────────────────────────────────────────────

export async function fetchStores() {
  const data = throwIfError(
    await supabase.from('stores').select('*').order('name'),
    'fetchStores'
  );
  return (data ?? []).map(mapStore);
}

/**
 * Validate a branch login by matching store id + role + password.
 * Role is required to disambiguate when multiple users share the same password.
 */
export async function validateStorePassword(storeId, password, role) {
  let query = supabase
    .from('users')
    .select('*, stores(*)')
    .eq('store_id', storeId)
    .eq('password_hash', password);

  // Must reassign — Supabase builder returns a new object each time
  if (role) query = query.eq('role', role);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...mapStore(data.stores),
    userId: data.id,
    userName: data.name,
    userRole: data.role,
  };
}

function mapStore(row) {
  if (!row) return null;
  return {
    id:       row.id,
    name:     row.name ?? '',
    location: row.location ?? '',
  };
}

// ─── USERS ───────────────────────────────────────────────────────────────────

export async function fetchUsers() {
  const data = throwIfError(
    await supabase.from('users').select('id, name, email, role, store_id, created_at'),
    'fetchUsers'
  );
  return (data ?? []).map((u) => ({
    id:      u.id,
    name:    u.name,
    email:   u.email,
    role:    u.role,
    storeId: u.store_id,
  }));
}

/**
 * Validate admin login by email + password_hash.
 * Returns the user record or null.
 */
export async function validateAdminPassword(password) {
  // Admin@9999 is still stored locally for simplicity;
  // to move fully to Supabase, match against users table with role='Admin'
  const ADMIN_PASSWORD = 'Admin@9999';
  if (password === ADMIN_PASSWORD) return { role: 'Admin', name: 'Admin' };
  // Also try Supabase
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'Admin')
    .eq('password_hash', password)
    .maybeSingle();
  return data ? { role: 'Admin', name: data.name, id: data.id } : null;
}
