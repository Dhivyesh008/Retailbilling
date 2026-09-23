/**
 * productService.js
 *
 * Service layer for product operations.
 * Communicates with Supabase PostgreSQL to fetch product data.
 */
import { supabase } from '../lib/supabase.js';

/**
 * Fetch all products from the Supabase `products` table ordered by name ascending.
 * 
 * @returns {Promise<Array>} Array of product objects from Supabase
 * @throws {Error} If the Supabase query fails
 */
export async function getAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('[productService] Error fetching products:', error);
    throw new Error(error.message || 'Failed to fetch products');
  }

  return data || [];
}

/**
 * Add a new product to Supabase PostgreSQL.
 *
 * @param {Object} product
 * @returns {Promise<Object>} The created product mapped to app shape
 */
export async function createProduct({
  name,
  sku = '',
  barcode = '',
  category = 'General',
  price = 0,
  tax_rate = 5,
  stock_quantity = 0,
  reorder_level = 10,
  store_id = 1,
}) {
  const generatedSku = sku.trim() || `SKU${Date.now().toString().slice(-4)}`;
  const { data, error } = await supabase
    .from('products')
    .insert([{
      name: name.trim(),
      sku: generatedSku,
      barcode: barcode ? barcode.trim() : null,
      category: category.trim() || 'General',
      price: parseFloat(price) || 0,
      tax_rate: parseFloat(tax_rate) || 0,
      stock_quantity: parseInt(stock_quantity, 10) || 0,
      reorder_level: parseInt(reorder_level, 10) || 10,
      store_id: store_id ? parseInt(store_id, 10) : 1,
    }])
    .select()
    .single();

  if (error) {
    console.error('[productService] Error creating product:', error);
    throw new Error(error.message || 'Failed to create product');
  }

  return {
    id: data.id,
    name: data.name,
    sku: data.sku,
    barcode: data.barcode || '',
    category: data.category,
    price: parseFloat(data.price || 0),
    tax: parseFloat(data.tax_rate || 0),
    stock: data.stock_quantity || 0,
    reorder: data.reorder_level || 5,
    storeId: data.store_id,
    createdAt: data.created_at,
  };
}

/**
 * Delete a product from Supabase PostgreSQL by ID.
 *
 * @param {number|string} productId
 * @returns {Promise<boolean>}
 */
export async function deleteProduct(productId) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) {
    console.error('[productService] Error deleting product:', error);
    throw new Error(error.message || 'Failed to delete product');
  }

  return true;
}
