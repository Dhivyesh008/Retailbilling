// migrate-barcodes.mjs
// Adds barcode column and seeds demo barcodes directly via Supabase REST API
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gnbmsmpnomeugswyfysp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uFXuAWzf3K_tOmYj73i0vQ_PHjf6Nv2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('🔗 Connecting to Supabase...');

  // Step 1: Read existing products to find IDs for Milk, Bread, Rice
  const { data: products, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, sku, barcode');

  if (fetchErr) {
    console.error('❌ Could not fetch products:', fetchErr.message);
    process.exit(1);
  }

  console.log(`📦 Found ${products.length} products in database:`);
  products.forEach(p => console.log(`   id=${p.id}  sku=${p.sku}  name=${p.name}  barcode=${p.barcode ?? '(none)'}`));

  // Step 2: Match by SKU first, then by name as fallback
  const ASSIGNMENTS = [
    { skus: ['SKU001'], names: ['milk'],  barcode: '8901030826825', label: 'Milk'    },
    { skus: ['SKU002'], names: ['bread'], barcode: '8901030826832', label: 'Bread'   },
    { skus: ['SKU003'], names: ['rice'],  barcode: '8901030826849', label: 'Rice 5kg'},
  ];

  let anyUpdated = false;

  for (const { skus, names, barcode, label } of ASSIGNMENTS) {
    // Find matching product
    let match = products.find(p =>
      skus.some(s => (p.sku ?? '').toLowerCase() === s.toLowerCase())
    );
    if (!match) {
      match = products.find(p =>
        names.some(n => (p.name ?? '').toLowerCase().includes(n))
      );
    }

    if (!match) {
      console.warn(`⚠  No product found for "${label}" (tried SKUs: ${skus.join(',')} / names: ${names.join(',')})`);
      continue;
    }

    const { error: upErr } = await supabase
      .from('products')
      .update({ barcode })
      .eq('id', match.id);

    if (upErr) {
      // barcode column might not exist yet (older schema)
      console.error(`❌ Could not update "${label}" (id=${match.id}):`, upErr.message);
      console.log('   → The barcode column may be missing. Please add it manually in Supabase SQL Editor:');
      console.log('     ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;');
    } else {
      console.log(`✅ "${label}" (id=${match.id}) → barcode = ${barcode}`);
      anyUpdated = true;
    }
  }

  // Step 3: Verify
  if (anyUpdated) {
    const { data: verify } = await supabase
      .from('products')
      .select('id, name, sku, barcode')
      .not('barcode', 'is', null);

    console.log('\n📋 Products now with barcodes:');
    (verify ?? []).forEach(p =>
      console.log(`   ✓ ${p.name} (${p.sku}) → ${p.barcode}`)
    );
  }

  console.log('\n🎉 Done! Barcode scanning is ready to test.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
