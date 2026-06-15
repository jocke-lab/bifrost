/* ============================================================================
   vault.js — The Vault. Documents & files.
   Contracts, legal, brand, signed docs — the company's paper trail in one place.

   THREE TABS (in-module sub-nav, .vault-tabs):
     · FILES    — storage gauge, folder grid, recent-docs table (now with full
                  universal metadata: owner · modified · last-modified-by · size),
                  e-signature queue, shared links, categories donut. (original view)
     · GENERATE — pick a template (Proposal/Contract/Invoice/NDA/Offer letter),
                  pick a source record (Deal/Customer/Partner/Person), PREVIEW a
                  framed document auto-filled from that record's fields, then
                  "Save document" → new file row + HELM.audit.log(doc.generated).
     · SIGN     — a signature flow: a document + signer list (people/emails),
                  "Send for signature" + per-signer status (sent→viewed→signed)
                  with a progress bar; each step writes audit doc.sent / doc.signed.
                  Provider note (Scrive / DocuSign).

   Follows the HELM module contract: register({id,label,icon,render}),
   build DOM via H.el + documented classes + H.charts, wire every button,
   gate mutating actions with HELM.session.can(...). Deterministic data only.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'vault',
    label: 'Vault',
    icon: '🗄️',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;
      const team = S.team;
      const org = S.org;

      /* money helper — Swedish company → render as " kr" (strip the $ symbol) */
      const kr = n => H.fmt.money(n).replace(/^(-?)\$/, '$1') + ' kr';
      const personName = id => { const p = team.find(t => t.id === id); return p ? p.name : id; };
      const firstName = id => personName(id).split(' ')[0];

      /* permission gates (vault.generate / vault.sign → min role 'member') */
      const canGen = S.can('vault.generate');
      const canSign = S.can('vault.sign');

      const docCount = 1742;          // total documents stored
      const usedGB = 38, totalGB = 100;

      /* ── file-type icon + tag colour map (shared by Files + Generate) ──── */
      const typeMap = {
        pdf:   { ico: '📕', cls: 'bad',  label: 'PDF' },
        doc:   { ico: '📘', cls: 'info', label: 'DOCX' },
        sheet: { ico: '📗', cls: 'ok',   label: 'XLSX' },
        img:   { ico: '🖼️', cls: 'warn', label: 'IMG' },
        sign:  { ico: '🖊️', cls: 'info', label: 'SIGNED' }
      };

      /* ── recent documents (now carry full universal metadata) ───────────
         owner = createdBy · modifiedBy = "last modified by" · when · size. */
      const baseDocs = [
        { name: 'Northwind AB — MSA 2026', type: 'pdf', owner: 'u-arvid', modifiedBy: 'u-mira', folder: 'Contracts', when: 'Jun 14 · 09:42', size: '2.4 MB' },
        { name: 'Brand Guidelines v4', type: 'doc', owner: 'u-sofia', modifiedBy: 'u-kai', folder: 'Brand', when: 'Jun 13 · 16:08', size: '8.1 MB' },
        { name: 'Q2 Cashflow Forecast', type: 'sheet', owner: 'u-ola', modifiedBy: 'u-ola', folder: 'Finance', when: 'Jun 13 · 11:20', size: '640 KB' },
        { name: 'Lykke Studios — NDA (signed)', type: 'sign', owner: 'u-arvid', modifiedBy: 'u-mira', folder: 'Legal', when: 'Jun 12 · 14:55', size: '1.1 MB' },
        { name: 'Logo Pack — Master', type: 'img', owner: 'u-sofia', modifiedBy: 'u-kai', folder: 'Brand', when: 'Jun 11 · 10:03', size: '24.7 MB' },
        { name: 'Employment — H. Bergström', type: 'pdf', owner: 'u-lena', modifiedBy: 'u-mira', folder: 'HR', when: 'Jun 10 · 17:31', size: '880 KB' },
        { name: 'Fortnox VAT Return — May', type: 'sheet', owner: 'u-ola', modifiedBy: 'u-ola', folder: 'Finance', when: 'Jun 09 · 08:14', size: '512 KB' }
      ];
      // session-local generated docs prepend here
      const generatedDocs = [];
      const allDocs = () => generatedDocs.concat(baseDocs);

      /* ── source records for GENERATE (Deals / Customers / Partners / People) ─
         realistic, deterministic; each carries the fields a doc merges from. */
      const sources = [
        { id: 'de-302', group: 'Deal', label: 'Forsberg Konsult — Q3 retainer', party: 'Forsberg Konsult AB',
          contact: 'Anders Forsberg', email: 'anders@forsbergkonsult.se', city: 'Malmö', country: 'Sweden',
          org: '556982-1077', vat: 'SE556982107701', amount: 96000, term: '12 months', owner: 'u-sofia' },
        { id: 'de-318', group: 'Deal', label: 'Aurora Fintech — platform license', party: 'Aurora Fintech AB',
          contact: 'Petra Sund', email: 'petra@aurorafintech.se', city: 'Stockholm', country: 'Sweden',
          org: '559210-3380', vat: 'SE559210338001', amount: 240000, term: '24 months', owner: 'u-sofia' },
        { id: 'cu-lykke', group: 'Customer', label: 'Lykke Studios AB', party: 'Lykke Studios AB',
          contact: 'Nora Lykke', email: 'nora@lykkestudios.se', city: 'Göteborg', country: 'Sweden',
          org: '559088-4421', vat: 'SE559088442101', amount: 48000, term: 'Rolling', owner: 'u-sofia' },
        { id: 'cu-northwind', group: 'Customer', label: 'Northwind AB', party: 'Northwind AB',
          contact: 'Erik Wahl', email: 'erik@northwind.se', city: 'Stockholm', country: 'Sweden',
          org: '556034-8772', vat: 'SE556034877201', amount: 132000, term: '12 months', owner: 'u-sofia' },
        { id: 'pt-postnord', group: 'Partner', label: 'PostNord Sverige AB', party: 'PostNord Sverige AB',
          contact: 'Logistik · kundtjänst', email: 'foretag@postnord.se', city: 'Solna', country: 'Sweden',
          org: '556711-5695', vat: 'SE556711569501', amount: 64000, term: 'Framework', owner: 'u-lena' },
        { id: 'pt-stripe', group: 'Partner', label: 'Stripe Payments Europe Ltd', party: 'Stripe Payments Europe Ltd',
          contact: 'Billing support', email: 'support@stripe.com', city: 'Dublin', country: 'Ireland',
          org: 'IE513174', vat: 'IE3206488LH', amount: 0, term: 'Per-transaction', owner: 'u-ola' },
        { id: 'u-noah', group: 'Person', label: 'Noah Ek — Lead Engineer', party: 'Noah Ek',
          contact: 'Noah Ek', email: 'noah@northwind-helm.se', city: 'Norrköping', country: 'Sweden',
          org: org.identifiers.orgNo, vat: org.identifiers.vat, amount: 720000, term: 'Permanent', owner: 'u-arvid' },
        { id: 'u-isa', group: 'Person', label: 'Isa Dahl — Customer Success', party: 'Isa Dahl',
          contact: 'Isa Dahl', email: 'isa@northwind-helm.se', city: 'Norrköping', country: 'Sweden',
          org: org.identifiers.orgNo, vat: org.identifiers.vat, amount: 540000, term: 'Permanent', owner: 'u-arvid' }
      ];

      /* ── document templates ─────────────────────────────────────────────
         each: how it merges a source record into a framed preview. */
      const templates = {
        proposal: { key: 'proposal', label: 'Proposal', ico: '📝', type: 'doc', kind: 'PROPOSAL',
          sub: 'Scope & pricing for a deal', moneyLabel: 'Proposed value' },
        contract: { key: 'contract', label: 'Contract', ico: '📑', type: 'pdf', kind: 'SERVICE AGREEMENT',
          sub: 'Master service / supply agreement', moneyLabel: 'Contract value' },
        invoice:  { key: 'invoice', label: 'Invoice', ico: '🧾', type: 'sheet', kind: 'INVOICE',
          sub: 'Billed amount & payment terms', moneyLabel: 'Amount due' },
        nda:      { key: 'nda', label: 'NDA', ico: '🔏', type: 'pdf', kind: 'MUTUAL NDA',
          sub: 'Mutual non-disclosure', moneyLabel: null },
        offer:    { key: 'offer', label: 'Offer letter', ico: '✉️', type: 'doc', kind: 'OFFER OF EMPLOYMENT',
          sub: 'Employment offer to a person', moneyLabel: 'Annual salary' }
      };
      const TPL_ORDER = ['proposal', 'contract', 'invoice', 'nda', 'offer'];

      /* ====================================================================
         DOCUMENT VIEWER  (namespaced .vault-viewer — centred modal overlay)
         --------------------------------------------------------------------
         A single shared viewer used by EVERY document-open point in the
         module (recent-docs table, generated docs, the signing room, even
         the signature queue). It renders a realistic, legible PDF-style
         "page": a near-white A4-ish paper panel with a titled contract /
         proposal / invoice / NDA, headings, paragraphs, clauses and (for
         signables) highlighted "Sign here" fields + a real e-sign flow.

         Public surface (closed over by the rest of the module):
           openViewer(docModel)  — mount + show the overlay for one document
           closeViewer()         — hide + tear down (removes the Esc handler)

         A docModel is { title, kind, type, signable, pages:[…], signers:[…] }
         built by makeDocModel(...) from either a recent-docs row, a generated
         record, or the signing-room document. Pages are deterministic mock
         content (no Date/Math.random at build) so the deck opens cold.
         ==================================================================== */

      // type → pill class + label for the toolbar chip
      const KIND_PILL = {
        pdf: { cls: 'bad', label: 'PDF' }, doc: { cls: 'info', label: 'DOCX' },
        sheet: { cls: 'ok', label: 'XLSX' }, img: { cls: 'warn', label: 'IMG' },
        sign: { cls: 'info', label: 'SIGNED' }
      };
      const today = 'Jun 15, 2026';

      /* viewer singleton state (one overlay element reused) */
      const V = { el: null, esc: null, doc: null, page: 0, zoom: 1, paper: null };

      /* ── content builders: each returns an array of "page" HTML strings ──
         These mirror the framed-preview look from Generate but expanded to a
         multi-page, genuinely readable document with clauses + sign blocks. */
      function pageHeader(kind) {
        return `
          <div class="vault-vp-header">
            <div class="vault-vp-brand">
              <div class="vault-vp-logo">NL</div>
              <div>
                <div class="vault-vp-org">${org.name}</div>
                <div class="vault-vp-org-sub">${org.addresses[0].line1} · ${org.addresses[0].city} · ${org.identifiers.orgNo}</div>
              </div>
            </div>
            <div class="vault-vp-kind">${kind}</div>
          </div>`;
      }
      function pageFooter(n, total, ref) {
        return `<div class="vault-vp-foot"><span>${ref}</span><span>Page ${n} of ${total} · ${org.name}</span></div>`;
      }
      // a highlighted "Sign here" signature field (for signables)
      function signField(id, label) {
        return `<div class="vault-vp-sigfield" data-sigfield="${id}">
            <span class="vault-vp-sigtab">✍ Sign here</span>
            <div class="vault-vp-sigslot" data-sigslot="${id}"></div>
            <div class="vault-vp-sigcap">${label}</div>
          </div>`;
      }

      /* Build the multi-page content for a given template-kind + party.
         party = { name, contact, email, city, country, org, amount, term }. */
      function buildPages(tplKey, party, ref, signable) {
        const kindLabel = (templates[tplKey] && templates[tplKey].kind) || 'DOCUMENT';
        const partiesBlock = `
          <div class="vault-vp-parties">
            <div class="vault-vp-party"><span class="vault-vp-plabel">FROM</span><b>${org.name}</b><span>${org.addresses[0].city}, ${org.country}</span><span class="mono">${org.identifiers.vat}</span></div>
            <div class="vault-vp-party"><span class="vault-vp-plabel">TO</span><b>${party.name}</b><span>${party.contact} · ${party.city}, ${party.country}</span><span class="mono">${party.email}</span></div>
          </div>`;

        let p1Body, p2Body, p3Body;

        if (tplKey === 'invoice') {
          const net = party.amount || 48000, vat = Math.round(net * 0.25), gross = net + vat;
          p1Body = `
            <p class="vault-vp-lead">Invoice <b>${ref}</b> issued ${today}, payable within 30 days to ${org.name}.</p>
            <table class="vault-vp-table">
              <tr><th>Description</th><th class="num">Amount</th></tr>
              <tr><td>Professional services per agreement — ${party.name}</td><td class="num">${kr(net)}</td></tr>
              <tr><td>VAT (25%)</td><td class="num">${kr(vat)}</td></tr>
              <tr class="vault-vp-total"><td>Total due</td><td class="num">${kr(gross)}</td></tr>
            </table>
            <h4 class="vault-vp-h">Payment details</h4>
            <p>Bankgiro <b>5051-2208</b> · IBAN SE45 5000 0000 0583 9825 7466. Reference the invoice number on payment. VAT no. ${org.identifiers.vat}.</p>
            <p class="vault-vp-fine">Late payment carries interest per the Swedish Interest Act (Räntelagen). Questions: billing@northwind-helm.se.</p>`;
          p2Body = `
            <h4 class="vault-vp-h">Line-item breakdown</h4>
            <table class="vault-vp-table">
              <tr><th>Period</th><th>Detail</th><th class="num">Hours</th><th class="num">Amount</th></tr>
              <tr><td>May 2026</td><td>Engineering &amp; delivery</td><td class="num">96</td><td class="num">${kr(Math.round(net * 0.6))}</td></tr>
              <tr><td>May 2026</td><td>Advisory &amp; review</td><td class="num">28</td><td class="num">${kr(Math.round(net * 0.25))}</td></tr>
              <tr><td>May 2026</td><td>Support &amp; maintenance</td><td class="num">18</td><td class="num">${kr(Math.round(net * 0.15))}</td></tr>
            </table>
            <h4 class="vault-vp-h">Terms</h4>
            <p><b>1. Payment.</b> Net 30 days from the invoice date. <b>2. Disputes.</b> Raise any dispute within 8 days of receipt. <b>3. Currency.</b> All amounts in SEK.</p>`;
          p3Body = `
            <h4 class="vault-vp-h">Acknowledgement</h4>
            <p>Receipt of this invoice is acknowledged by an authorised representative of ${party.name}.</p>
            ${signable ? signField('client', party.contact + ' · ' + party.name) : ''}
            <p class="vault-vp-fine">Thank you for your business. ${org.name} · ${org.addresses[0].city}.</p>`;
        } else if (tplKey === 'nda') {
          p1Body = `
            <p class="vault-vp-lead">This Mutual Non-Disclosure Agreement (the "Agreement") is entered into on ${today} between <b>${org.name}</b> (org. nr ${org.identifiers.orgNo}) and <b>${party.name}</b> (org. nr ${party.org}).</p>
            <h4 class="vault-vp-h">1. Confidential Information</h4>
            <p>Each party may disclose proprietary, technical, commercial or financial information ("Confidential Information") for the purpose of evaluating a potential business relationship between the parties.</p>
            <h4 class="vault-vp-h">2. Obligations</h4>
            <p>The receiving party shall hold all Confidential Information in strict confidence, use it solely for the stated purpose, and limit access to personnel with a genuine need to know who are bound by equivalent confidentiality terms.</p>`;
          p2Body = `
            <h4 class="vault-vp-h">3. Exclusions</h4>
            <p>Confidential Information does not include information that is or becomes public through no fault of the receiving party, was lawfully known before disclosure, or is independently developed without reference to the disclosure.</p>
            <h4 class="vault-vp-h">4. Term</h4>
            <p>The confidentiality obligations survive for three (3) years from the date of disclosure. Either party may terminate the evaluation at any time on written notice.</p>
            <h4 class="vault-vp-h">5. Governing law</h4>
            <p>This Agreement is governed by the laws of Sweden. Disputes shall be resolved by the Norrköping District Court.</p>`;
          p3Body = `
            <h4 class="vault-vp-h">6. Signatures</h4>
            <p>Executed by the duly authorised representatives of the parties as of the date first written above.</p>
            <div class="vault-vp-signgrid">
              ${signable ? signField('provider', personName(party.ownerId || 'u-arvid') + ' · ' + org.name) : '<div class="vault-vp-sigstatic"><span class="vault-vp-sigline"></span><span class="vault-vp-sigcap">' + org.name + '</span></div>'}
              ${signable ? signField('client', party.contact + ' · ' + party.name) : '<div class="vault-vp-sigstatic"><span class="vault-vp-sigline"></span><span class="vault-vp-sigcap">' + party.name + '</span></div>'}
            </div>`;
        } else if (tplKey === 'offer') {
          const sal = party.amount || 600000;
          p1Body = `
            <p class="vault-vp-lead">Dear ${party.contact},</p>
            <p>${org.name} is delighted to offer you the role described below. We were impressed throughout the process and believe you will be a great addition to the team in ${party.city}.</p>
            <table class="vault-vp-table">
              <tr><td>Position</td><td>${party.role || 'Team member'}</td></tr>
              <tr><td>Employment</td><td>${party.term || 'Permanent'}</td></tr>
              <tr><td>Start date</td><td>Sep 1, 2026</td></tr>
              <tr class="vault-vp-total"><td>Annual salary</td><td>${kr(sal)} / yr</td></tr>
            </table>`;
          p2Body = `
            <h4 class="vault-vp-h">Benefits &amp; terms</h4>
            <p><b>Pension.</b> ITP-equivalent occupational pension. <b>Leave.</b> 30 days paid annual leave. <b>Wellness.</b> Friskvårdsbidrag per Skatteverket guidance. <b>Notice.</b> Mutual notice per LAS.</p>
            <h4 class="vault-vp-h">Probation</h4>
            <p>The first six (6) months are a probationary period (provanställning) per the Employment Protection Act (LAS).</p>`;
          p3Body = `
            <h4 class="vault-vp-h">Acceptance</h4>
            <p>Please sign and return by Jun 30, 2026 to accept this offer. We look forward to welcoming you aboard.</p>
            ${signable ? signField('client', party.contact + ' · Candidate') : ''}
            <p class="vault-vp-fine">Standard Swedish employment terms apply. Warm regards, ${personName(party.ownerId || 'u-arvid')}, ${org.name}.</p>`;
        } else if (tplKey === 'proposal') {
          const val = party.amount || 96000;
          p1Body = `
            <p class="vault-vp-lead">Prepared for <b>${party.contact}</b> at <b>${party.name}</b> · ${today}.</p>
            <p>${org.name} proposes to deliver the scope set out below over an engagement of <b>${party.term || '12 months'}</b>, with quarterly review checkpoints and a named delivery lead.</p>
            <table class="vault-vp-table">
              <tr><th>Item</th><th class="num">Value</th></tr>
              <tr><td>Engagement — ${party.name}</td><td class="num">${kr(val)}</td></tr>
              <tr class="vault-vp-total"><td>Proposed value</td><td class="num">${kr(val)}</td></tr>
            </table>`;
          p2Body = `
            <h4 class="vault-vp-h">Scope of work</h4>
            <p><b>Phase 1 — Discovery.</b> Stakeholder interviews, current-state audit, success metrics. <b>Phase 2 — Build.</b> Iterative delivery in two-week cycles. <b>Phase 3 — Handover.</b> Documentation, training and a 30-day support window.</p>
            <h4 class="vault-vp-h">Timeline</h4>
            <p>Kick-off within two weeks of acceptance. Quarterly business reviews thereafter.</p>`;
          p3Body = `
            <h4 class="vault-vp-h">Acceptance</h4>
            <p>This proposal is valid for 30 days from issue. To proceed, sign below and we will issue the service agreement.</p>
            ${signable ? signField('client', party.contact + ' · ' + party.name) : ''}
            <p class="vault-vp-fine">Subject to a mutual NDA. ${org.name} · ${org.addresses[0].city}.</p>`;
        } else {
          // contract / service agreement (default)
          const val = party.amount || 132000;
          p1Body = `
            <p class="vault-vp-lead">This Service Agreement (the "Agreement") is made on ${today} between <b>${org.name}</b> (the "Provider") and <b>${party.name}</b> (the "Client").</p>
            <h4 class="vault-vp-h">1. Services</h4>
            <p>The Provider shall supply the services agreed between the parties (the "Services") for an initial term of <b>${party.term || '12 months'}</b>, renewing automatically unless terminated on 60 days' notice.</p>
            <h4 class="vault-vp-h">2. Fees</h4>
            <p>The Client shall pay <b>${kr(val)}</b> per the agreed schedule, plus VAT where applicable. Invoices are payable net 30 days.</p>`;
          p2Body = `
            <h4 class="vault-vp-h">3. Responsibilities</h4>
            <p>The Provider shall perform the Services with reasonable skill and care. The Client shall provide timely access, information and approvals reasonably required for delivery.</p>
            <h4 class="vault-vp-h">4. Liability</h4>
            <p>Neither party shall be liable for indirect or consequential loss. Aggregate liability is capped at the fees paid in the preceding twelve months.</p>
            <h4 class="vault-vp-h">5. Governing law</h4>
            <p>This Agreement is governed by the laws of Sweden; disputes resolved in the Norrköping District Court.</p>`;
          p3Body = `
            <h4 class="vault-vp-h">6. Signatures</h4>
            <p>Signed by the duly authorised representatives of the parties as of the date first written above.</p>
            <div class="vault-vp-signgrid">
              ${signable ? signField('provider', personName(party.ownerId || 'u-arvid') + ' · ' + org.name) : '<div class="vault-vp-sigstatic"><span class="vault-vp-sigline"></span><span class="vault-vp-sigcap">' + org.name + '</span></div>'}
              ${signable ? signField('client', party.contact + ' · ' + party.name) : '<div class="vault-vp-sigstatic"><span class="vault-vp-sigline"></span><span class="vault-vp-sigcap">' + party.name + '</span></div>'}
            </div>`;
        }

        const titleLine = `<div class="vault-vp-title">${(templates[tplKey] && templates[tplKey].label) || 'Document'} — ${party.name}</div>`;
        return [
          `${pageHeader(kindLabel)}${titleLine}${partiesBlock}<div class="vault-vp-body">${p1Body}</div>${pageFooter(1, 3, ref)}`,
          `${pageHeader(kindLabel)}<div class="vault-vp-body">${p2Body}</div>${pageFooter(2, 3, ref)}`,
          `${pageHeader(kindLabel)}<div class="vault-vp-body">${p3Body}</div>${pageFooter(3, 3, ref)}`
        ];
      }

      /* Infer a template key + a party object from a free-form doc name so a
         recent-docs row (which has only a name + folder) still renders a rich,
         on-topic document. Falls back to a generic service agreement. */
      function partyFromName(name, folder) {
        // try to match a known source by party name appearing in the doc title
        const match = sources.find(s => name.indexOf(s.party.split(' ')[0]) >= 0);
        if (match) return Object.assign({ name: match.party, ownerId: match.owner, role: match.label.split('—')[1] ? match.label.split('—')[1].trim() : '' }, {
          contact: match.contact, email: match.email, city: match.city, country: match.country, org: match.org, amount: match.amount, term: match.term
        });
        return { name: name.replace(/—.*$/, '').trim() || 'Counterparty', contact: 'Authorised signatory', email: 'contact@example.se', city: 'Stockholm', country: 'Sweden', org: '556000-0000', amount: 0, term: '12 months', ownerId: 'u-arvid', role: '' };
      }
      function tplFromDoc(name, folder, type) {
        const n = name.toLowerCase();
        if (n.indexOf('invoice') >= 0 || n.indexOf('vat') >= 0 || folder === 'Invoices' || folder === 'Finance') return 'invoice';
        if (n.indexOf('nda') >= 0) return 'nda';
        if (n.indexOf('offer') >= 0 || n.indexOf('employment') >= 0 || folder === 'HR') return 'offer';
        if (n.indexOf('proposal') >= 0) return 'proposal';
        if (n.indexOf('msa') >= 0 || n.indexOf('agreement') >= 0 || n.indexOf('contract') >= 0 || folder === 'Contracts' || folder === 'Legal') return 'contract';
        return type === 'sheet' ? 'invoice' : 'contract';
      }

      /* makeDocModel — normalise any open-source into a viewer-ready model.
         opts: { name, type, folder, tplKey?, party?, signable?, signers?, ref? } */
      function makeDocModel(opts) {
        const tplKey = opts.tplKey || tplFromDoc(opts.name, opts.folder, opts.type);
        const party = opts.party || partyFromName(opts.name, opts.folder);
        // a signed doc (.type 'sign') shows as already executed, not signable
        const signable = opts.signable != null ? opts.signable
          : (opts.type !== 'sign' && tplKey !== 'invoice');
        const ref = opts.ref || ('#' + (tplKey === 'invoice' ? 'INV' : 'DOC') + '-2026-0' + D.int('vault-ref-' + opts.name, 41, 98));
        return {
          title: opts.name,
          kind: (templates[tplKey] && templates[tplKey].kind) || 'DOCUMENT',
          type: opts.type || (templates[tplKey] && templates[tplKey].type) || 'doc',
          tplKey, party, ref, signable,
          pages: buildPages(tplKey, party, ref, signable),
          signers: opts.signers || null,
          signedState: {}   // sigfield id → { name, ts }
        };
      }

      /* ── viewer overlay: build once, reuse ─────────────────────────────── */
      function ensureViewer() {
        if (V.el) return V.el;
        const ov = H.el(`
          <div class="vault-viewer" role="dialog" aria-modal="true" aria-label="Document viewer">
            <div class="vault-viewer-scrim" data-vv="scrim"></div>
            <div class="vault-viewer-box">
              <div class="vault-viewer-bar">
                <div class="vault-viewer-id">
                  <span class="vault-viewer-ico" data-vv="ico">📄</span>
                  <div class="vault-viewer-idmeta">
                    <div class="vault-viewer-title" data-vv="title">Document</div>
                    <div class="vault-viewer-sub"><span class="tag" data-vv="pill">DOC</span> <span class="mono faint" data-vv="ref"></span></div>
                  </div>
                </div>
                <div class="vault-viewer-tools">
                  <div class="vault-viewer-pager">
                    <button class="vault-vv-btn" data-vv="prev" title="Previous page">‹</button>
                    <span class="vault-viewer-page" data-vv="page">Page 1 / 3</span>
                    <button class="vault-vv-btn" data-vv="next" title="Next page">›</button>
                  </div>
                  <div class="vault-viewer-zoom">
                    <button class="vault-vv-btn" data-vv="zoom-out" title="Zoom out">−</button>
                    <span class="vault-viewer-zlevel" data-vv="zlevel">100%</span>
                    <button class="vault-vv-btn" data-vv="zoom-in" title="Zoom in">+</button>
                  </div>
                  <button class="btn btn-sm" data-vv="download">⤓ Download</button>
                  <button class="btn btn-sm" data-vv="print">🖨 Print</button>
                  <button class="btn btn-sm" data-vv="sign-open" hidden>✍ Sign</button>
                  <button class="btn btn-sm" data-vv="send" hidden>📨 Send for signature</button>
                  <button class="vault-viewer-x" data-vv="close" aria-label="Close" title="Close (Esc)">✕</button>
                </div>
              </div>
              <div class="vault-viewer-stage" data-vv="stage">
                <div class="vault-viewer-paper" data-vv="paper"></div>
              </div>
              <div class="vault-viewer-signbar" data-vv="signbar" hidden></div>
            </div>
          </div>
        `);
        document.body.appendChild(ov);
        V.el = ov;
        V.paper = ov.querySelector('[data-vv="paper"]');

        const q = sel => ov.querySelector('[data-vv="' + sel + '"]');
        q('scrim').addEventListener('click', closeViewer);
        q('close').addEventListener('click', closeViewer);
        q('prev').addEventListener('click', () => gotoPage(V.page - 1));
        q('next').addEventListener('click', () => gotoPage(V.page + 1));
        q('zoom-in').addEventListener('click', () => setZoom(V.zoom + 0.1));
        q('zoom-out').addEventListener('click', () => setZoom(V.zoom - 0.1));
        q('download').addEventListener('click', () => H.toast('Downloading "' + (V.doc && V.doc.title) + '" as PDF…', 'info'));
        q('print').addEventListener('click', () => { H.toast('Preparing print preview…', 'info'); try { window.print(); } catch (e) {} });
        q('sign-open').addEventListener('click', () => openSignerPanel('client'));
        q('send').addEventListener('click', sendForSignature);
        return ov;
      }

      function setZoom(z) {
        V.zoom = Math.max(0.7, Math.min(1.6, Math.round(z * 10) / 10));
        if (V.paper) V.paper.style.transform = 'scale(' + V.zoom + ')';
        const lvl = V.el && V.el.querySelector('[data-vv="zlevel"]');
        if (lvl) lvl.textContent = Math.round(V.zoom * 100) + '%';
      }

      function gotoPage(i) {
        if (!V.doc) return;
        const total = V.doc.pages.length;
        V.page = Math.max(0, Math.min(total - 1, i));
        paintPage();
      }

      function paintPage() {
        if (!V.doc || !V.paper) return;
        const total = V.doc.pages.length;
        V.paper.innerHTML = V.doc.pages[V.page];
        const lbl = V.el.querySelector('[data-vv="page"]');
        if (lbl) lbl.textContent = 'Page ' + (V.page + 1) + ' / ' + total;
        const prev = V.el.querySelector('[data-vv="prev"]');
        const next = V.el.querySelector('[data-vv="next"]');
        if (prev) prev.disabled = V.page === 0;
        if (next) next.disabled = V.page === total - 1;
        // re-apply any already-applied signatures + wire "Sign here" fields
        rehydrateSignatures();
        wireSignFields();
        // reset scroll to the top of the stage on page change
        const stage = V.el.querySelector('[data-vv="stage"]');
        if (stage) stage.scrollTop = 0;
      }

      // restore applied signatures into their slots when a page is (re)painted
      function rehydrateSignatures() {
        if (!V.doc) return;
        Object.keys(V.doc.signedState).forEach(fid => {
          const slot = V.paper.querySelector('[data-sigslot="' + fid + '"]');
          const field = V.paper.querySelector('[data-sigfield="' + fid + '"]');
          if (!slot) return;
          const sig = V.doc.signedState[fid];
          slot.innerHTML = `<span class="vault-vp-signature">${sig.name}</span>`;
          if (field) {
            field.classList.add('signed');
            const tab = field.querySelector('.vault-vp-sigtab');
            if (tab) tab.textContent = '✓ Signed · ' + sig.ts;
          }
        });
      }

      // clicking an unsigned "Sign here" field opens the signer panel for it
      function wireSignFields() {
        V.paper.querySelectorAll('.vault-vp-sigfield:not(.signed)').forEach(f => {
          f.addEventListener('click', () => openSignerPanel(f.dataset.sigfield));
        });
      }

      /* ── signer panel: type name → cursive preview → apply signature ───── */
      function openSignerPanel(fieldId) {
        if (!canSign) { H.toast('Needs member role to sign documents', 'warn'); return; }
        const bar = V.el.querySelector('[data-vv="signbar"]');
        if (!bar) return;
        const me = S.user;
        bar.hidden = false;
        bar.innerHTML = `
          <div class="vault-signer-panel">
            <div class="vault-sp-head">
              <span class="vault-sp-ico">✍</span>
              <div>
                <div class="vault-sp-title">Adopt your signature</div>
                <div class="vault-sp-sub">Signing as <b>${me.name}</b> · ${me.email}</div>
              </div>
              <button class="vault-sp-x" data-sp="cancel" aria-label="Cancel">✕</button>
            </div>
            <div class="vault-sp-row">
              <label class="vault-sp-field">
                <span class="vault-sp-label">FULL NAME</span>
                <input type="text" data-sp="name" value="${me.name}" autocomplete="off" />
              </label>
              <div class="vault-sp-preview">
                <span class="vault-sp-plabel">PREVIEW</span>
                <span class="vault-sp-ink" data-sp="ink">${me.name}</span>
              </div>
            </div>
            <div class="vault-sp-actions">
              <span class="vault-sp-legal">By signing you agree this is the legal equivalent of your handwritten signature.</span>
              <div class="row gap-sm">
                <button class="btn btn-sm btn-ghost" data-sp="cancel2">Cancel</button>
                <button class="btn btn-sm btn-primary" data-sp="apply">Apply signature</button>
              </div>
            </div>
          </div>`;
        const nameInput = bar.querySelector('[data-sp="name"]');
        const ink = bar.querySelector('[data-sp="ink"]');
        nameInput.addEventListener('input', () => { ink.textContent = nameInput.value || me.name; });
        const cancel = () => { bar.hidden = true; bar.innerHTML = ''; };
        bar.querySelector('[data-sp="cancel"]').addEventListener('click', cancel);
        bar.querySelector('[data-sp="cancel2"]').addEventListener('click', cancel);
        bar.querySelector('[data-sp="apply"]').addEventListener('click', () => {
          applySignature(fieldId, nameInput.value.trim() || me.name);
          cancel();
        });
        nameInput.focus();
        nameInput.select();
      }

      function applySignature(fieldId, name) {
        if (!V.doc) return;
        const stamp = today + ' · ' + S.user.name.split(' ')[0];
        V.doc.signedState[fieldId] = { name, ts: stamp };
        // ensure the signed field is on the current page; if not, jump to it
        let slot = V.paper.querySelector('[data-sigslot="' + fieldId + '"]');
        if (!slot) {
          const pageIdx = V.doc.pages.findIndex(p => p.indexOf('data-sigslot="' + fieldId + '"') >= 0);
          if (pageIdx >= 0) { gotoPage(pageIdx); slot = V.paper.querySelector('[data-sigslot="' + fieldId + '"]'); }
        }
        rehydrateSignatures();
        wireSignFields();
        H.audit.log({
          action: 'doc.signed',
          entityType: 'Document',
          entityId: V.doc.ref,
          summary: `${name} signed "${V.doc.title}" in the Vault viewer`,
          links: [{ entityType: 'Document', entityId: V.doc.ref }],
          after: { signing: 'signed', field: fieldId, signer: S.user.email, provider: 'Scrive' },
          module: 'vault'
        });
        H.toast(`Signature applied — "${V.doc.title}" signed by ${name}`, 'success');
        updateSignToolbar();
      }

      // toggle the toolbar's Sign / Send buttons based on the doc's signability
      function updateSignToolbar() {
        if (!V.el || !V.doc) return;
        const signBtn = V.el.querySelector('[data-vv="sign-open"]');
        const sendBtn = V.el.querySelector('[data-vv="send"]');
        const hasFields = /data-sigfield=/.test(V.doc.pages.join(''));
        const allSigned = hasFields && V.doc.pages.join('').match(/data-sigfield="([^"]+)"/g)
          .every(m => V.doc.signedState[m.replace(/.*"([^"]+)".*/, '$1')]);
        if (signBtn) signBtn.hidden = !V.doc.signable || !hasFields || allSigned;
        if (sendBtn) sendBtn.hidden = !V.doc.signable || !hasFields;
      }

      /* "Send for signature" — invite signer emails, each with its own
         Sent → Viewed → Signed status + a progress bar, every step audited.
         Rendered as a panel inside the signbar (reuses the .vault-signer rows
         styling from the Sign tab, namespaced under .vault-vsend-*). */
      function sendForSignature() {
        if (!canSign) { H.toast('Needs member role to send for signature', 'warn'); return; }
        const bar = V.el.querySelector('[data-vv="signbar"]');
        if (!bar) return;
        bar.hidden = false;
        const STEPS = ['sent', 'viewed', 'signed'];
        const STEP_LABEL = { draft: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed' };
        const STEP_TAG = { draft: '', sent: 'info', viewed: 'warn', signed: 'ok' };
        // seed the signer list from the doc's party + the acting provider
        const list = (V.doc.signers && V.doc.signers.slice()) || [
          { name: S.user.name, email: S.user.email, role: 'Provider · ' + org.name, status: 'draft' },
          { name: V.doc.party.contact, email: V.doc.party.email, role: 'Counterparty · ' + V.doc.party.name, status: 'draft' }
        ];
        let provider = 'Scrive';

        bar.innerHTML = `
          <div class="vault-vsend">
            <div class="vault-vsend-head">
              <div class="vault-sp-title">📨 Send for signature</div>
              <div class="vault-vsend-prov">
                <button class="vault-prov-btn on" data-prov="Scrive">Scrive · BankID</button>
                <button class="vault-prov-btn" data-prov="DocuSign">DocuSign</button>
              </div>
              <button class="vault-sp-x" data-vs="cancel" aria-label="Close">✕</button>
            </div>
            <div class="vault-vsend-add">
              <input type="email" data-vs="email" placeholder="add signer email…" autocomplete="off" />
              <button class="btn btn-sm" data-vs="add">+ Add signer</button>
            </div>
            <div class="vault-vsend-progress">
              <div class="row between"><span class="vault-sign-prog-label">Completion</span><span class="vault-sign-prog-val" data-vs="pct">0%</span></div>
              <div class="progress"><div class="bar" data-vs="bar" style="width:0"></div></div>
            </div>
            <div class="vault-vsend-list" data-vs="list"></div>
            <div class="vault-vsend-foot muted">Provider: <b data-vs="provname">Scrive (BankID)</b> · each step writes <code>doc.sent</code> / <code>doc.viewed</code> / <code>doc.signed</code> to the Audit log.</div>
          </div>`;

        const listWrap = bar.querySelector('[data-vs="list"]');
        const barEl = bar.querySelector('[data-vs="bar"]');
        const pctEl = bar.querySelector('[data-vs="pct"]');
        const provName = bar.querySelector('[data-vs="provname"]');

        function refresh() {
          const done = list.filter(s => s.status === 'signed').length;
          const pct = list.length ? Math.round(done / list.length * 100) : 0;
          barEl.style.width = pct + '%';
          barEl.className = 'bar' + (pct === 100 ? '' : pct >= 50 ? ' warn' : ' bad');
          pctEl.textContent = pct + '%';
        }
        function nextOf(st) { const i = STEPS.indexOf(st); return st === 'draft' ? 'sent' : (i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null); }

        function paint() {
          listWrap.innerHTML = '';
          list.forEach((s, idx) => {
            const nxt = nextOf(s.status);
            const row = H.el(`
              <div class="vault-vsend-row${s.status === 'signed' ? ' done' : ''}">
                <span class="avatar sq" style="width:30px;height:30px;font-size:11px">${D.initials(s.name)}</span>
                <div class="vault-vsend-meta">
                  <div class="vault-vsend-name">${s.name}</div>
                  <div class="vault-vsend-sub mono faint">${s.email} · ${s.role}</div>
                </div>
                <span class="tag ${STEP_TAG[s.status]}">${STEP_LABEL[s.status]}</span>
                ${nxt ? `<button class="btn btn-sm vault-vsend-adv">${nxt === 'sent' ? 'Send' : nxt === 'viewed' ? 'Mark viewed' : 'Mark signed'}</button>` : '<span class="vault-signer-ok">✓ Done</span>'}
              </div>`);
            const advBtn = row.querySelector('.vault-vsend-adv');
            if (advBtn) advBtn.addEventListener('click', () => {
              const n = nextOf(s.status); if (!n) return;
              s.status = n;
              const action = n === 'signed' ? 'doc.signed' : n === 'viewed' ? 'doc.viewed' : 'doc.sent';
              H.audit.log({
                action, entityType: 'Document', entityId: V.doc.ref,
                summary: `${s.name} ${n === 'signed' ? 'signed' : n === 'viewed' ? 'viewed' : 'was sent'} "${V.doc.title}" via ${provider}`,
                links: [{ entityType: 'Document', entityId: V.doc.ref }, { entityType: 'Person', entityId: s.email }],
                after: { signing: n, provider, signer: s.email }, module: 'vault'
              });
              H.toast(`${s.name.split(' ')[0]} — ${STEP_LABEL[n]}${n === 'signed' ? ' ✓' : ''}`, n === 'signed' ? 'success' : 'info');
              paint(); refresh();
              if (list.every(x => x.status === 'signed')) setTimeout(() => H.toast('All parties signed — "' + V.doc.title + '" is fully executed', 'success'), 300);
            });
            listWrap.appendChild(row);
          });
        }

        bar.querySelectorAll('.vault-prov-btn').forEach(b => b.addEventListener('click', () => {
          provider = b.dataset.prov;
          bar.querySelectorAll('.vault-prov-btn').forEach(x => x.classList.toggle('on', x === b));
          provName.textContent = provider === 'Scrive' ? 'Scrive (BankID)' : 'DocuSign';
          H.toast('E-sign provider → ' + provider, 'info');
        }));
        bar.querySelector('[data-vs="cancel"]').addEventListener('click', () => { bar.hidden = true; bar.innerHTML = ''; });
        bar.querySelector('[data-vs="add"]').addEventListener('click', () => {
          const inp = bar.querySelector('[data-vs="email"]');
          const email = (inp.value || '').trim();
          if (!email || email.indexOf('@') < 0) { H.toast('Enter a valid email to add a signer', 'warn'); return; }
          list.push({ name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), email, role: 'Signer', status: 'draft' });
          inp.value = '';
          paint(); refresh();
          H.toast('Added ' + email + ' as a signer', 'success');
        });

        paint(); refresh();
      }

      /* openViewer(docModel) — mount the overlay, paint page 1, add Esc. */
      function openViewer(docModel) {
        ensureViewer();
        V.doc = docModel;
        V.page = 0;
        V.zoom = 1;
        setZoom(1);
        // toolbar identity
        const ico = V.el.querySelector('[data-vv="ico"]');
        const title = V.el.querySelector('[data-vv="title"]');
        const pill = V.el.querySelector('[data-vv="pill"]');
        const ref = V.el.querySelector('[data-vv="ref"]');
        const pillMeta = KIND_PILL[docModel.type] || KIND_PILL.doc;
        if (ico) ico.textContent = (typeMap[docModel.type] || typeMap.doc).ico;
        if (title) title.textContent = docModel.title;
        if (pill) { pill.textContent = docModel.kind + ' · ' + pillMeta.label; pill.className = 'tag ' + pillMeta.cls; }
        if (ref) ref.textContent = docModel.ref;
        // hide any open sign panel from a previous doc
        const sb = V.el.querySelector('[data-vv="signbar"]');
        if (sb) { sb.hidden = true; sb.innerHTML = ''; }
        paintPage();
        updateSignToolbar();
        V.el.classList.add('open');
        // Escape-to-close — ADDED on open, REMOVED on close
        V.esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeViewer(); } };
        document.addEventListener('keydown', V.esc, true);
        H.audit.log({
          action: 'doc.viewed', entityType: 'Document', entityId: docModel.ref,
          summary: `${S.user.name} opened "${docModel.title}" in the Vault viewer`,
          links: [{ entityType: 'Document', entityId: docModel.ref }],
          after: { viewing: true }, module: 'vault'
        });
      }

      function closeViewer() {
        if (!V.el) return;
        V.el.classList.remove('open');
        if (V.esc) { document.removeEventListener('keydown', V.esc, true); V.esc = null; }
        const sb = V.el.querySelector('[data-vv="signbar"]');
        if (sb) { sb.hidden = true; sb.innerHTML = ''; }
        V.doc = null;
      }

      /* ====================================================================
         VIEW HEAD
         ==================================================================== */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🗄️</div>
            <div>
              <h1>Vault</h1>
              <p>Documents &amp; files. Generate, sign and store — every page, one place.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="new-folder">◇ New folder</button>
            <button class="btn btn-primary btn-sm" data-act="upload">⤴ Upload</button>
          </div>
        </div>
      `));

      /* ── in-module tab bar ──────────────────────────────────────────────── */
      const tabBar = H.el(`
        <div class="vault-tabs" role="tablist">
          <button class="vault-tab on" data-tab="files" role="tab"><span class="vt-ico">🗂️</span> Files</button>
          <button class="vault-tab" data-tab="generate" role="tab"><span class="vt-ico">✨</span> Generate</button>
          <button class="vault-tab" data-tab="sign" role="tab"><span class="vt-ico">🖊️</span> Sign</button>
        </div>
      `);
      root.appendChild(tabBar);

      // three panel hosts (only one visible at a time)
      const panes = {};
      ['files', 'generate', 'sign'].forEach(name => {
        const p = H.el(`<div class="vault-pane${name === 'files' ? ' on' : ''}" data-pane="${name}"></div>`);
        panes[name] = p;
        root.appendChild(p);
      });

      /* ====================================================================
         TAB 1 — FILES  (the original dashboard, metadata-enriched)
         ==================================================================== */
      buildFiles(panes.files);

      function buildFiles(host) {
        const D2 = H.data;
        const storedTrend = D2.series('vault-stored', 14, 22, 38, 0.07);
        const uploadsSpark = D2.series('vault-uploads', 12, 18, 41, 0.22);
        const signedSpark = D2.series('vault-signed', 12, 6, 19, 0.20);
        const viewsSpark = D2.series('vault-views', 12, 120, 264, 0.16);

        /* KPI ROW */
        const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
        [
          { label: 'DOCUMENTS', count: docCount, fmt: 'num', sub: 'across 6 vaults', trend: '+34 this wk', dir: 'up', spark: uploadsSpark },
          { label: 'AWAITING SIGNATURE', count: 5, fmt: 'num', sub: '2 overdue · chase now', trend: '-2 vs last wk', dir: 'up', spark: signedSpark },
          { label: 'SHARED LINKS', count: 5, fmt: 'num', sub: '269 views · 30d', trend: '+18.4%', dir: 'up', spark: viewsSpark },
          { label: 'STORAGE USED', count: usedGB, fmt: 'num', sub: 'of ' + totalGB + ' GB · 62 free', trend: '+2.1 GB', dir: 'flat', spark: storedTrend, suffix: ' GB' }
        ].forEach(k => {
          kpiRow.appendChild(H.el(`
            <div class="card kpi vault-kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}"${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
              <div class="row between mt-sm">
                <span class="kpi-sub">${k.sub}</span>
                <span class="kpi-trend ${k.dir}">${k.trend}</span>
              </div>
              <div class="spark">${H.charts.spark(k.spark)}</div>
            </div>
          `));
        });
        host.appendChild(kpiRow);

        /* ROW 2: storage gauge | folder grid (span 2) */
        const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
        const usedPct = Math.round((usedGB / totalGB) * 100);
        const gaugeCard = H.el(`
          <div class="card vault-gauge-card">
            <div class="card-head">
              <h3><span class="hico">💾</span> Storage</h3>
              <span class="ch-meta">${usedGB} / ${totalGB} GB</span>
            </div>
            <div class="vault-gauge">
              <div class="vault-gauge-ring">
                ${H.charts.gauge(usedPct, { max: 100, size: 200, arc: 270 })}
                <div class="vault-gauge-core">
                  <div class="vg-num" data-count="${usedPct}" data-suffix="%">0</div>
                  <div class="vg-lbl">CAPACITY USED</div>
                </div>
              </div>
              <div class="vault-gauge-breakdown"></div>
            </div>
          </div>
        `);
        const gtxt = gaugeCard.querySelector('.vault-gauge-ring svg text');
        if (gtxt) gtxt.style.display = 'none';
        const breakdown = gaugeCard.querySelector('.vault-gauge-breakdown');
        [
          { label: 'Documents', gb: 16.4, pct: 43, cls: '' },
          { label: 'Media & brand', gb: 12.8, pct: 34, cls: 'media' },
          { label: 'Signed PDFs', gb: 6.1, pct: 16, cls: 'signed' },
          { label: 'Archive', gb: 2.7, pct: 7, cls: 'archive' }
        ].forEach(b => {
          breakdown.appendChild(H.el(`
            <div class="vault-bd-row">
              <span class="vault-bd-dot ${b.cls}"></span>
              <span class="vault-bd-name">${b.label}</span>
              <span class="vault-bd-val">${b.gb} GB</span>
            </div>
          `));
        });
        row2.appendChild(gaugeCard);

        const folders = [
          { name: 'Contracts', ico: '📑', files: 312, sub: 'MSAs · NDAs · SOWs', tone: 'a1' },
          { name: 'Invoices', ico: '🧾', files: 528, sub: 'Issued & received', tone: 'a2' },
          { name: 'Legal', ico: '⚖️', files: 96, sub: 'Filings · IP · disputes', tone: 'a3' },
          { name: 'HR', ico: '👥', files: 174, sub: 'Employment · policies', tone: 'warn' },
          { name: 'Brand', ico: '🎨', files: 241, sub: 'Logos · guidelines · kit', tone: 'a2' },
          { name: 'Finance', ico: '📊', files: 391, sub: 'Statements · audits · tax', tone: 'a1' }
        ];
        const folderCard = H.el(`
          <div class="card span-2 vault-folders-card">
            <div class="card-head">
              <h3><span class="hico">🗂️</span> Vaults</h3>
              <span class="ch-meta">6 FOLDERS · ${docCount.toLocaleString('en-US')} FILES</span>
            </div>
            <div class="vault-folder-grid"></div>
          </div>
        `);
        const fGrid = folderCard.querySelector('.vault-folder-grid');
        folders.forEach(f => {
          const tile = H.el(`
            <button class="vault-folder vault-tone-${f.tone}" data-folder="${f.name}">
              <div class="vault-folder-top">
                <span class="vault-folder-ico">${f.ico}</span>
                <span class="vault-folder-count">${f.files}</span>
              </div>
              <div class="vault-folder-name">${f.name}</div>
              <div class="vault-folder-sub">${f.sub}</div>
              <div class="vault-folder-foot">
                <span class="vault-folder-files">${f.files} files</span>
                <span class="vault-folder-go">Open →</span>
              </div>
            </button>
          `);
          tile.addEventListener('click', () => H.toast('Opening ' + f.name + ' vault — ' + f.files + ' files', 'info'));
          fGrid.appendChild(tile);
        });
        row2.appendChild(folderCard);
        host.appendChild(row2);

        /* ROW 3: recent documents table (span 2) | e-signature queue */
        const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
        const tableCard = H.el(`
          <div class="card span-2 flush vault-table-card">
            <div class="card-head" style="padding:16px 16px 0">
              <h3><span class="hico">📄</span> Recent Documents</h3>
              <span class="ch-meta" data-vault="docs-count"></span>
            </div>
            <div class="vault-table-scroll">
              <table class="table vault-table">
                <thead>
                  <tr>
                    <th>Document</th><th>Type</th><th>Owner</th><th>Modified</th><th>Last modified by</th><th class="num">Size</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        `);
        const tbody = tableCard.querySelector('tbody');
        const docsCountEl = tableCard.querySelector('[data-vault="docs-count"]');

        // paint helper — re-callable so Generate's "Save" can refresh the list
        function paintDocs() {
          tbody.innerHTML = '';
          const list = allDocs();
          docsCountEl.textContent = list.length + ' OF ' + docCount.toLocaleString('en-US');
          list.forEach(d => {
            const t = typeMap[d.type] || typeMap.doc;
            const ownerN = personName(d.owner);
            const modN = personName(d.modifiedBy);
            const row = H.el(`
              <tr data-doc="${d.name}"${d.fresh ? ' class="vault-row-fresh"' : ''}>
                <td>
                  <div class="vault-doc-cell">
                    <span class="vault-doc-ico">${t.ico}</span>
                    <div class="vault-doc-meta">
                      <div class="vault-doc-name">${d.name}</div>
                      <div class="vault-doc-folder">${d.folder}</div>
                    </div>
                  </div>
                </td>
                <td><span class="tag ${t.cls}">${t.label}</span></td>
                <td>
                  <div class="vault-owner"><span class="avatar" style="width:24px;height:24px;font-size:9px">${D2.initials(ownerN)}</span><span class="vault-owner-name">${ownerN.split(' ')[0]}</span></div>
                </td>
                <td class="mono faint">${d.when}</td>
                <td>
                  <div class="vault-owner"><span class="avatar" style="width:22px;height:22px;font-size:8px">${D2.initials(modN)}</span><span class="vault-owner-name">${modN.split(' ')[0]}</span></div>
                </td>
                <td class="num mono">${d.size}</td>
              </tr>
            `);
            row.addEventListener('click', () => H.toast('Opening "' + d.name + '"', 'info'));
            tbody.appendChild(row);
          });
        }
        host.__paintDocs = paintDocs;   // expose so Generate can refresh
        paintDocs();
        row3.appendChild(tableCard);

        const sigs = [
          { sev: 'bad', who: 'Aurora Medtech', doc: 'Supply Agreement', days: 9, party: 'counterparty' },
          { sev: 'bad', who: 'H. Bergström', doc: 'Employment Contract', days: 4, party: 'new hire' },
          { sev: 'warn', who: 'Vasa Logistik', doc: 'Renewal Addendum', days: 2, party: 'counterparty' },
          { sev: 'info', who: 'Kvarnström AB', doc: 'NDA — Mutual', days: 1, party: 'counterparty' },
          { sev: 'info', who: 'Internal — Board', doc: 'Q2 Resolution', days: 1, party: 'internal' }
        ];
        const sigCard = H.el(`
          <div class="card vault-sig-card">
            <div class="card-head">
              <h3><span class="hico">🖊️</span> Awaiting Signature</h3>
              <span class="badge bad">${sigs.length}</span>
            </div>
            <div class="vault-sig-list"></div>
            <button class="btn btn-sm btn-block mt" data-act="open-sign">→ Open signing room</button>
          </div>
        `);
        const sigWrap = sigCard.querySelector('.vault-sig-list');
        sigs.forEach(s => {
          const node = H.el(`
            <div class="attn ${s.sev}">
              <span class="a-ico">${s.sev === 'bad' ? '🔴' : s.sev === 'warn' ? '🟠' : '🔵'}</span>
              <div class="a-body">
                <div class="a-title">${s.doc}</div>
                <div class="a-sub">${s.who} · ${s.party} · ${s.days}d waiting</div>
              </div>
              <button class="btn btn-sm" data-who="${s.who}">Remind</button>
            </div>
          `);
          node.querySelector('[data-who]').addEventListener('click', () =>
            H.toast('Signature reminder sent to ' + s.who, 'success'));
          sigWrap.appendChild(node);
        });
        sigCard.querySelector('[data-act="open-sign"]').addEventListener('click', () => switchTab('sign'));
        row3.appendChild(sigCard);
        host.appendChild(row3);

        /* ROW 4: shared links (span 2) | categories donut */
        const row4 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
        const links = [
          { doc: 'Brand Guidelines v4', scope: 'Anyone with link', views: 84, exp: 'No expiry', ico: '🎨', state: 'ok' },
          { doc: 'Northwind MSA 2026', scope: 'Northwind AB only', views: 12, exp: 'Expires Jun 30', ico: '📑', state: 'warn' },
          { doc: 'Investor Data Room', scope: 'Password · 4 invited', views: 137, exp: 'Expires Jul 12', ico: '🔐', state: 'ok' },
          { doc: 'Logo Pack — Master', scope: 'Anyone with link', views: 27, exp: 'No expiry', ico: '🖼️', state: 'ok' },
          { doc: 'Q2 Forecast (read-only)', scope: 'Board · 3 invited', views: 9, exp: 'Expires Jun 20', ico: '📊', state: 'warn' }
        ];
        const linkCard = H.el(`
          <div class="card span-2 vault-links-card">
            <div class="card-head">
              <h3><span class="hico">🔗</span> Shared Links</h3>
              <span class="ch-meta">${links.length} ACTIVE · ${links.reduce((a, l) => a + l.views, 0)} VIEWS</span>
            </div>
            <div class="list"></div>
          </div>
        `);
        const linkList = linkCard.querySelector('.list');
        links.forEach(l => {
          const node = H.el(`
            <div class="list-item vault-link-item">
              <div class="li-ico">${l.ico}</div>
              <div class="li-body">
                <div class="li-title">${l.doc}</div>
                <div class="li-sub">${l.scope} · <span class="vault-link-exp ${l.state === 'warn' ? 'warn' : ''}">${l.exp}</span></div>
              </div>
              <div class="vault-link-right">
                <span class="vault-link-views">${l.views} <small>views</small></span>
                <button class="btn btn-sm" data-copy="${l.doc}">Copy</button>
              </div>
            </div>
          `);
          node.querySelector('[data-copy]').addEventListener('click', (e) => {
            e.stopPropagation();
            H.toast('Link to "' + l.doc + '" copied to clipboard', 'success');
          });
          linkList.appendChild(node);
        });
        row4.appendChild(linkCard);

        const cats = [
          { label: 'Invoices', value: 528, color: 'var(--accent2)' },
          { label: 'Finance', value: 391, color: 'var(--accent1)' },
          { label: 'Contracts', value: 312, color: 'var(--accent3)' },
          { label: 'Brand', value: 241, color: 'var(--warn)' },
          { label: 'HR', value: 174, color: 'var(--danger)' },
          { label: 'Legal', value: 96, color: 'var(--text-muted)' }
        ];
        const catTotal = cats.reduce((a, c) => a + c.value, 0);
        const donutCard = H.el(`
          <div class="card vault-donut-card">
            <div class="card-head">
              <h3><span class="hico">🍩</span> By Category</h3>
              <span class="ch-meta">${catTotal.toLocaleString('en-US')} FILES</span>
            </div>
            <div class="chart" style="height:184px">
              ${H.charts.donut(cats, { size: 184, thickness: 24, center: { value: cats.length, label: 'CATEGORIES' } })}
            </div>
            <div class="vault-cat-legend"></div>
          </div>
        `);
        const legend = donutCard.querySelector('.vault-cat-legend');
        cats.forEach(c => {
          const pct = Math.round((c.value / catTotal) * 100);
          legend.appendChild(H.el(`
            <div class="vault-cat-row">
              <span class="vault-cat-dot" style="color:${c.color}"></span>
              <span class="vault-cat-name">${c.label}</span>
              <span class="vault-cat-val">${c.value}</span>
              <span class="vault-cat-pct faint">${pct}%</span>
            </div>
          `));
        });
        row4.appendChild(donutCard);
        host.appendChild(row4);
      }

      /* ====================================================================
         TAB 2 — GENERATE  (template + source → framed preview → save)
         ==================================================================== */
      buildGenerate(panes.generate);

      function buildGenerate(host) {
        let activeTpl = 'contract';
        let activeSrcId = sources[0].id;

        const intro = H.el(`
          <div class="card vault-gen-intro" style="margin-bottom:var(--gap)">
            <div class="card-head">
              <h3><span class="hico">✨</span> Generate a document</h3>
              <span class="ch-meta">MERGE · ${org.name.toUpperCase()}</span>
            </div>
            <p class="muted vault-gen-lead">Pick a template and a source record. The Vault merges the record's fields into a ready-to-send draft — then save it to a vault.</p>
          </div>
        `);
        host.appendChild(intro);

        const grid = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

        /* LEFT: controls (template chips + source select) */
        const controls = H.el(`
          <div class="card vault-gen-controls">
            <div class="card-head"><h3><span class="hico">⚙︎</span> Setup</h3></div>
            <div class="vault-gen-label">1 · Template</div>
            <div class="vault-tpl-grid"></div>
            <div class="vault-gen-label" style="margin-top:14px">2 · Source record</div>
            <label class="vault-gen-field">
              <select data-gen="src"></select>
            </label>
            <div class="vault-src-card" data-gen="src-card"></div>
            <button class="btn btn-primary btn-block mt" data-gen="save"${canGen ? '' : ' disabled title="Needs member role"'}>💾 Save document</button>
            <div class="vault-gen-note muted">Saving adds a file row and writes <code>doc.generated</code> to the Audit log.</div>
          </div>
        `);

        const tplGrid = controls.querySelector('.vault-tpl-grid');
        TPL_ORDER.forEach(key => {
          const t = templates[key];
          const b = H.el(`
            <button class="vault-tpl ${key === activeTpl ? 'on' : ''}" data-tpl="${key}">
              <span class="vault-tpl-ico">${t.ico}</span>
              <span class="vault-tpl-name">${t.label}</span>
              <span class="vault-tpl-sub">${t.sub}</span>
            </button>
          `);
          b.addEventListener('click', () => { activeTpl = key; syncTpl(); renderPreview(); });
          tplGrid.appendChild(b);
        });
        function syncTpl() {
          tplGrid.querySelectorAll('.vault-tpl').forEach(x => x.classList.toggle('on', x.dataset.tpl === activeTpl));
        }

        // source select grouped by type
        const srcSel = controls.querySelector('[data-gen="src"]');
        ['Deal', 'Customer', 'Partner', 'Person'].forEach(g => {
          const opts = sources.filter(s => s.group === g);
          if (!opts.length) return;
          const og = document.createElement('optgroup');
          og.label = g + 's';
          opts.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = s.label;
            og.appendChild(o);
          });
          srcSel.appendChild(og);
        });
        srcSel.value = activeSrcId;
        srcSel.addEventListener('change', () => { activeSrcId = srcSel.value; renderSrcCard(); renderPreview(); });

        const srcCardEl = controls.querySelector('[data-gen="src-card"]');
        function renderSrcCard() {
          const s = sources.find(x => x.id === activeSrcId);
          srcCardEl.innerHTML = `
            <div class="vault-src-head">
              <span class="tag info">${s.group}</span>
              <span class="vault-src-id mono faint">${s.id}</span>
            </div>
            <div class="vault-src-name">${s.party}</div>
            <div class="vault-src-rows">
              <div class="vault-src-row"><span>Contact</span><b>${s.contact}</b></div>
              <div class="vault-src-row"><span>Email</span><b class="mono">${s.email}</b></div>
              <div class="vault-src-row"><span>Org. nr</span><b class="mono">${s.org}</b></div>
              <div class="vault-src-row"><span>Owner</span><b>${firstName(s.owner)}</b></div>
            </div>`;
        }
        grid.appendChild(controls);

        /* RIGHT: framed document preview (span 2) */
        const previewCard = H.el(`
          <div class="card span-2 vault-preview-card">
            <div class="card-head">
              <h3><span class="hico">📄</span> Preview</h3>
              <span class="ch-meta" data-gen="prev-meta"></span>
            </div>
            <div class="vault-doc-frame">
              <div class="vault-doc" data-gen="doc"></div>
            </div>
          </div>
        `);
        const docEl = previewCard.querySelector('[data-gen="doc"]');
        const prevMeta = previewCard.querySelector('[data-gen="prev-meta"]');

        function genTitle(t, s) {
          if (t.key === 'invoice') return 'Invoice — ' + s.party;
          if (t.key === 'nda') return 'Mutual NDA — ' + org.name + ' × ' + s.party;
          if (t.key === 'offer') return 'Offer of Employment — ' + s.party;
          if (t.key === 'proposal') return 'Proposal — ' + s.party;
          return 'Service Agreement — ' + s.party;
        }

        function bodyFor(t, s) {
          const today = 'Jun 15, 2026';
          const isPerson = s.group === 'Person';
          if (t.key === 'invoice') {
            const net = s.amount, vat = Math.round(net * 0.25), gross = net + vat;
            return `
              <p>Invoice <b>#INV-2026-0${D.int('vault-inv-' + s.id, 41, 98)}</b> issued ${today}, payable within 30 days to ${org.name}.</p>
              <table class="vault-doc-table">
                <tr><th>Description</th><th class="num">Amount</th></tr>
                <tr><td>Services per agreement — ${s.party}</td><td class="num">${kr(net)}</td></tr>
                <tr><td>VAT (25%)</td><td class="num">${kr(vat)}</td></tr>
                <tr class="vault-doc-total"><td>Total due</td><td class="num">${kr(gross)}</td></tr>
              </table>
              <p class="vault-doc-fine">Bankgiro 5051-2208 · ${org.identifiers.vat} · Late interest per Swedish Interest Act.</p>`;
          }
          if (t.key === 'nda') {
            return `
              <p>This Mutual Non-Disclosure Agreement is entered into on ${today} between <b>${org.name}</b> (org. nr ${org.identifiers.orgNo}) and <b>${s.party}</b> (org. nr ${s.org}).</p>
              <p><b>1. Confidential Information.</b> Each party may disclose proprietary information for the purpose of evaluating a potential business relationship.</p>
              <p><b>2. Obligations.</b> The receiving party shall hold all Confidential Information in strict confidence and use it solely for the stated purpose.</p>
              <p><b>3. Term.</b> Obligations survive for three (3) years from the date of disclosure. Governing law: Sweden.</p>`;
          }
          if (t.key === 'offer') {
            return `
              <p>Dear ${s.contact},</p>
              <p>${org.name} is delighted to offer you the role described below. We believe you will be a great addition to the team in ${s.city}.</p>
              <table class="vault-doc-table">
                <tr><td>Position</td><td>${s.label.split('—')[1] ? s.label.split('—')[1].trim() : 'Team member'}</td></tr>
                <tr><td>Employment</td><td>${s.term}</td></tr>
                <tr><td>Start date</td><td>Sep 1, 2026</td></tr>
                <tr class="vault-doc-total"><td>${t.moneyLabel}</td><td>${kr(s.amount)} / yr</td></tr>
              </table>
              <p class="vault-doc-fine">Please sign and return by Jun 30, 2026. Standard Swedish employment terms (LAS) apply.</p>`;
          }
          if (t.key === 'proposal') {
            return `
              <p>Prepared for <b>${s.contact}</b> at <b>${s.party}</b> · ${today}.</p>
              <p>${org.name} proposes to deliver the scope below over an engagement of <b>${s.term}</b>, with quarterly review checkpoints.</p>
              <table class="vault-doc-table">
                <tr><th>Item</th><th class="num">Value</th></tr>
                <tr><td>Engagement — ${s.party}</td><td class="num">${kr(s.amount)}</td></tr>
                <tr class="vault-doc-total"><td>${t.moneyLabel}</td><td class="num">${kr(s.amount)}</td></tr>
              </table>
              <p class="vault-doc-fine">Valid 30 days from issue. ${isPerson ? '' : 'Subject to a mutual NDA.'}</p>`;
          }
          // contract
          return `
            <p>This Service Agreement is made on ${today} between <b>${org.name}</b> (the "Provider") and <b>${s.party}</b> (the "Client").</p>
            <p><b>1. Services.</b> The Provider shall supply the services agreed in deal ${s.id} for a term of <b>${s.term}</b>.</p>
            <p><b>2. Fees.</b> The Client shall pay ${kr(s.amount)} per the agreed schedule, plus VAT where applicable.</p>
            <p><b>3. Governing law.</b> This Agreement is governed by the laws of Sweden; disputes resolved in Norrköping District Court.</p>`;
        }

        function renderPreview() {
          const t = templates[activeTpl];
          const s = sources.find(x => x.id === activeSrcId);
          prevMeta.textContent = t.kind + ' · ' + s.group.toUpperCase();
          docEl.innerHTML = `
            <div class="vault-doc-watermark">DRAFT</div>
            <div class="vault-doc-header">
              <div class="vault-doc-brand">
                <div class="vault-doc-logo">NL</div>
                <div>
                  <div class="vault-doc-org">${org.name}</div>
                  <div class="vault-doc-org-sub">${org.addresses[0].line1} · ${org.addresses[0].city} · ${org.identifiers.orgNo}</div>
                </div>
              </div>
              <div class="vault-doc-kind">${t.kind}</div>
            </div>
            <div class="vault-doc-title">${genTitle(t, s)}</div>
            <div class="vault-doc-parties">
              <div class="vault-doc-party">
                <span class="vault-doc-plabel">FROM</span>
                <b>${org.name}</b><span>${org.addresses[0].city}, ${org.country}</span><span class="mono">${org.identifiers.vat}</span>
              </div>
              <div class="vault-doc-party">
                <span class="vault-doc-plabel">TO</span>
                <b>${s.party}</b><span>${s.contact} · ${s.city}, ${s.country}</span><span class="mono">${s.email}</span>
              </div>
            </div>
            <div class="vault-doc-body">${bodyFor(t, s)}</div>
            <div class="vault-doc-sign">
              <div class="vault-doc-sigbox"><span class="vault-doc-sigline"></span><span class="vault-doc-siglabel">${personName(s.owner)} · ${org.name}</span></div>
              <div class="vault-doc-sigbox"><span class="vault-doc-sigline"></span><span class="vault-doc-siglabel">${s.contact} · ${s.party}</span></div>
            </div>`;
        }

        // save → new file row + audit
        controls.querySelector('[data-gen="save"]').addEventListener('click', () => {
          if (!canGen) { H.toast('Needs member role to generate documents', 'warn'); return; }
          const t = templates[activeTpl];
          const s = sources.find(x => x.id === activeSrcId);
          const name = genTitle(t, s);
          const sizeKb = D.int('vault-gen-size-' + t.key + s.id, 180, 2400);
          const size = sizeKb >= 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB';
          const rec = {
            name, type: t.type, owner: S.user.id, modifiedBy: S.user.id,
            folder: t.key === 'invoice' ? 'Invoices' : t.key === 'offer' ? 'HR' : t.key === 'nda' ? 'Legal' : 'Contracts',
            when: 'Jun 15 · now', size, fresh: true,
            id: 'doc-gen-' + (generatedDocs.length + 1)
          };
          generatedDocs.unshift(rec);
          if (typeof panes.files.__paintDocs === 'function') panes.files.__paintDocs();

          H.audit.log({
            action: 'doc.generated',
            entityType: 'Document',
            entityId: rec.id,
            summary: `${S.user.name} generated a ${t.label.toLowerCase()} for ${s.party} from ${s.group.toLowerCase()} ${s.id}`,
            links: [{ entityType: 'Document', entityId: rec.id }, { entityType: s.group, entityId: s.id }],
            after: { template: t.key, source: s.id, folder: rec.folder },
            module: 'vault'
          });
          H.toast(`"${name}" saved to ${rec.folder} · logged to Audit`, 'success');
        });

        grid.appendChild(previewCard);
        host.appendChild(grid);

        // initial paint
        syncTpl();
        renderSrcCard();
        renderPreview();
      }

      /* ====================================================================
         TAB 3 — SIGN  (signer list · send · per-signer status · progress)
         ==================================================================== */
      buildSign(panes.sign);

      function buildSign(host) {
        // the document in the signing room + its signers (mutable session state)
        const STEPS = ['draft', 'sent', 'viewed', 'signed'];
        const STEP_LABEL = { draft: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed' };
        const STEP_TAG = { draft: '', sent: 'info', viewed: 'warn', signed: 'ok' };
        const docId = 'doc-sign-501';
        const docTitle = 'Aurora Fintech — Platform Licence 2026';
        let provider = 'Scrive';
        const signers = [
          { name: 'Arvid Arvidsson', email: 'arvid@northwind-helm.se', role: 'Provider · CEO', status: 'signed', internal: true },
          { name: 'Petra Sund', email: 'petra@aurorafintech.se', role: 'Aurora Fintech · CEO', status: 'viewed', internal: false },
          { name: 'Mira Lindqvist', email: 'mira@northwind-helm.se', role: 'Provider · Witness', status: 'sent', internal: true },
          { name: 'Johan Aderyd', email: 'johan@aurorafintech.se', role: 'Aurora Fintech · Legal', status: 'draft', internal: false }
        ];

        const head = H.el(`
          <div class="card vault-sign-head" style="margin-bottom:var(--gap)">
            <div class="card-head">
              <h3><span class="hico">🖊️</span> Signing room</h3>
              <span class="ch-meta">PROVIDER · <span data-sign="provider">${provider.toUpperCase()}</span></span>
            </div>
            <div class="vault-sign-doc">
              <div class="vault-sign-doc-ico">📑</div>
              <div class="vault-sign-doc-meta">
                <div class="vault-sign-doc-title">${docTitle}</div>
                <div class="vault-sign-doc-sub mono faint">${docId} · 4 signers · sent via e-sign</div>
              </div>
              <div class="vault-sign-provider">
                <button class="vault-prov-btn on" data-prov="Scrive">Scrive</button>
                <button class="vault-prov-btn" data-prov="DocuSign">DocuSign</button>
              </div>
            </div>
            <div class="vault-sign-progress">
              <div class="row between">
                <span class="vault-sign-prog-label">Completion</span>
                <span class="vault-sign-prog-val" data-sign="pct">0%</span>
              </div>
              <div class="progress"><div class="bar" data-sign="bar" style="width:0"></div></div>
              <div class="vault-sign-prog-sub muted" data-sign="prog-sub"></div>
            </div>
            <div class="row gap-sm mt">
              <button class="btn btn-primary btn-sm" data-sign="send"${canSign ? '' : ' disabled title="Needs member role"'}>📨 Send for signature</button>
              <button class="btn btn-ghost btn-sm" data-sign="remind">✉️ Remind pending</button>
            </div>
          </div>
        `);
        host.appendChild(head);

        const provVal = head.querySelector('[data-sign="provider"]');
        head.querySelectorAll('.vault-prov-btn').forEach(b => {
          b.addEventListener('click', () => {
            provider = b.dataset.prov;
            head.querySelectorAll('.vault-prov-btn').forEach(x => x.classList.toggle('on', x === b));
            provVal.textContent = provider.toUpperCase();
            H.toast('E-sign provider → ' + provider, 'info');
          });
        });

        const listCard = H.el(`
          <div class="card vault-signers-card">
            <div class="card-head">
              <h3><span class="hico">👥</span> Signers</h3>
              <span class="ch-meta" data-sign="count"></span>
            </div>
            <div class="vault-signer-list"></div>
            <div class="vault-sign-foot muted">Each status change writes <code>doc.signed</code> / <code>doc.sent</code> to the Audit log — a tamper-evident signing trail.</div>
          </div>
        `);
        const listWrap = listCard.querySelector('.vault-signer-list');
        const countEl = listCard.querySelector('[data-sign="count"]');
        host.appendChild(listCard);

        const bar = head.querySelector('[data-sign="bar"]');
        const pctEl = head.querySelector('[data-sign="pct"]');
        const progSub = head.querySelector('[data-sign="prog-sub"]');

        function refreshProgress() {
          const done = signers.filter(s => s.status === 'signed').length;
          const pct = Math.round((done / signers.length) * 100);
          bar.style.width = pct + '%';
          bar.className = 'bar' + (pct === 100 ? '' : pct >= 50 ? ' warn' : ' bad');
          pctEl.textContent = pct + '%';
          progSub.textContent = `${done} of ${signers.length} signed · ${signers.filter(s => s.status === 'viewed').length} viewing · ${signers.filter(s => s.status === 'sent').length} pending`;
          countEl.textContent = done + ' / ' + signers.length + ' SIGNED';
        }

        function nextStep(s) {
          const i = STEPS.indexOf(s.status);
          if (i >= STEPS.length - 1) return null;
          return STEPS[i + 1];
        }

        function advance(s, idx) {
          if (!canSign) { H.toast('Needs member role to drive the signing flow', 'warn'); return; }
          const nxt = nextStep(s);
          if (!nxt) return;
          s.status = nxt;
          paintSigner(idx);
          refreshProgress();

          const action = nxt === 'signed' ? 'doc.signed' : nxt === 'sent' ? 'doc.sent' : 'doc.viewed';
          const verb = nxt === 'signed' ? 'signed' : nxt === 'viewed' ? 'opened' : 'was sent';
          H.audit.log({
            action,
            entityType: 'Document',
            entityId: docId,
            summary: `${s.name} ${nxt === 'signed' ? 'signed' : nxt === 'viewed' ? 'viewed' : 'was sent'} "${docTitle}" via ${provider}`,
            links: [{ entityType: 'Document', entityId: docId }, { entityType: 'Person', entityId: s.email }],
            after: { signing: nxt, provider, signer: s.email },
            module: 'vault'
          });
          H.toast(`${s.name.split(' ')[0]} — ${STEP_LABEL[nxt]}${nxt === 'signed' ? ' ✓' : ''}`, nxt === 'signed' ? 'success' : 'info');

          if (signers.every(x => x.status === 'signed')) {
            setTimeout(() => H.toast('All parties signed — "' + docTitle + '" is fully executed', 'success'), 350);
          }
        }

        function paintSigner(idx) {
          const s = signers[idx];
          const node = listWrap.children[idx];
          const tagCls = STEP_TAG[s.status];
          const stepIdx = STEPS.indexOf(s.status);
          const nxt = nextStep(s);
          node.className = 'vault-signer' + (s.status === 'signed' ? ' done' : '');
          node.innerHTML = `
            <div class="vault-signer-av"><span class="avatar sq">${D.initials(s.name)}</span>${s.internal ? '<span class="vault-signer-int">INT</span>' : ''}</div>
            <div class="vault-signer-meta">
              <div class="vault-signer-name">${s.name}</div>
              <div class="vault-signer-sub">${s.role} · <span class="mono faint">${s.email}</span></div>
              <div class="vault-signer-track">
                ${STEPS.map((st, i) => `<span class="vault-signer-dot ${i <= stepIdx ? 'on' : ''} ${i === stepIdx ? 'cur' : ''}" title="${STEP_LABEL[st]}"></span>`).join('<span class="vault-signer-rail"></span>')}
              </div>
            </div>
            <div class="vault-signer-right">
              <span class="tag ${tagCls}">${STEP_LABEL[s.status]}</span>
              ${nxt ? `<button class="btn btn-sm vault-signer-adv">${nxt === 'sent' ? 'Send' : nxt === 'viewed' ? 'Mark viewed' : 'Mark signed'}</button>` : '<span class="vault-signer-ok">✓ Done</span>'}
            </div>`;
          const advBtn = node.querySelector('.vault-signer-adv');
          if (advBtn) advBtn.addEventListener('click', () => advance(s, idx));
        }

        // build empty rows then paint
        signers.forEach(() => listWrap.appendChild(document.createElement('div')));
        signers.forEach((_, i) => paintSigner(i));
        refreshProgress();

        // "Send for signature" → push all 'draft' signers to 'sent'
        head.querySelector('[data-sign="send"]').addEventListener('click', () => {
          if (!canSign) { H.toast('Needs member role to send for signature', 'warn'); return; }
          let moved = 0;
          signers.forEach((s, i) => {
            if (s.status === 'draft') {
              s.status = 'sent'; moved++;
              paintSigner(i);
              H.audit.log({
                action: 'doc.sent',
                entityType: 'Document',
                entityId: docId,
                summary: `${S.user.name} sent "${docTitle}" to ${s.name} for signature via ${provider}`,
                links: [{ entityType: 'Document', entityId: docId }, { entityType: 'Person', entityId: s.email }],
                after: { signing: 'sent', provider, signer: s.email },
                module: 'vault'
              });
            }
          });
          refreshProgress();
          H.toast(moved ? `Sent to ${moved} signer${moved > 1 ? 's' : ''} via ${provider}` : 'All signers already sent', moved ? 'success' : 'info');
        });

        head.querySelector('[data-sign="remind"]').addEventListener('click', () => {
          const pending = signers.filter(s => s.status !== 'signed' && s.status !== 'draft');
          H.toast(pending.length ? `Reminder sent to ${pending.length} pending signer${pending.length > 1 ? 's' : ''}` : 'Nobody pending — all signed', pending.length ? 'info' : 'success');
        });
      }

      /* ====================================================================
         TAB SWITCHING
         ==================================================================== */
      function switchTab(name) {
        tabBar.querySelectorAll('.vault-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
        Object.keys(panes).forEach(k => panes[k].classList.toggle('on', k === name));
        // re-run count-ups for the freshly shown pane (Files KPIs)
        if (typeof H.countAll === 'function') H.countAll(panes[name]);
        else panes[name].querySelectorAll('[data-count]').forEach(n => { n.__counted = false; H.count && H.count(n); });
      }
      tabBar.querySelectorAll('.vault-tab').forEach(b =>
        b.addEventListener('click', () => switchTab(b.dataset.tab)));

      /* ── view-head actions ──────────────────────────────────────────────── */
      root.querySelector('[data-act="upload"]').addEventListener('click', () => H.toast('Drop files to upload — or pick from disk…', 'info'));
      root.querySelector('[data-act="new-folder"]').addEventListener('click', () => H.toast('New vault folder created', 'success'));
    }
  });
})();
