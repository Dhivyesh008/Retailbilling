/**
 * Loyalty helpers — all pure functions, no hardcoded tiers.
 * Tiers are loaded from IndexedDB via loyaltyTiersDB.getActive()
 * and passed in from DBContext so Billing and other pages use live data.
 */

/**
 * Given a list of active tiers (sorted descending by minVisits) and
 * the customer's current visit count, returns the matching tier or null.
 *
 * @param {Array}  tiers      Active tiers from loyaltyTiersDB.getActive()
 * @param {number} visitCount Customer's current loyaltyPoints (= visit count)
 * @returns {object|null}
 */
export function getLoyaltyTier(tiers, visitCount) {
  if (!tiers || tiers.length === 0) return null;
  return tiers.find((t) => visitCount >= t.minVisits) ?? null;
}

/**
 * Loyalty discount amount in ₹, applied on the subtotal after promo discounts.
 *
 * @param {number} afterPromoSubtotal
 * @param {Array}  tiers              Active tiers (sorted desc)
 * @param {number} visitCount         Customer's current visit count
 * @returns {{ discount: number, tier: object|null }}
 */
export function calcLoyaltyDiscount(afterPromoSubtotal, tiers, visitCount) {
  const tier = getLoyaltyTier(tiers, visitCount);
  if (!tier || tier.discountPercent === 0) return { discount: 0, tier: null };
  return {
    discount: Math.round(afterPromoSubtotal * tier.discountPercent / 100),
    tier,
  };
}
