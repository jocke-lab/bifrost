/* ============================================================================
   faktura.js — BIFROST-branded Swedish A4 invoice (faktura) PDF generator.
   Fully client-side, build-free. Lazy-loads pdf-lib the SAME way pdfsign.js does
   (https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js -> window.PDFLib).

   PUBLIC API
     window.Faktura.build(invoice, org, customer) -> Promise<Uint8Array>
     window.Faktura.download(invoice, org, customer, filename?) -> Promise<void>

   ── LEGALLY-MANDATORY SWEDISH FAKTURA FIELDS (Mervärdesskattelagen / ML 17 kap;
      Bokföringslagen) — every one is rendered by build():
      1.  Fakturadatum (issue date).                                        [header]
      2.  Unikt fakturanummer (sequential unique number).                   [header]
      3.  Säljarens momsregistreringsnummer (seller VAT no.).               [SÄLJARE + footer]
      4.  Säljarens namn och adress (seller name + address).                [SÄLJARE]
      5.  Köparens namn och adress (buyer name + address).                  [KÖPARE]
      6.  Varornas/tjänsternas omfattning och art (description, qty).       [line table]
      7.  Beskattningsunderlag per skattesats (taxable amount per VAT rate).[moms summary]
      8.  Tillämpad momssats (the VAT rate applied, per line + per group).  [line table + summary]
      9.  Den moms som ska betalas (VAT amount, per rate + total).          [moms summary]
      10. À-pris / pris per enhet exkl. moms (unit price ex VAT).           [line table]
      11. Eventuell uppgift om omvänd betalningsskyldighet / undantag       [auto note when a
          (reverse charge / exemption reference) when 0% is used.           0% line is present]
      12. För utländsk valuta: momsbeloppet även uttryckt i SEK             [moms summary, when
          (ML 11 kap 11§ — VAT amount also in SEK using fx_rate).           invoice.currency!=SEK]
      Also rendered (good practice / Bokföringslagen & "F-skatt" requirement):
        Säljarens organisationsnummer, förfallodatum, betalningsuppgifter
        (bankgiro/IBAN/BIC), betalningsreferens (= fakturanummer),
        dröjsmålsränta, "Godkänd för F-skatt", sidnummer.

   ── CORRECTNESS NOTES (audit) ──────────────────────────────────────────────
   · Money is formatted MANUALLY (never Intl currency output): Intl emits
     U+00A0 / U+202F no-break spaces that the standard-Helvetica WinAnsi encoder
     THROWS on. We use a regular ASCII space as the thousands separator and a
     decimal comma ("1 234,56 kr"). Every string is passed through asc() which
     strips ALL unicode spaces [    ] and normalises dashes
     so it stays inside WinAnsi (å ä ö ü – are fine in WinAnsi anyway).
   · We RECOMPUTE net/vat/gross from the lines and THROW if they disagree with
     invoice.gross beyond a 0,01-per-line rounding tolerance, so a bad invoice
     surfaces a toast in the caller rather than shipping a wrong document.
   · The bridge mark is drawn inside try/catch; if drawSvgPath of the elliptical
     arc throws on this pdf-lib build we fall back to the wordmark only — build()
     never aborts on the logo.
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
  function ensureLib() {
    if (libP) return libP;
    libP = (async () => { if (!window.PDFLib) await loadScript(PDFLIB_SRC); return window.PDFLib; })();
    return libP;
  }

  /* ── A4 geometry (pt) ─────────────────────────────────────────────────── */
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  /* ── BIFROST palette (RGB 0..1) ───────────────────────────────────────── */
  const C = {
    ink:    [0.07, 0.10, 0.16],   // #11192A near-obsidian text
    sub:    [0.42, 0.50, 0.60],   // muted slate
    faint:  [0.62, 0.68, 0.74],
    hair:   [0.84, 0.87, 0.91],   // hairline
    panel:  [0.96, 0.97, 0.99],   // pale glass fill
    violet: [0.486, 0.361, 1.0],  // #7C5CFF
    cyan:   [0.098, 0.827, 1.0],  // #19D3FF
    mint:   [0.275, 0.902, 0.651],// #46E6A6
    white:  [1, 1, 1]
  };
  const rgb = (a) => window.PDFLib.rgb(a[0], a[1], a[2]);

  /* ── Text hygiene: keep everything WinAnsi-safe ──────────────────────────
     Strip ALL unicode spaces + narrow no-break spaces (Helvetica's WinAnsi
     encoder throws on U+00A0/U+202F/U+2009/U+2007), normalise fancy dashes/
     quotes to WinAnsi-representable glyphs, drop anything else non-WinAnsi. */
  function asc(v) {
    let s = (v == null ? '' : String(v));
    s = s
      .replace(/[           ﻿]/g, ' ')
      .replace(/[–—−]/g, '-')   // – — − -> hyphen-minus (– is WinAnsi but normalise anyway)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...');
    // Replace any char outside printable WinAnsi range with '?', but keep the
    // Latin-1 supplement (å ä ö ü etc., 0xA0..0xFF) which WinAnsi supports.
    s = s.replace(/[^\x20-\x7E¡-ÿ]/g, '?');
    return s;
  }

  /* ── Money: MANUAL formatting only (no Intl currency) ─────────────────────
     "1 234,56 kr" with a regular ASCII space as the thousands separator and a
     decimal comma. Currency code other than SEK is shown as its ISO code. */
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function groupInt(intStr) {
    // ASCII-space grouping every 3 digits from the right.
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function fmtNum(amount) {
    const n = round2(amount);
    const neg = n < 0;
    const abs = Math.abs(n);
    const fixed = abs.toFixed(2);             // "1234.56"
    const [ip, dp] = fixed.split('.');
    return (neg ? '-' : '') + groupInt(ip) + ',' + dp;
  }
  function unitFor(cur) {
    const c = (cur || 'SEK').toUpperCase();
    if (c === 'SEK') return 'kr';
    return c;                                  // EUR, USD, … shown as ISO code
  }
  function money(amount, cur) {
    return asc(fmtNum(amount) + ' ' + unitFor(cur));
  }

  /* ── Date: ISO-safe yyyy-mm-dd ────────────────────────────────────────── */
  function fmtDate(d) {
    if (!d) return '';
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    const dt = new Date(s);
    if (isNaN(dt)) return asc(s);
    const p = n => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  /* ============================================================================
     build(invoice, org, customer) -> Promise<Uint8Array>
     ========================================================================== */
  async function build(invoice, org, customer) {
    await ensureLib();
    const { PDFDocument, StandardFonts, rgb: RGB, degrees } = window.PDFLib;

    invoice = invoice || {};
    org = org || {};
    customer = customer || {};
    const settings = org.settings || {};
    const cur = (invoice.currency || 'SEK').toUpperCase();
    const isForeign = cur !== 'SEK';
    const fx = Number(invoice.fx_rate) || 0;

    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

    /* ── Integrity: recompute from lines; throw on disagreement ───────────── */
    let cNet = 0, cVat = 0;
    const groups = {};   // rate(string) -> {net, vat}
    lines.forEach(ln => {
      const qty = Number(ln.qty) || 0;
      const up = Number(ln.unit_price) || 0;
      const rate = Number(ln.vat_rate) || 0;
      const lineNet = round2(qty * up);
      const lineVat = (ln.vat_amount != null) ? round2(ln.vat_amount) : round2(lineNet * rate / 100);
      cNet = round2(cNet + lineNet);
      cVat = round2(cVat + lineVat);
      const key = String(rate);
      if (!groups[key]) groups[key] = { net: 0, vat: 0 };
      groups[key].net = round2(groups[key].net + lineNet);
      groups[key].vat = round2(groups[key].vat + lineVat);
    });
    const cGross = round2(cNet + cVat);

    // Tolerance scales with line count (per-line rounding can drift up to 0,01).
    const tol = 0.01 * Math.max(2, lines.length + 1);
    const claimGross = invoice.gross != null ? round2(invoice.gross) : cGross;
    if (lines.length && Math.abs(claimGross - cGross) > tol) {
      throw new Error(
        'Fakturan stämmer inte: summa av rader = ' + fmtNum(cGross) + ' ' + unitFor(cur) +
        ' men fakturans totalbelopp = ' + fmtNum(claimGross) + ' ' + unitFor(cur) + '.'
      );
    }

    // Prefer the server's vat_breakdown when present (it is the booked truth),
    // else fall back to the per-line groups we just computed.
    const breakdown = (invoice.data && invoice.data.vat_breakdown && Object.keys(invoice.data.vat_breakdown).length)
      ? invoice.data.vat_breakdown
      : groups;

    const sumNet = invoice.net != null ? round2(invoice.net) : cNet;
    const sumVat = invoice.vat != null ? round2(invoice.vat) : cVat;
    const sumGross = invoice.gross != null ? round2(invoice.gross) : cGross;
    const hasZeroRate = Object.keys(breakdown).some(k => Number(k) === 0);

    /* ── Document + fonts (standard Helvetica = guaranteed WinAnsi) ────────── */
    const doc = await PDFDocument.create();
    doc.setTitle(asc('Faktura ' + (invoice.number || '') + ' — ' + (org.name || 'bifrost')));
    doc.setProducer('bifrost');
    doc.setCreator('bifrost faktura');
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    const pages = [page];

    /* ── Low-level draw helpers (pdf-lib has NO auto layout) ──────────────── */
    const W = (txt, x, y, opts = {}) => {
      const f = opts.bold ? bold : reg;
      const size = opts.size || 9.5;
      let s = asc(txt);
      if (opts.max != null) s = clip(s, f, size, opts.max);
      const color = opts.color || C.ink;
      const draw = (px) => page.drawText(s, { x: px, y, size, font: f, color: rgb(color) });
      if (opts.align === 'right') draw(x - f.widthOfTextAtSize(s, size));
      else if (opts.align === 'center') draw(x - f.widthOfTextAtSize(s, size) / 2);
      else draw(x);
      return s;
    };
    const widthOf = (txt, size, b) => (b ? bold : reg).widthOfTextAtSize(asc(txt), size);
    function clip(s, f, size, maxW) {
      if (f.widthOfTextAtSize(s, size) <= maxW) return s;
      const ell = '…'.replace('…', '...');
      let out = s;
      while (out.length > 1 && f.widthOfTextAtSize(out + '...', size) > maxW) out = out.slice(0, -1);
      return out + '...';
    }
    const rect = (x, y, w, h, opts = {}) => {
      page.drawRectangle({
        x, y, width: w, height: h,
        color: opts.fill ? rgb(opts.fill) : undefined,
        borderColor: opts.border ? rgb(opts.border) : undefined,
        borderWidth: opts.border ? (opts.bw || 0.7) : 0,
        opacity: opts.opacity != null ? opts.opacity : 1,
        borderOpacity: opts.borderOpacity != null ? opts.borderOpacity : 1
      });
    };
    const hline = (x, y, w, color, thick) => {
      page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: thick || 0.7, color: rgb(color || C.hair) });
    };
    // Thin aurora accent rule: three abutting segments approximate the gradient.
    const auroraRule = (x, y, w, thick) => {
      const seg = w / 3;
      page.drawLine({ start: { x, y }, end: { x: x + seg, y }, thickness: thick || 2, color: rgb(C.violet) });
      page.drawLine({ start: { x: x + seg, y }, end: { x: x + seg * 2, y }, thickness: thick || 2, color: rgb(C.cyan) });
      page.drawLine({ start: { x: x + seg * 2, y }, end: { x: x + w, y }, thickness: thick || 2, color: rgb(C.mint) });
    };

    /* ── BIFROST bridge mark ──────────────────────────────────────────────
       Source SVG (index.html): viewBox 0 0 120 110,
         path "M14 94 A46 60 0 0 1 106 94"  + two end circles.
       We re-emit the same arc in PDF user space at (markX, baseY) scaled by k.
       SVG y is down; in drawSvgPath y is taken down from the supplied y origin,
       so we place the origin at the TOP of the mark box. Wrapped in try/catch —
       if drawSvgPath throws on the elliptical arc we fall back to the wordmark. */
    function drawMark(markX, topY, k) {
      const SVG_H = 110;
      const arc = 'M14 94 A46 60 0 0 1 106 94';
      try {
        // Stroke the arc. drawSvgPath uses the SVG path's own coords, scaled,
        // with the origin at (x, y) and +y pointing DOWN.
        page.drawSvgPath(arc, {
          x: markX, y: topY, scale: k,
          borderColor: rgb(C.cyan), borderWidth: 5.2 * k
        });
        // Two endpoint nodes (violet start, mint end). Convert SVG (cx,cy) to
        // PDF coords: pdfX = markX + cx*k ; pdfY = topY - cy*k.
        const node = (cx, cy, col) => page.drawCircle({
          x: markX + cx * k, y: topY - cy * k, size: 4.1 * k, color: rgb(col)
        });
        node(14, 94, C.violet);
        node(106, 94, C.mint);
        return true;
      } catch (e) {
        // Fallback: a clean stroked semicircle bridge using drawCircle clip is
        // not available; just signal failure so caller draws wordmark-only.
        try {
          // best-effort: drop the two nodes even if the arc failed
          page.drawCircle({ x: markX + 14 * k, y: topY - 94 * k, size: 4.1 * k, color: rgb(C.violet) });
          page.drawCircle({ x: markX + 106 * k, y: topY - 94 * k, size: 4.1 * k, color: rgb(C.mint) });
        } catch (_) { /* ignore */ }
        return false;
      }
    }

    /* ════════════════════════════════════════════════════════════════════
       HEADER BAND
       ════════════════════════════════════════════════════════════════════ */
    const headTop = PAGE_H - MARGIN;
    const markK = 0.34;                       // scale of the 120x110 mark
    const markW = 120 * markK;
    const markBoxTop = headTop;               // top of the mark
    let wordX = MARGIN;
    const markOk = drawMark(MARGIN, markBoxTop, markK);
    if (markOk) wordX = MARGIN + markW + 12;

    // "bifrost" wordmark (lowercase, bold)
    const wordY = headTop - 110 * markK + 5;  // baseline near the mark's foot
    W('bifrost', wordX, wordY + 6, { bold: true, size: 22, color: C.ink });
    W('THE BRIDGE', wordX, wordY - 6, { bold: true, size: 7.5, color: C.cyan });

    // Right side: title + meta block
    const rightX = PAGE_W - MARGIN;
    W('FAKTURA', rightX, headTop - 4, { bold: true, size: 26, color: C.ink, align: 'right' });

    // Aurora accent rule under the header band
    const ruleY = headTop - 110 * markK - 10;
    auroraRule(MARGIN, ruleY, CONTENT_W, 2.2);

    // Invoice meta (right aligned), beneath the title
    let metaY = headTop - 36;
    const metaRow = (label, value) => {
      W(label, rightX - 150, metaY, { size: 8.5, color: C.sub, align: 'left' });
      W(value, rightX, metaY, { size: 9.5, bold: true, color: C.ink, align: 'right' });
      metaY -= 14;
    };
    metaRow('Fakturanr', invoice.number || '(utkast)');
    metaRow('Fakturadatum', fmtDate(invoice.issue_date));
    metaRow('Förfallodatum', fmtDate(invoice.due_date));
    if (isForeign) metaRow('Valuta', cur + (fx ? '  (1 ' + cur + ' = ' + fmtNum(fx) + ' kr)' : ''));

    /* ════════════════════════════════════════════════════════════════════
       SÄLJARE / KÖPARE blocks
       ════════════════════════════════════════════════════════════════════ */
    let blockY = ruleY - 26;
    const colGap = 24;
    const colW = (CONTENT_W - colGap) / 2;
    const leftColX = MARGIN;
    const rightColX = MARGIN + colW + colGap;

    function partyBlock(x, w, eyebrow, accent, rows) {
      W(eyebrow, x, blockY, { bold: true, size: 8, color: accent });
      let y = blockY - 16;
      rows.forEach(r => {
        if (r == null || r[1] === '' || r[1] == null) return;
        if (r[0]) {
          W(r[0], x, y, { size: 7.5, color: C.sub });
          W(r[1], x + 64, y, { size: 9.5, bold: r[2] === 'b', color: C.ink, max: w - 64 });
        } else {
          W(r[1], x, y, { size: r[2] === 'b' ? 11 : 9.5, bold: r[2] === 'b', color: C.ink, max: w });
        }
        y -= 13.5;
      });
      return y;
    }

    // Seller rows
    const cd = customer.data || {};
    const sellerRows = [
      [null, org.name || 'bifrost', 'b'],
      [null, asc(org.address || '')],
      [null, asc(org.city || '')],
      ['Org.nr', org.org_no || ''],
      ['Moms.nr', org.vat_no || ''],
      ['Bankgiro', settings.bankgiro || ''],
      ['IBAN', settings.iban || ''],
      ['BIC', settings.bic || '']
    ].filter(r => r[1] || r[1] === 0);

    const buyerRows = [
      [null, customer.name || '', 'b'],
      [null, asc(cd.address || '')],
      ['Org.nr', cd.org_no || ''],
      ['Moms.nr', cd.vat_no || ''],
      ['E-post', cd.email || '']
    ].filter(r => r[1]);

    const yL = partyBlock(leftColX, colW, 'SÄLJARE', C.violet, sellerRows);
    const yR = partyBlock(rightColX, colW, 'KÖPARE', C.cyan, buyerRows);

    // References row (our/your reference) if present
    let refsY = Math.min(yL, yR) - 6;
    const ourRef = invoice.data && invoice.data.our_reference;
    const yourRef = invoice.data && invoice.data.your_reference;
    if (ourRef) { W('Vår referens', leftColX, refsY, { size: 7.5, color: C.sub }); W(ourRef, leftColX + 64, refsY, { size: 9, color: C.ink, max: colW - 64 }); }
    if (yourRef) { W('Er referens', rightColX, refsY, { size: 7.5, color: C.sub }); W(yourRef, rightColX + 64, refsY, { size: 9, color: C.ink, max: colW - 64 }); }
    if (ourRef || yourRef) refsY -= 16;

    /* ════════════════════════════════════════════════════════════════════
       LINE TABLE — Beskrivning | Antal | À-pris | Moms% | Belopp (ex moms)
       ════════════════════════════════════════════════════════════════════ */
    // Column x-edges (right edges for numeric columns).
    const tX = MARGIN;
    const tW = CONTENT_W;
    const colDescX = tX + 10;
    const colAmtR  = tX + tW - 10;              // Belopp (right)
    const colVatR  = colAmtR - 92;              // Moms% (right)
    const colPriceR = colVatR - 52;             // À-pris (right)
    const colQtyR  = colPriceR - 70;            // Antal (right)
    const descMax  = colQtyR - 56 - colDescX;   // leave gap before qty col

    let y = refsY - 6;
    const ROW_H = 18;
    const FOOT_RESERVE = 150;                    // space kept for summary+terms+footer

    function tableHeader() {
      // header band
      rect(tX, y - 18, tW, 20, { fill: C.ink, opacity: 1 });
      const hy = y - 13;
      W('Beskrivning', colDescX, hy, { bold: true, size: 8, color: C.white });
      W('Antal', colQtyR, hy, { bold: true, size: 8, color: C.white, align: 'right' });
      W('À-pris', colPriceR, hy, { bold: true, size: 8, color: C.white, align: 'right' });
      W('Moms%', colVatR, hy, { bold: true, size: 8, color: C.white, align: 'right' });
      W('Belopp', colAmtR, hy, { bold: true, size: 8, color: C.white, align: 'right' });
      y -= 24;
    }

    function newPage() {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
      y = PAGE_H - MARGIN - 6;
      // light continuation header
      W('bifrost', MARGIN, y, { bold: true, size: 12, color: C.ink });
      W('Faktura ' + (invoice.number || '') + ' (forts.)', rightX, y, { size: 9, color: C.sub, align: 'right' });
      y -= 16;
      auroraRule(MARGIN, y, CONTENT_W, 1.6);
      y -= 18;
      tableHeader();
    }

    tableHeader();

    let zebra = 0;
    lines.forEach(ln => {
      if (y < MARGIN + FOOT_RESERVE) newPage();
      const qty = Number(ln.qty) || 0;
      const up = Number(ln.unit_price) || 0;
      const rate = Number(ln.vat_rate) || 0;
      const lineNet = round2(qty * up);
      if (zebra % 2 === 1) rect(tX, y - 5, tW, ROW_H - 1, { fill: C.panel, opacity: 1 });
      const ry = y;
      W(ln.description || '', colDescX, ry, { size: 9, color: C.ink, max: descMax });
      W(fmtNum(qty).replace(',00', ''), colQtyR, ry, { size: 9, color: C.ink, align: 'right' });
      W(fmtNum(up), colPriceR, ry, { size: 9, color: C.ink, align: 'right' });
      W(fmtNum(rate).replace(',00', '') + ' %', colVatR, ry, { size: 9, color: C.sub, align: 'right' });
      W(fmtNum(lineNet), colAmtR, ry, { size: 9, bold: true, color: C.ink, align: 'right' });
      y -= ROW_H;
      hline(tX, y + 3, tW, C.hair, 0.5);
      zebra++;
    });

    if (!lines.length) {
      W('(Inga rader)', colDescX, y, { size: 9, color: C.sub });
      y -= ROW_H;
    }

    /* ════════════════════════════════════════════════════════════════════
       MOMS SUMMARY (grouped by rate) + ATT BETALA
       ════════════════════════════════════════════════════════════════════ */
    if (y < MARGIN + FOOT_RESERVE) newPage();
    y -= 10;

    // Right-aligned summary block.
    const sumRight = colAmtR;
    const sumLabelX = colAmtR - 220;
    const sumLine = (label, value, opts = {}) => {
      W(label, sumLabelX, y, { size: opts.big ? 11 : 9, bold: !!opts.bold, color: opts.color || C.sub });
      W(value, sumRight, y, { size: opts.big ? 12 : 9.5, bold: !!opts.bold, color: opts.color || C.ink, align: 'right' });
      y -= opts.big ? 20 : 14;
    };

    // Per-rate VAT (legally required: taxable base + VAT per applied rate).
    W('Momsspecifikation', sumLabelX, y, { bold: true, size: 8, color: C.violet });
    y -= 15;
    const rateKeys = Object.keys(breakdown).map(Number).sort((a, b) => b - a);
    rateKeys.forEach(rk => {
      const g = breakdown[String(rk)] || { net: 0, vat: 0 };
      const baseLbl = 'Underlag ' + fmtNum(rk).replace(',00', '') + ' %';
      W(baseLbl, sumLabelX, y, { size: 8.5, color: C.sub });
      W(money(g.net, cur), sumRight, y, { size: 9, color: C.ink, align: 'right' });
      y -= 12.5;
      // VAT amount for this rate; if foreign currency, also in SEK.
      let vatLbl = 'Moms ' + fmtNum(rk).replace(',00', '') + ' %';
      let vatVal = money(g.vat, cur);
      if (isForeign && fx) vatVal += '  (' + fmtNum(round2(g.vat * fx)) + ' kr)';
      W(vatLbl, sumLabelX, y, { size: 8.5, color: C.sub });
      W(vatVal, sumRight, y, { size: 9, color: C.ink, align: 'right' });
      y -= 14;
    });

    hline(sumLabelX, y + 4, sumRight - sumLabelX, C.hair, 0.7);
    y -= 6;
    sumLine('Netto (exkl. moms)', money(sumNet, cur));
    let totalVatVal = money(sumVat, cur);
    if (isForeign && fx) totalVatVal += '  (' + fmtNum(round2(sumVat * fx)) + ' kr)';
    sumLine('Moms', totalVatVal);
    y -= 2;
    // ATT BETALA — emphasised pill
    const payH = 26;
    rect(sumLabelX - 6, y - payH + 12, sumRight - sumLabelX + 12, payH, { fill: C.panel, border: C.cyan, bw: 1, opacity: 1 });
    sumLine('ATT BETALA', money(sumGross, cur), { big: true, bold: true, color: C.ink });
    if (isForeign && fx) {
      W('Motsvarar ca ' + fmtNum(round2(sumGross * fx)) + ' kr', sumRight, y, { size: 8, color: C.sub, align: 'right' });
      y -= 14;
    }

    /* ════════════════════════════════════════════════════════════════════
       BETALNINGSVILLKOR  + reverse-charge / exemption note + NOTES
       ════════════════════════════════════════════════════════════════════ */
    let termsY = y - 18;
    if (termsY < MARGIN + 70) { newPage(); termsY = y - 10; }

    W('BETALNINGSVILLKOR', MARGIN, termsY, { bold: true, size: 8, color: C.violet });
    termsY -= 15;
    const termLines = [];
    termLines.push('Förfallodatum: ' + (fmtDate(invoice.due_date) || '—'));
    const payInfo = [];
    if (settings.bankgiro) payInfo.push('Bankgiro ' + settings.bankgiro);
    if (settings.iban) payInfo.push('IBAN ' + settings.iban + (settings.bic ? ' (BIC ' + settings.bic + ')' : ''));
    if (payInfo.length) termLines.push('Betala till: ' + payInfo.join('  ·  '));
    termLines.push('Ange betalningsreferens: ' + (invoice.number || '(fakturanr)'));
    termLines.push('Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen.');
    if (hasZeroRate) {
      termLines.push('Omvänd betalningsskyldighet / undantagen omsättning kan gälla för 0 %-rader (köparen redovisar moms).');
    }
    termLines.forEach(t => { W(t, MARGIN, termsY, { size: 8.5, color: C.ink, max: CONTENT_W }); termsY -= 13; });

    const notes = invoice.data && invoice.data.notes;
    if (notes) {
      termsY -= 4;
      W('Meddelande', MARGIN, termsY, { bold: true, size: 8, color: C.sub });
      termsY -= 13;
      wrapText(asc(notes), reg, 8.5, CONTENT_W).forEach(row => {
        if (termsY < MARGIN + 44) { newPage(); termsY = y; }
        W(row, MARGIN, termsY, { size: 8.5, color: C.ink });
        termsY -= 12;
      });
    }

    /* ════════════════════════════════════════════════════════════════════
       FOOTER on every page (Org.nr, Moms.nr, F-skatt, sidnummer)
       ════════════════════════════════════════════════════════════════════ */
    const footY = MARGIN - 14;
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

  /* ── word-wrap helper for free-text notes ─────────────────────────────── */
  function wrapText(text, font, size, maxW) {
    const words = String(text).split(/\s+/);
    const rows = [];
    let cur = '';
    words.forEach(w => {
      const test = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(asc(test), size) > maxW && cur) { rows.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) rows.push(cur);
    return rows;
  }

  /* ============================================================================
     download(invoice, org, customer, filename?) — build + browser download.
     ========================================================================== */
  async function download(invoice, org, customer, filename) {
    const bytes = await build(invoice, org, customer);
    const name = filename || ('Faktura-' + (invoice && invoice.number ? invoice.number : 'utkast') + '.pdf');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return bytes;
  }

  window.Faktura = { build, download };
})();
