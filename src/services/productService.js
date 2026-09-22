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
