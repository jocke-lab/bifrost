// /api/accounting — NFT platform P&L (volume, platform fees=revenue, royalties, payouts). Service-role gated.
const { json, supa, fail } = require('./_lib');
module.exports = async (req, res) => {
  try {
    const [sales, withdrawals] = await Promise.all([
      supa('nft', 'sales?select=price_eur,platform_fee_eur,royalty_eur,rail,created_at&order=created_at.desc&limit=5000'),
      supa('nft', 'withdrawal_requests?select=amount_eur,status&limit=5000')
    ]);
    const months = {};
    let volume = 0, fees = 0, royalties = 0;
    (sales || []).forEach(s => {
      const m = (s.created_at || '').slice(0, 7);
      const row = months[m] || (months[m] = { month: m, volume: 0, fees: 0, royalties: 0, count: 0 });
      const p = Number(s.price_eur || 0), f = Number(s.platform_fee_eur || 0), r = Number(s.royalty_eur || 0);
      row.volume += p; row.fees += f; row.royalties += r; row.count++;
      volume += p; fees += f; royalties += r;
    });
    let payouts = 0;
    (withdrawals || []).forEach(w => { if (w.status === 'paid') payouts += Number(w.amount_eur || 0); });
    const monthly = Object.values(months).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
    return json(res, 200, { ok: true, configured: true, totals: { volume, fees, royalties, payouts, sales: (sales || []).length }, monthly });
  } catch (e) { return fail(res, e); }
};
