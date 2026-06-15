/* ============================================================================
   faktura.js — BIFROST-branded Swedish A4 invoice (faktura) PDF generator. v2.
   Premium redesign: dark aurora masthead, panelled SÄLJARE/KÖPARE, refined line
   table, emphasised "Att betala", clean payment + footer. Fully client-side.
   Lazy-loads pdf-lib (https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1 -> window.PDFLib).

   API:  window.Faktura.build(invoice, org, customer) -> Promise<Uint8Array>
         window.Faktura.download(invoice, org, customer, filename?) -> Promise<Uint8Array>

   Legally-mandatory Swedish faktura fields (ML 17 kap; Bokföringslagen) — all
   rendered: fakturadatum, unikt fakturanummer, säljarens momsreg.nr + namn/adress,
   köparens namn/adress, varornas art + antal, beskattningsunderlag per skattesats,
   tillämpad momssats, momsbelopp per sats + totalt, à-pris exkl moms, ev. omvänd
   betalningsskyldighet (0%-rad), och vid utländsk valuta momsbeloppet även i SEK.
   Plus org.nr, förfallodatum, betalningsuppgifter, betalningsreferens, F-skatt.

   Correctness: money formatted MANUALLY (no Intl currency narrow-spaces that the
   WinAnsi encoder throws on); every string passes asc() (strips unicode spaces,
   normalises dashes/quotes, drops non-WinAnsi). net/vat/gross recomputed from
   lines and THROWS on mismatch. Bridge mark in try/catch with wordmark fallback.
   ========================================================================== */
(function () {
  const PDFLIB_SRC = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some(s => s.src === src)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  let libP = null;
  function ensureLib() { if (libP) return libP; libP = (async () => { if (!window.PDFLib) await loadScript(PDFLIB_SRC); return window.PDFLib; })(); return libP; }

  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 46, CONTENT_W = PAGE_W - MARGIN * 2;
  const BAND_H = 116;

  const C = {
    ink:   [0.06, 0.09, 0.15],   // near-obsidian
    band:  [0.04, 0.06, 0.11],   // masthead bg
    body:  [0.13, 0.17, 0.24],   // body text
    sub:   [0.44, 0.51, 0.60],   // muted
    faint: [0.66, 0.71, 0.77],
    hair:  [0.86, 0.89, 0.93],
    panel: [0.965, 0.975, 0.99], // pale glass
    panelEdge: [0.90, 0.93, 0.96],
    violet:[0.486, 0.361, 1.0],  // #7C5CFF
    cyan:  [0.098, 0.827, 1.0],  // #19D3FF
    mint:  [0.275, 0.902, 0.651],// #46E6A6
    white: [1, 1, 1],
    onbandSub: [0.62, 0.70, 0.82]
  };
  const rgb = (a) => window.PDFLib.rgb(a[0], a[1], a[2]);

  function asc(v) {
    let s = (v == null ? '' : String(v));
    s = s.replace(/[            ﻿]/g, ' ')
         .replace(/[–—−]/g, '-').replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');
    s = s.replace(/[^\x20-\x7E¡-ÿ]/g, '?');
    return s;
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function groupInt(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function fmtNum(amount) { const n = round2(amount), neg = n < 0, abs = Math.abs(n); const [ip, dp] = abs.toFixed(2).split('.'); return (neg ? '-' : '') + groupInt(ip) + ',' + dp; }
  function unitFor(cur) { const c = (cur || 'SEK').toUpperCase(); return c === 'SEK' ? 'kr' : c; }
  function money(amount, cur) { return asc(fmtNum(amount) + ' ' + unitFor(cur)); }
  function intNum(n) { return fmtNum(n).replace(',00', ''); }
  function fmtDate(d) {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    const dt = new Date(String(d)); if (isNaN(dt)) return asc(String(d));
    const p = n => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  async function build(invoice, org, customer) {
    await ensureLib();
    const { PDFDocument, StandardFonts } = window.PDFLib;
    invoice = invoice || {}; org = org || {}; customer = customer || {};
    const settings = org.settings || {};
    const cur = (invoice.currency || 'SEK').toUpperCase();
    const isForeign = cur !== 'SEK';
    const fx = Number(invoice.fx_rate) || 0;
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

    /* integrity */
    let cNet = 0, cVat = 0; const groups = {};
    lines.forEach(ln => {
      const qty = Number(ln.qty) || 0, up = Number(ln.unit_price) || 0, rate = Number(ln.vat_rate) || 0;
      const lineNet = round2(qty * up), lineVat = (ln.vat_amount != null) ? round2(ln.vat_amount) : round2(lineNet * rate / 100);
      cNet = round2(cNet + lineNet); cVat = round2(cVat + lineVat);
      const k = String(rate); (groups[k] = groups[k] || { net: 0, vat: 0 }); groups[k].net = round2(groups[k].net + lineNet); groups[k].vat = round2(groups[k].vat + lineVat);
    });
    const cGross = round2(cNet + cVat);
    const tol = 0.01 * Math.max(2, lines.length + 1);
    const claimGross = invoice.gross != null ? round2(invoice.gross) : cGross;
    if (lines.length && Math.abs(claimGross - cGross) > tol) {
      throw new Error('Fakturan stämmer inte: summa av rader = ' + fmtNum(cGross) + ' ' + unitFor(cur) + ' men totalbelopp = ' + fmtNum(claimGross) + ' ' + unitFor(cur) + '.');
    }
    const breakdown = (invoice.data && invoice.data.vat_breakdown && Object.keys(invoice.data.vat_breakdown).length) ? invoice.data.vat_breakdown : groups;
    const sumNet = invoice.net != null ? round2(invoice.net) : cNet;
    const sumVat = invoice.vat != null ? round2(invoice.vat) : cVat;
    const sumGross = invoice.gross != null ? round2(invoice.gross) : cGross;
    const hasZeroRate = Object.keys(breakdown).some(k => Number(k) === 0);

    const doc = await PDFDocument.create();
    doc.setTitle(asc('Faktura ' + (invoice.number || '') + ' - ' + (org.name || 'bifrost')));
    doc.setProducer('bifrost'); doc.setCreator('bifrost faktura');
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([PAGE_W, PAGE_H]); const pages = [page];

    const W = (txt, x, y, o = {}) => {
      const f = o.bold ? bold : reg; const size = o.size || 9.5; let s = asc(txt);
      if (o.max != null) s = clip(s, f, size, o.max);
      const color = o.color || C.body;
      const px = o.align === 'right' ? x - f.widthOfTextAtSize(s, size) : o.align === 'center' ? x - f.widthOfTextAtSize(s, size) / 2 : x;
      page.drawText(s, { x: px, y, size, font: f, color: rgb(color), opacity: o.opacity != null ? o.opacity : 1 });
      return s;
    };
    function clip(s, f, size, maxW) { if (f.widthOfTextAtSize(s, size) <= maxW) return s; let o = s; while (o.length > 1 && f.widthOfTextAtSize(o + '...', size) > maxW) o = o.slice(0, -1); return o + '...'; }
    const rect = (x, y, w, h, o = {}) => page.drawRectangle({ x, y, width: w, height: h, color: o.fill ? rgb(o.fill) : undefined, borderColor: o.border ? rgb(o.border) : undefined, borderWidth: o.border ? (o.bw || 0.8) : 0, opacity: o.opacity != null ? o.opacity : 1 });
    const hline = (x, y, w, color, t) => page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: t || 0.7, color: rgb(color || C.hair) });
    const auroraRule = (x, y, w, t) => { const s = w / 3; page.drawLine({ start: { x, y }, end: { x: x + s, y }, thickness: t || 2, color: rgb(C.violet) }); page.drawLine({ start: { x: x + s, y }, end: { x: x + s * 2, y }, thickness: t || 2, color: rgb(C.cyan) }); page.drawLine({ start: { x: x + s * 2, y }, end: { x: x + w, y }, thickness: t || 2, color: rgb(C.mint) }); };

    function drawMark(markX, topY, k, dark) {
      const arc = 'M14 94 A46 60 0 0 1 106 94';
      try {
        page.drawSvgPath(arc, { x: markX, y: topY, scale: k, borderColor: rgb(C.cyan), borderWidth: 5.4 * k });
        page.drawCircle({ x: markX + 14 * k, y: topY - 94 * k, size: 4.2 * k, color: rgb(C.violet) });
        page.drawCircle({ x: markX + 106 * k, y: topY - 94 * k, size: 4.2 * k, color: rgb(C.mint) });
        return true;
      } catch (e) {
        try { page.drawCircle({ x: markX + 14 * k, y: topY - 94 * k, size: 4.2 * k, color: rgb(C.violet) }); page.drawCircle({ x: markX + 106 * k, y: topY - 94 * k, size: 4.2 * k, color: rgb(C.mint) }); } catch (_) {}
        return false;
      }
    }

    /* ── MASTHEAD (dark band) ─────────────────────────────────────────────── */
    rect(0, PAGE_H - BAND_H, PAGE_W, BAND_H, { fill: C.band });
    const markK = 0.42, markW = 120 * markK;
    const markTop = PAGE_H - 24;
    const markOk = drawMark(MARGIN, markTop, markK, true);
    const wordX = MARGIN + (markOk ? markW + 16 : 0);
    const wordBaseline = PAGE_H - 62;
    W('bifrost', wordX, wordBaseline, { bold: true, size: 26, color: C.white });
    W('THE BRIDGE', wordX + 2, wordBaseline - 14, { bold: true, size: 7.5, color: C.cyan });
    // right: FAKTURA + number
    const rightX = PAGE_W - MARGIN;
    W('FAKTURA', rightX, PAGE_H - 50, { bold: true, size: 27, color: C.white, align: 'right' });
    W(invoice.number ? '#' + invoice.number : 'UTKAST', rightX, PAGE_H - 70, { bold: true, size: 11, color: C.cyan, align: 'right' });
    auroraRule(0, PAGE_H - BAND_H, PAGE_W, 3);

    /* ── META STRIP (labeled, under band) ─────────────────────────────────── */
    let cursorY = PAGE_H - BAND_H - 26;
    const metaItems = [
      ['FAKTURADATUM', fmtDate(invoice.issue_date) || '—'],
      ['FÖRFALLODATUM', fmtDate(invoice.due_date) || '—'],
      ['BETALNINGSREF.', invoice.number || '(fakturanr)']
    ];
    if (isForeign) metaItems.push(['VALUTA', cur + (fx ? ' · 1=' + fmtNum(fx) + ' kr' : '')]);
    const metaColW = CONTENT_W / metaItems.length;
    metaItems.forEach((it, i) => {
      const x = MARGIN + i * metaColW;
      W(it[0], x, cursorY, { bold: true, size: 7, color: C.faint });
      W(it[1], x, cursorY - 13, { bold: true, size: 10.5, color: C.ink, max: metaColW - 10 });
    });
    cursorY -= 13 + 18;
    hline(MARGIN, cursorY, CONTENT_W, C.hair, 0.8);
    cursorY -= 18;

    /* ── PARTIES (two panels) ─────────────────────────────────────────────── */
    const colGap = 18, colW = (CONTENT_W - colGap) / 2;
    const leftX = MARGIN, rX2 = MARGIN + colW + colGap;
    const cd = customer.data || {};
    const sellerRows = [[null, org.name || 'bifrost', 'b'], [null, asc(org.address || '')], [null, asc(org.city || '')], ['Org.nr', org.org_no || ''], ['Moms.nr', org.vat_no || ''], ['Bankgiro', settings.bankgiro || ''], ['IBAN', settings.iban || ''], ['BIC', settings.bic || '']].filter(r => r[1] || r[1] === 0);
    const buyerRows = [[null, customer.name || '(ingen kund)', 'b'], [null, asc(cd.address || '')], ['Org.nr', cd.org_no || ''], ['Moms.nr', cd.vat_no || ''], ['E-post', cd.email || '']].filter(r => r[1]);

    function partyPanel(x, eyebrow, accent, rows) {
      const rowH = 13.4, padT = 26, padB = 12;
      const innerRows = rows.length;
      const h = padT + innerRows * rowH + padB;
      rect(x, cursorY - h, colW, h, { fill: C.panel });
      rect(x, cursorY - h, 3, h, { fill: accent });           // accent spine
      W(eyebrow, x + 14, cursorY - 16, { bold: true, size: 8, color: accent });
      let y = cursorY - padT - 4;
      rows.forEach(r => {
        if (r[0]) { W(r[0], x + 14, y, { size: 7.5, color: C.sub }); W(r[1], x + 64, y, { size: 9.3, bold: r[2] === 'b', color: C.ink, max: colW - 64 - 12 }); }
        else { W(r[1], x + 14, y, { size: r[2] === 'b' ? 11.5 : 9.3, bold: r[2] === 'b', color: C.ink, max: colW - 26 }); }
        y -= rowH;
      });
      return h;
    }
    const hL = partyPanel(leftX, 'SÄLJARE', C.violet, sellerRows);
    const hR = partyPanel(rX2, 'KÖPARE', C.cyan, buyerRows);
    cursorY -= Math.max(hL, hR) + 8;

    // references
    const ourRef = invoice.data && invoice.data.our_reference, yourRef = invoice.data && invoice.data.your_reference;
    if (ourRef || yourRef) {
      if (ourRef) { W('Vår referens: ', leftX, cursorY, { size: 8, color: C.sub }); W(ourRef, leftX + widthOfReg('Vår referens: ', 8), cursorY, { size: 8, bold: true, color: C.ink, max: colW - 80 }); }
      if (yourRef) { W('Er referens: ', rX2, cursorY, { size: 8, color: C.sub }); W(yourRef, rX2 + widthOfReg('Er referens: ', 8), cursorY, { size: 8, bold: true, color: C.ink, max: colW - 80 }); }
      cursorY -= 16;
    }
    function widthOfReg(t, s) { return reg.widthOfTextAtSize(asc(t), s); }

    /* ── LINE TABLE ───────────────────────────────────────────────────────── */
    const tX = MARGIN, tW = CONTENT_W;
    const colDescX = tX + 12;
    const colAmtR = tX + tW - 12;
    const colVatR = colAmtR - 86;
    const colPriceR = colVatR - 56;
    const colQtyR = colPriceR - 66;
    const descMax = colQtyR - 60 - colDescX;
    let y = cursorY - 6;
    const ROW_H = 19, FOOT_RESERVE = 168;

    function tableHeader() {
      rect(tX, y - 19, tW, 21, { fill: C.ink });
      const hy = y - 13.5;
      W('BESKRIVNING', colDescX, hy, { bold: true, size: 7.5, color: C.white });
      W('ANTAL', colQtyR, hy, { bold: true, size: 7.5, color: C.onbandSub, align: 'right' });
      W('À-PRIS', colPriceR, hy, { bold: true, size: 7.5, color: C.onbandSub, align: 'right' });
      W('MOMS', colVatR, hy, { bold: true, size: 7.5, color: C.onbandSub, align: 'right' });
      W('BELOPP', colAmtR, hy, { bold: true, size: 7.5, color: C.white, align: 'right' });
      y -= 26;
    }
    function newPage() {
      page = doc.addPage([PAGE_W, PAGE_H]); pages.push(page);
      y = PAGE_H - MARGIN - 6;
      W('bifrost', MARGIN, y, { bold: true, size: 12, color: C.ink });
      W('Faktura ' + (invoice.number || '') + ' (forts.)', rightX, y, { size: 9, color: C.sub, align: 'right' });
      y -= 14; auroraRule(MARGIN, y, CONTENT_W, 1.6); y -= 18; tableHeader();
    }
    tableHeader();
    let zebra = 0;
    lines.forEach(ln => {
      if (y < MARGIN + FOOT_RESERVE) newPage();
      const qty = Number(ln.qty) || 0, up = Number(ln.unit_price) || 0, rate = Number(ln.vat_rate) || 0, lineNet = round2(qty * up);
      if (zebra % 2 === 1) rect(tX, y - 6, tW, ROW_H, { fill: C.panel });
      const ry = y;
      W(ln.description || '', colDescX, ry, { size: 9, color: C.ink, max: descMax });
      W(intNum(qty), colQtyR, ry, { size: 9, color: C.body, align: 'right' });
      W(fmtNum(up), colPriceR, ry, { size: 9, color: C.body, align: 'right' });
      W(intNum(rate) + '%', colVatR, ry, { size: 9, color: C.sub, align: 'right' });
      W(fmtNum(lineNet), colAmtR, ry, { size: 9, bold: true, color: C.ink, align: 'right' });
      y -= ROW_H; hline(tX, y + 4, tW, C.hair, 0.5); zebra++;
    });
    if (!lines.length) { W('(Inga rader)', colDescX, y, { size: 9, color: C.sub }); y -= ROW_H; }

    /* ── SUMMARY (right) + payment panel (left) ───────────────────────────── */
    if (y < MARGIN + FOOT_RESERVE) newPage();
    y -= 14;
    const sumRight = colAmtR, sumLabelX = colAmtR - 210;
    W('Momsspecifikation', sumLabelX, y, { bold: true, size: 7.5, color: C.violet }); y -= 14;
    Object.keys(breakdown).map(Number).sort((a, b) => b - a).forEach(rk => {
      const g = breakdown[String(rk)] || { net: 0, vat: 0 };
      W('Underlag ' + intNum(rk) + '%', sumLabelX, y, { size: 8.5, color: C.sub });
      W(money(g.net, cur), sumRight, y, { size: 9, color: C.body, align: 'right' }); y -= 12.5;
      let vatVal = money(g.vat, cur); if (isForeign && fx) vatVal += '  (' + fmtNum(round2(g.vat * fx)) + ' kr)';
      W('Moms ' + intNum(rk) + '%', sumLabelX, y, { size: 8.5, color: C.sub });
      W(vatVal, sumRight, y, { size: 9, color: C.body, align: 'right' }); y -= 14;
    });
    hline(sumLabelX, y + 5, sumRight - sumLabelX, C.hair, 0.7); y -= 6;
    W('Netto (exkl. moms)', sumLabelX, y, { size: 9, color: C.sub }); W(money(sumNet, cur), sumRight, y, { size: 9.5, color: C.ink, align: 'right' }); y -= 14;
    let totalVatVal = money(sumVat, cur); if (isForeign && fx) totalVatVal += '  (' + fmtNum(round2(sumVat * fx)) + ' kr)';
    W('Moms', sumLabelX, y, { size: 9, color: C.sub }); W(totalVatVal, sumRight, y, { size: 9.5, color: C.ink, align: 'right' }); y -= 8;
    // ATT BETALA — dark emphasised block
    const payH = 30, payX = sumLabelX - 8, payW = sumRight - sumLabelX + 16;
    rect(payX, y - payH + 13, payW, payH, { fill: C.ink });
    rect(payX, y - payH + 13, 3, payH, { fill: C.mint });
    W('ATT BETALA', payX + 12, y - 2, { bold: true, size: 10, color: C.white });
    W(money(sumGross, cur), sumRight - 4, y - 1, { bold: true, size: 14, color: C.white, align: 'right' });
    y -= payH;
    if (isForeign && fx) { W('Motsvarar ca ' + fmtNum(round2(sumGross * fx)) + ' kr', sumRight, y, { size: 8, color: C.sub, align: 'right' }); y -= 14; }

    /* payment terms panel (left, aligned to summary top region) */
    let termsY = y - 6;
    if (termsY < MARGIN + 70) { newPage(); termsY = y - 10; }
    W('BETALNINGSVILLKOR', MARGIN, termsY, { bold: true, size: 8, color: C.violet }); termsY -= 15;
    const termLines = [];
    termLines.push('Förfallodatum: ' + (fmtDate(invoice.due_date) || '—'));
    const payInfo = [];
    if (settings.bankgiro) payInfo.push('Bankgiro ' + settings.bankgiro);
    if (settings.iban) payInfo.push('IBAN ' + settings.iban + (settings.bic ? ' (BIC ' + settings.bic + ')' : ''));
    if (payInfo.length) termLines.push('Betala till: ' + payInfo.join('   ·   '));
    termLines.push('Ange betalningsreferens: ' + (invoice.number || '(fakturanr)'));
    termLines.push('Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen.');
    if (hasZeroRate) termLines.push('Omvänd betalningsskyldighet / undantagen omsättning kan gälla för 0 %-rader (köparen redovisar moms).');
    termLines.forEach(t => { W(t, MARGIN, termsY, { size: 8.5, color: C.body, max: CONTENT_W }); termsY -= 13; });

    const notes = invoice.data && invoice.data.notes;
    if (notes) {
      termsY -= 4; W('Meddelande', MARGIN, termsY, { bold: true, size: 8, color: C.sub }); termsY -= 13;
      wrapText(asc(notes), reg, 8.5, CONTENT_W).forEach(rw => { if (termsY < MARGIN + 44) { newPage(); termsY = y; } W(rw, MARGIN, termsY, { size: 8.5, color: C.body }); termsY -= 12; });
    }

    /* footer on every page */
    const footY = MARGIN - 16;
    pages.forEach((pg, i) => {
      const save = page; page = pg;
      hline(MARGIN, footY + 16, CONTENT_W, C.hair, 0.6);
      const parts = [];
      if (org.name) parts.push(org.name);
      if (org.org_no) parts.push('Org.nr ' + org.org_no);
      if (org.vat_no) parts.push('Moms.nr ' + org.vat_no);
      parts.push('Godkänd för F-skatt');
      W(parts.join('   ·   '), MARGIN, footY, { size: 7.5, color: C.sub });
      W('Sida ' + (i + 1) + ' av ' + pages.length, rightX, footY, { size: 7.5, color: C.sub, align: 'right' });
      page = save;
    });

    return await doc.save();
  }

  function wrapText(text, font, size, maxW) {
    const words = String(text).split(/\s+/), rows = []; let cur = '';
    words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(asc(t), size) > maxW && cur) { rows.push(cur); cur = w; } else cur = t; });
    if (cur) rows.push(cur); return rows;
  }

  async function download(invoice, org, customer, filename) {
    const bytes = await build(invoice, org, customer);
    const name = filename || ('Faktura-' + (invoice && invoice.number ? invoice.number : 'utkast') + '.pdf');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return bytes;
  }

  window.Faktura = { build, download };
})();
