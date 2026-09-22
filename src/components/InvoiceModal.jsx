import { useRef } from 'react';
import { X, Printer, Store, Star } from 'lucide-react';

export default function InvoiceModal({ invoice, onClose }) {
  const {
    bill, cart,
    subtotal, promoDiscount, loyaltyDiscount, total,
    payment, promo, tier,
    pointsEarned, pointsAfter,
    customerPhone, customerName,
  } = invoice;

  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const w = window.open('', '_blank', 'width=420,height=760');
    w.document.write(`
      <html><head><title>Invoice ${bill.id}</title>
      <style>
        body { font-family:'Courier New',monospace; font-size:12px; padding:20px; max-width:380px; margin:0 auto; }
        .center { text-align:center; }
        .line   { border-top:1px dashed #ccc; margin:8px 0; }
        table   { width:100%; border-collapse:collapse; }
        td      { padding:2px 0; }
        .right  { text-align:right; }
        .bold   { font-weight:800; }
        .green  { color:#059669; }
        .purple { color:#7c3aed; }
        .amber  { color:#d97706; }
        .total  { font-size:15px; font-weight:800; }
        .pts-box { background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:6px 10px; margin-top:6px; }
      </style></head>
      <body>${content}</body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-extrabold">Invoice</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-secondary gap-1.5 px-3 py-1.5 text-xs">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="rounded-xl border border-slate-200 p-1.5 hover:bg-slate-50">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable receipt */}
        <div className="max-h-[80vh] overflow-y-auto">
          <div ref={printRef} className="px-6 py-5 font-mono text-sm">

            {/* Brand */}
            <div className="center text-center mb-1">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Store size={18} />
                <span className="text-lg font-extrabold">RetailSync</span>
              </div>
              <p className="text-xs text-slate-400 font-sans">Main Store · POS Invoice</p>
            </div>

            <div className="line mt-3" />

            {/* Bill meta */}
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Bill ID</span>
                <span className="font-bold text-slate-700">{bill.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{new Date(bill.timestamp).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment</span>
                <span className="font-bold">{payment}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className={`font-bold ${bill.status === 'SYNCED' ? 'text-emerald-600 green' : 'text-amber-600 amber'}`}>
                  {bill.status}
                </span>
              </div>
            </div>

            {/* Customer info */}
            {customerPhone && (
              <>
                <div className="line" />
                <div className="space-y-1 text-xs text-slate-500">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">Customer</p>
                  <div className="flex justify-between">
                    <span>Phone</span>
                    <span className="font-bold text-slate-700">{customerPhone}</span>
                  </div>
                  {customerName && (
                    <div className="flex justify-between">
                      <span>Name</span>
                      <span className="font-bold text-slate-700">{customerName}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="line" />

            {/* Items table */}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <td className="pb-1">Item</td>
                  <td className="right pb-1">Qty</td>
                  <td className="right pb-1">₹</td>
                  <td className="right pb-1">Total</td>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => {
                  const p = item.product || item;
                  const original = item.originalPrice ?? p.price;
                  const effective = item.effectivePrice ?? (item.hasOffer ? item.discountedPrice : (item.price ?? p.price));
                  const hasOff = Boolean(item.hasOffer || (effective < original));
                  const lineTot = item.lineTotal ?? (effective * item.qty);
                  return (
                    <tr key={p.id}>
                      <td className="py-0.5 pr-2 max-w-[120px] truncate">{p.name}</td>
                      <td className="right py-0.5">{item.qty}</td>
                      <td className="right py-0.5">
                        {hasOff ? (
                          <span><span style={{ textDecoration: 'line-through', opacity: 0.6 }}>₹{original}</span> <b>₹{effective}</b></span>
                        ) : (
                          `₹${original}`
                        )}
                      </td>
                      <td className="right py-0.5 font-bold">₹{lineTot}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="line" />

            {/* Totals */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span><span>₹{subtotal}</span>
              </div>

              {promoDiscount > 0 && (
                <div className="flex justify-between font-bold text-emerald-600 green">
                  <span>Promo{promo ? ` (${promo.name})` : ''}</span>
                  <span>−₹{promoDiscount}</span>
                </div>
              )}

              {loyaltyDiscount > 0 && (
                <div className="flex justify-between font-bold text-purple-600 purple">
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-amber-400" />
                    Loyalty ({tier?.label} {tier?.discountPercent}%)
                  </span>
                  <span>−₹{loyaltyDiscount}</span>
                </div>
              )}

              <div className="flex justify-between text-base font-extrabold total pt-1 border-t border-dashed border-slate-200">
                <span>TOTAL</span><span>₹{total}</span>
              </div>
            </div>

            {/* Loyalty points earned */}
            {customerPhone && (
              <>
                <div className="line" />
                <div className="pts-box rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-amber-700">
                      <Star size={11} className="text-amber-400" />
                      Points earned this sale
                    </span>
                    <span className="font-extrabold text-amber-700">+{pointsEarned ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-amber-600">
                    <span>Running loyalty total</span>
                    <span className="font-extrabold">{pointsAfter ?? 0} pts</span>
                  </div>
                  {tier && tier.discountPercent > 0 && (
                    <p className="mt-1 text-amber-500">
                      {tier.badge} {tier.label} member — {tier.discountPercent}% discount applied
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="line" />
            <p className="center text-center text-xs text-slate-400">Thank you for shopping with us! 🙏</p>
          </div>
        </div>
      </div>
    </div>
  );
}
