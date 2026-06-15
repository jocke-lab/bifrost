/* ============================================================================
   inbox.js — Inbox  (PERSONAL mailbox).
   Every conversation in one place — but for the person who is signed in.
   This module is scope:'personal', so the shell re-renders it on a user switch
   (it empties our <section> + flips rendered=false). We therefore read
   HELM.session.user FRESH at the top of render() and build that person's
   mailbox: their threads, their sender-to address, their "needs reply" queue.

   What's per-person:
     • a "Connected as {email}" Gmail chip → Integrations
     • threads addressed TO the acting user (varies by role/seat)
     • some threads flagged "Needs reply" — these conceptually feed My Day
       follow-ups (same flag the My Day "needs you" list reads).
     • the composer signs from the acting user; Send appends + toasts +
       HELM.audit.log so the reply shows up in the company audit trail.

   Keeps everything that already worked: KPI row, two-pane split list + reading
   pane, canned replies, analytics (volume bars + channel donut), the support
   tickets table and the quick-actions / CSAT strip.

   Follows the HELM module contract exactly (see command.js):
     1) HELM.register({id,label,icon,scope,render})
     2) build DOM with H.el(...) using documented .classes + .inbox-* tweaks
     3) wire every button to H.toast / H.show / H.audit.log; never bind global keys
     4) deterministic data only (H.data.*), no Math.random / no Date at eval
   ========================================================================== */
(function () {
  const H = window.HELM;
  const D = H.data;
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CHAN_ICO = { email: '✉️', chat: '💬', system: '⚙️' };

  /* ── per-person thread seeds ──────────────────────────────────────────────
     Each person sees the conversations that would land in *their* seat. Every
     thread carries `needsReply` — true ones surface as "Needs reply" pills and
     feed the My Day follow-up logic. Threads are deterministic (no clock). ── */
  function threadsFor(u) {
    const POOL = {
      // Owner / CEO — board, investors, partnerships
      'u-arvid': [
        { id: 'tk-a1', from: 'Northwind Ventures', who: 'Klara Sjöberg', email: 'klara@nwventures.se', subject: 'Term sheet — bridge round', preview: 'Hej Arvid! Vi har gått igenom siffrorna och är redo att skicka ett term sheet…', time: '4m', unread: 2, chan: 'email', tag: 'Investors', tagCls: 'info', needsReply: true,
          msgs: [ { side: 'in', name: 'Klara Sjöberg', t: '09:08', body: 'Hej Arvid! Vi har gått igenom siffrorna och är redo att skicka ett term sheet inför bryggrundan. Har du tid för ett kort samtal idag?' }, { side: 'in', name: 'Klara Sjöberg', t: '09:10', body: 'Runway på 14,2 månader ser starkt ut — bra jobbat. 👏' } ] },
        { id: 'tk-a2', from: 'Lykke Studios', who: 'Markus Holm', email: 'markus@lykke.studio', subject: 'MSA redo för signatur', preview: 'Avtalet ligger i Vault — vi väntar bara på din underskrift så är vi klara.', time: '33m', unread: 1, chan: 'email', tag: 'Legal', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Markus Holm', t: '08:41', body: 'Avtalet (MSA) ligger i Vault — vi väntar bara på din underskrift så är vi klara att sätta igång.' } ] },
        { id: 'tk-a3', from: 'Mira Lindqvist', who: 'Mira Lindqvist', email: 'mira@northwind-helm.se', subject: 'Q2 board deck — utkast', preview: 'La in de 12 slidsen. Kolla särskilt på tillväxt-narrativet innan 14:00.', time: '1h', unread: 0, chan: 'chat', tag: 'Internal', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Mira Lindqvist', t: '07:55', body: 'La in de 12 slidsen i decket. Kolla särskilt på tillväxt-narrativet innan 14:00.' }, { side: 'out', name: 'You', t: '08:02', body: 'Tack Mira! Tittar på det nu, ser bra ut vid första anblick.' } ] },
        { id: 'tk-a4', from: 'Stripe', who: 'Notiser', email: 'notifications@stripe.com', subject: 'Utbetalning $12.4K avräknad', preview: 'Din utbetalning på $12,420.00 har skickats till SEB ••4471 och bokförs i Fortnox.', time: '5h', unread: 0, chan: 'system', tag: 'Finance', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Stripe', t: '04:02', body: 'Din utbetalning på $12,420.00 har skickats till SEB ••4471 och bokförs automatiskt i Fortnox.' } ] }
      ],
      // COO — operations, hiring, cross-team
      'u-mira': [
        { id: 'tk-m1', from: 'Bolagsverket', who: 'Ärenden', email: 'no-reply@bolagsverket.se', subject: 'Begäran om komplettering', preview: 'Ärende 559123-4567: vi behöver en bekräftelse på styrelsens sammansättning.', time: '9m', unread: 1, chan: 'email', tag: 'Compliance', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Bolagsverket', t: '09:03', body: 'Ärende 559123-4567: vi behöver en bekräftelse på styrelsens sammansättning för att slutföra registreringen.' } ] },
        { id: 'tk-m2', from: 'Kai Nyström', who: 'Kai Nyström', email: 'kai@northwind-helm.se', subject: 'Budget-sign-off Midsommar', preview: 'Kampanjen är live men jag behöver ditt OK på den utökade budgeten för v.25.', time: '27m', unread: 2, chan: 'chat', tag: 'Approval', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Kai Nyström', t: '08:47', body: 'Kampanjen är live men jag behöver ditt OK på den utökade budgeten för v.25 (ROAS 3,4× hittills).' }, { side: 'in', name: 'Kai Nyström', t: '08:48', body: 'Det är +18 000 kr mot planen.' } ] },
        { id: 'tk-m3', from: 'Lena Holm', who: 'Lena Holm', email: 'lena@northwind-helm.se', subject: 'Bemanning midsommarveckan', preview: 'La in handover-planen i ops-dokumentet. Kan du dubbelkolla logistik-täckningen?', time: '1h', unread: 0, chan: 'chat', tag: 'Ops', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Lena Holm', t: '07:48', body: 'La in handover-planen i ops-dokumentet. Kan du dubbelkolla logistik-täckningen?' }, { side: 'out', name: 'You', t: '07:52', body: 'Ser bra ut — lägg till Lena som backup på logistik så är vi trygga.' } ] },
        { id: 'tk-m4', from: 'Recruitly', who: 'Kandidater', email: 'team@recruitly.io', subject: '3 nya kandidater · Säljroll', preview: 'Tre kandidater har sökt rollen Account Executive. Granska innan fredag.', time: '4h', unread: 0, chan: 'email', tag: 'Hiring', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Recruitly', t: '05:15', body: 'Tre kandidater har sökt rollen Account Executive. Granska innan fredag så bokar vi intervjuer.' } ] }
      ],
      // Finance — invoices, VAT, payouts
      'u-ola': [
        { id: 'tk-o1', from: 'Northwind AB', who: 'Eva Lindqvist', email: 'eva@northwind.se', subject: 'Faktura #2294 — fel momssats?', preview: 'Hej! Vi fick fakturan men momsen ser ut att vara 25% istället för 12%. Kan ni…', time: '2m', unread: 2, chan: 'email', tag: 'Billing', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Eva Lindqvist', t: '09:12', body: 'Hej! Vi fick fakturan men momsen ser ut att vara 25% istället för 12%. Kan ni dubbelkolla? Annars ser allt bra ut. Tack!' }, { side: 'in', name: 'Eva Lindqvist', t: '09:14', body: 'Och en sak till — kan ni skicka kvitto som PDF? 🙏' } ] },
        { id: 'tk-o2', from: 'Fortnox', who: 'Bokföring', email: 'no-reply@fortnox.se', subject: 'Momsdeklaration maj — väntar godkännande', preview: 'Period maj 2026 är klar att granska. 3 verifikat kräver din attest.', time: '40m', unread: 1, chan: 'system', tag: 'VAT', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Fortnox', t: '08:34', body: 'Momsdeklarationen för maj 2026 är klar att granska. 3 verifikat kräver din attest innan inlämning.' } ] },
        { id: 'tk-o3', from: 'Northwind Hosting AB', who: 'Fakturor', email: 'faktura@nwhosting.se', subject: 'Faktura 4 200 kr — hosting juni', preview: 'Bifogad faktura för hosting juni. Förfaller om 30 dagar.', time: '2h', unread: 0, chan: 'email', tag: 'Cost', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Northwind Hosting AB', t: '07:10', body: 'Bifogad faktura för hosting juni (4 200 kr). Förfaller om 30 dagar.' }, { side: 'out', name: 'You', t: '07:20', body: 'Tack — bokför som fast kostnad och godkänner betalning.' } ] },
        { id: 'tk-o4', from: 'Stripe', who: 'Notiser', email: 'notifications@stripe.com', subject: 'Utbetalning $12.4K avräknad', preview: 'Din utbetalning på $12,420.00 har skickats till SEB ••4471 och bokförs i Fortnox.', time: '5h', unread: 0, chan: 'system', tag: 'Finance', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Stripe', t: '04:02', body: 'Din utbetalning på $12,420.00 har skickats till SEB ••4471 och bokförs automatiskt i Fortnox.' } ] }
      ],
      // Sales — pipeline, demos, renewals
      'u-sofia': [
        { id: 'tk-s1', from: 'Halland Bryggeri', who: 'Petra Nilsson', email: 'petra@hallandbryggeri.se', subject: 'Demo-bokning + prisfråga', preview: 'Vi vill boka en demo nästa vecka. Hur ser prisbilden ut för ~40 anställda?', time: '6m', unread: 2, chan: 'email', tag: 'Lead', tagCls: 'info', needsReply: true,
          msgs: [ { side: 'in', name: 'Petra Nilsson', t: '09:06', body: 'Vi vill boka en demo nästa vecka. Hur ser prisbilden ut för ~40 anställda?' }, { side: 'in', name: 'Petra Nilsson', t: '09:07', body: 'Vi sneglar mellan er och en konkurrent, så snabbt svar uppskattas. 🙂' } ] },
        { id: 'tk-s2', from: 'Forsberg Konsult', who: 'Anna Forsberg', email: 'anna@forsbergkonsult.se', subject: 'Signerad order — tack!', preview: 'Tackar för smidig process! Ordern är signerad, ser fram emot uppstarten.', time: '52m', unread: 1, chan: 'email', tag: 'Won', tagCls: 'ok', needsReply: true,
          msgs: [ { side: 'in', name: 'Anna Forsberg', t: '08:22', body: 'Tackar för smidig process! Ordern (96 000 kr) är signerad, vi ser fram emot uppstarten.' } ] },
        { id: 'tk-s3', from: 'Malmö Retail Group', who: 'Erik Sand', email: 'erik@malmoretail.se', subject: 'Re: Uppföljning offert', preview: 'Hej Sofia, vi har inte glömt er — återkommer efter vårt styrelsemöte.', time: '1d', unread: 0, chan: 'email', tag: 'Pipeline', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Erik Sand', t: 'Igår', body: 'Hej Sofia, vi har inte glömt er — återkommer efter vårt styrelsemöte nästa vecka.' }, { side: 'out', name: 'You', t: 'Igår', body: 'Tack Erik! Hör av dig när det passar, jag finns här.' } ] },
        { id: 'tk-s4', from: 'HubSpot', who: 'Notiser', email: 'no-reply@hubspot.com', subject: 'Lead score uppdaterad', preview: '3 leads passerade tröskeln för "Sales-ready". Se dem i pipelinen.', time: '3h', unread: 0, chan: 'system', tag: 'CRM', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'HubSpot', t: '06:30', body: '3 leads passerade tröskeln för "Sales-ready". Se dem i pipelinen.' } ] }
      ],
      // Engineering — incidents, releases, infra
      'u-noah': [
        { id: 'tk-n1', from: 'Sentry', who: 'Alerts', email: 'alerts@sentry.io', subject: 'AX-12 sync · error rate spike', preview: 'Felfrekvens för AX-12 sync ökade 6× senaste timmen. Trolig rate-limit (Fortnox).', time: '3m', unread: 2, chan: 'system', tag: 'Incident', tagCls: 'bad', needsReply: true,
          msgs: [ { side: 'in', name: 'Sentry', t: '09:11', body: 'Felfrekvens för AX-12 sync ökade 6× senaste timmen. Trolig rate-limit på Fortnox-sidan, inte vår kod.' } ] },
        { id: 'tk-n2', from: 'Lena Holm', who: 'Lena Holm', email: 'lena@northwind-helm.se', subject: 'AX-12 — kan vi verifiera?', preview: 'Lagret för AX-12 stämmer inte i UI. Kan du bekräfta att fixen gått live i staging?', time: '21m', unread: 1, chan: 'chat', tag: 'Bug', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Lena Holm', t: '08:53', body: 'Lagret för AX-12 stämmer inte i UI. Kan du bekräfta att fixen gått live i staging?' } ] },
        { id: 'tk-n3', from: 'GitHub', who: 'CI', email: 'ci@github.com', subject: 'helm-web v1.8.3 — build grön', preview: 'Pipeline klar: 4 commits, alla checks gröna. Redo att tagga release.', time: '1h', unread: 0, chan: 'system', tag: 'CI', tagCls: 'ok', needsReply: false,
          msgs: [ { side: 'in', name: 'GitHub Actions', t: '07:59', body: 'Pipeline klar: 4 commits, alla checks gröna. Redo att tagga release v1.8.3.' }, { side: 'out', name: 'You', t: '08:05', body: 'Snyggt. Taggar och rullar ut efter standup.' } ] },
        { id: 'tk-n4', from: 'Vercel', who: 'Deploys', email: 'no-reply@vercel.com', subject: 'Production deploy lyckades', preview: 'helm-web v1.8.2 är live i production. Inga regressions upptäckta.', time: '6h', unread: 0, chan: 'system', tag: 'Deploy', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Vercel', t: '03:40', body: 'helm-web v1.8.2 är live i production. Inga regressions upptäckta.' } ] }
      ],
      // Ops & Logistics — stock, shipments, returns
      'u-lena': [
        { id: 'tk-l1', from: 'PostNord Support', who: 'Spårning', email: 'no-reply@postnord.se', subject: 'Order #1043 — leverans försenad', preview: 'Försändelse 73 9876 5432 1 är försenad pga väderlek i Stockholm. Nytt ETA…', time: '8m', unread: 2, chan: 'email', tag: 'Logistics', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'PostNord', t: '09:04', body: 'Försändelse 73 9876 5432 1 är försenad pga väderlek i Stockholm. Nytt ETA: imorgon 14:00. Vill ni notifiera kunden?' } ] },
        { id: 'tk-l2', from: 'Lager · Reorder', who: 'System', email: 'inventory@northwind-helm.se', subject: 'SKU AX-12 under par-nivå', preview: '8 enheter kvar, reorder-punkt 20. Skapa en inköpsorder?', time: '35m', unread: 1, chan: 'system', tag: 'Stock', tagCls: 'bad', needsReply: true,
          msgs: [ { side: 'in', name: 'Lagersystem', t: '08:39', body: 'SKU AX-12: 8 enheter kvar, reorder-punkt är 20. Skapa en inköpsorder?' } ] },
        { id: 'tk-l3', from: 'Kund · Order #0992', who: 'Johan Berg', email: 'johan@kund.se', subject: 'Retur — fel storlek', preview: 'Hej! Jag fick fel storlek och vill returnera. Hur går jag tillväga?', time: '2h', unread: 0, chan: 'email', tag: 'Return', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Johan Berg', t: '07:05', body: 'Hej! Jag fick fel storlek och vill returnera. Hur går jag tillväga?' }, { side: 'out', name: 'You', t: '07:18', body: 'Hej Johan! Inga problem — jag mailar en förbetald retursedel via PostNord nu.' } ] },
        { id: 'tk-l4', from: 'Mira Lindqvist', who: 'Mira Lindqvist', email: 'mira@northwind-helm.se', subject: 'Batch 1041–1048 — etiketter?', preview: 'PostNord-upphämtning bekräftad. Kan du dubbelkolla etiketterna innan eftermiddagen?', time: '4h', unread: 0, chan: 'chat', tag: 'Internal', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Mira Lindqvist', t: '06:40', body: 'PostNord-upphämtning bekräftad för batch 1041–1048. Kan du dubbelkolla etiketterna innan eftermiddagen?' }, { side: 'out', name: 'You', t: '06:46', body: 'Fixar det — etiketter utskrivna, batchen är staged för eftermiddagens upphämtning.' } ] }
      ],
      // Marketing — campaigns, agencies, content
      'u-kai': [
        { id: 'tk-k1', from: 'Kreativ Byrå Nord', who: 'Sara Lund', email: 'sara@byranord.se', subject: 'Midsommar — kreativ v2', preview: 'Vi har v2 av annonserna redo. Vill du ha en snabb genomgång innan vi publicerar?', time: '7m', unread: 2, chan: 'email', tag: 'Agency', tagCls: 'info', needsReply: true,
          msgs: [ { side: 'in', name: 'Sara Lund', t: '09:05', body: 'Vi har v2 av annonserna redo. Vill du ha en snabb genomgång innan vi publicerar?' }, { side: 'in', name: 'Sara Lund', t: '09:06', body: 'ROAS på v1 ligger på 3,4× — lovande!' } ] },
        { id: 'tk-k2', from: 'Mira Lindqvist', who: 'Mira Lindqvist', email: 'mira@northwind-helm.se', subject: 'Budget v.25 — godkänd?', preview: 'Jag har sett din förfrågan om +18 000 kr. Skicka en kort motivering så godkänner jag.', time: '24m', unread: 1, chan: 'chat', tag: 'Approval', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Mira Lindqvist', t: '08:50', body: 'Jag har sett din förfrågan om +18 000 kr för v.25. Skicka en kort motivering så godkänner jag.' } ] },
        { id: 'tk-k3', from: 'Meta Ads', who: 'Notiser', email: 'no-reply@facebook.com', subject: 'Kampanj · dag 2 rapport', preview: 'Midsommar-kampanjen: 142K visningar, CTR 2,1%, ROAS 3,4×. Allt rullar.', time: '3h', unread: 0, chan: 'system', tag: 'Ads', tagCls: 'ok', needsReply: false,
          msgs: [ { side: 'in', name: 'Meta Ads', t: '06:20', body: 'Midsommar-kampanjen, dag 2: 142K visningar, CTR 2,1%, ROAS 3,4×. Allt rullar enligt plan.' } ] },
        { id: 'tk-k4', from: 'Newsletter', who: 'Utkast', email: 'content@northwind-helm.se', subject: 'Juni-nyhetsbrev — utkast klart', preview: 'Utkastet till juni-nyhetsbrevet ligger klart för granskning. Deadline fredag.', time: '5h', unread: 0, chan: 'system', tag: 'Content', tagCls: '', needsReply: false,
          msgs: [ { side: 'in', name: 'Content', t: '04:30', body: 'Utkastet till juni-nyhetsbrevet ligger klart för granskning. Deadline fredag.' } ] }
      ],
      // Customer Success / viewer — tickets, onboarding
      'u-isa': [
        { id: 'tk-i1', from: 'Forsberg Konsult', who: 'Anna Forsberg', email: 'anna@forsbergkonsult.se', subject: 'Återöppnat: faktura-fråga', preview: 'Hej igen! Vi har en följdfråga om faktureringen — momsen ser fortfarande fel ut.', time: '5m', unread: 2, chan: 'email', tag: 'Support', tagCls: 'warn', needsReply: true,
          msgs: [ { side: 'in', name: 'Anna Forsberg', t: '09:07', body: 'Hej igen! Vi har en följdfråga om faktureringen — momsen ser fortfarande fel ut på #2294.' } ] },
        { id: 'tk-i2', from: 'Lykke Studios', who: 'Markus Holm', email: 'markus@lykke.studio', subject: 'Portal-onboarding klar?', preview: 'Vi accepterade inbjudan men hittar inte rapportvyn. Kan ni guida oss?', time: '29m', unread: 1, chan: 'chat', tag: 'Onboarding', tagCls: 'info', needsReply: true,
          msgs: [ { side: 'in', name: 'Markus Holm', t: '08:45', body: 'Vi accepterade portal-inbjudan men hittar inte rapportvyn. Kan ni guida oss?' } ] },
        { id: 'tk-i3', from: 'Bergström Handel', who: 'Johan Bergström', email: 'johan@bergstromhandel.se', subject: 'Tack för snabb support!', preview: 'Bara ett tack — ni löste vårt integrationsproblem på under en timme. Toppen!', time: '1d', unread: 0, chan: 'chat', tag: 'CSAT', tagCls: 'ok', needsReply: false,
          msgs: [ { side: 'in', name: 'Johan Bergström', t: 'Igår', body: 'Bara ett tack — ni löste vårt integrationsproblem på under en timme. Toppen! ⭐⭐⭐⭐⭐' }, { side: 'out', name: 'You', t: 'Igår', body: 'Vad kul att höra, Johan! Hör av dig om något mer dyker upp.' } ] },
        { id: 'tk-i4', from: 'Intercom', who: 'Notiser', email: 'no-reply@intercom.io', subject: 'CSAT veckorapport', preview: 'CSAT denna vecka: 96% på 142 svar. 2 ärenden väntar på svar.', time: '4h', unread: 0, chan: 'system', tag: 'CSAT', tagCls: 'info', needsReply: false,
          msgs: [ { side: 'in', name: 'Intercom', t: '05:00', body: 'CSAT denna vecka: 96% på 142 svar. 2 ärenden väntar på svar.' } ] }
      ]
    };

    return POOL[u.id] || [
      { id: 'tk-x1', from: 'Inkorg', who: 'System', email: 'inbox@northwind-helm.se', subject: 'Välkommen till din inkorg', preview: 'Inga meddelanden väntar på dig just nu — det här är en lugn dag.', time: 'nu', unread: 0, chan: 'system', tag: 'Inbox', tagCls: '', needsReply: false,
        msgs: [ { side: 'in', name: 'System', t: '09:00', body: 'Inga meddelanden väntar på dig just nu — det här är en lugn dag.' } ] }
    ];
  }

  /* per-person KPI numbers (deterministic, seeded on the user id) */
  function kpisFor(u) {
    const open = D.int('ib-open-' + u.id, 9, 31);
    const awaiting = threadsFor(u).filter(t => t.needsReply).length;
    const resolved = D.int('ib-res-' + u.id, 6, 22);
    const frt = D.int('ib-frt-' + u.id, 8, 22);
    return [
      { label: 'OPEN · CONVERSATIONS', count: open, fmt: 'num', trend: '+' + D.int('ib-ot-' + u.id, 2, 7), dir: 'up', spark: D.series('ib-open-s-' + u.id, 14, Math.max(4, open - 10), open, 0.18) },
      { label: 'AWAITING YOUR REPLY', count: awaiting, fmt: 'num', trend: '-' + D.int('ib-at-' + u.id, 1, 3), dir: 'down', spark: D.series('ib-await-s-' + u.id, 14, awaiting + 5, awaiting, 0.22) },
      { label: 'RESOLVED · TODAY', count: resolved, fmt: 'num', trend: '+' + D.int('ib-rt-' + u.id, 4, 9), dir: 'up', spark: D.series('ib-res-s-' + u.id, 14, Math.max(2, resolved - 12), resolved, 0.2) },
      { label: 'AVG FIRST RESPONSE', count: frt, fmt: 'num', suffix: 'M', trend: '-' + D.int('ib-ft-' + u.id, 2, 5) + 'M', dir: 'down', spark: D.series('ib-frt-s-' + u.id, 14, frt + 8, frt, 0.16) }
    ];
  }

  H.register({
    id: 'inbox',
    label: 'Inbox',
    icon: '📥',
    scope: 'personal',
    render(root) {
      /* read the acting person FRESH — the shell re-renders us on user switch */
      const u = H.session.user || (H.session.team && H.session.team[0]) || { id: 'u-arvid', name: 'There', email: 'inbox@northwind-helm.se' };
      const fname = String(u.name || 'there').trim().split(/\s+/)[0];
      const googleOn = !!(u.connections && u.connections.google);

      const THREADS = threadsFor(u);
      const needsReplyCount = THREADS.filter(t => t.needsReply).length;
      const unreadCount = THREADS.filter(t => t.unread).length;

      /* ── view head — with a "Connected as {email}" Gmail chip ─────────── */
      const head = H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📥</div>
            <div>
              <h1>Inbox</h1>
              <p>${esc(fname)}'s mailbox — every conversation addressed to you, in one place.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="inbox-gmail-chip${googleOn ? '' : ' off'}" data-act="gmail" title="${googleOn ? 'Connected via Google · open Integrations' : 'Not connected · open Integrations'}">
              <span class="inbox-gmail-ico">✉️</span>
              <span class="inbox-gmail-text">
                <span class="inbox-gmail-lbl">${googleOn ? 'Connected as' : 'Connect'}</span>
                <span class="inbox-gmail-addr">${esc(u.email || 'gmail')}</span>
              </span>
              <span class="inbox-gmail-dot ${googleOn ? 'on' : 'off'}"></span>
            </button>
            <button class="btn btn-ghost btn-sm" data-act="compose">✎ Compose</button>
            <button class="btn btn-primary btn-sm" data-act="cmdk">⌘K Triage</button>
          </div>
        </div>
      `);
      head.querySelector('[data-act="gmail"]').addEventListener('click', () => {
        H.toast(googleOn ? `Gmail kopplat som ${u.email} — öppnar Integrations` : 'Koppla Gmail i Integrations', googleOn ? 'info' : 'warn');
        H.show('integrations');
      });
      root.appendChild(head);

      /* ── KPI ROW (per-person numbers) ─────────────────────────────────── */
      const kpis = kpisFor(u);
      const krow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(v => {
        krow.appendChild(H.el(`
          <div class="card kpi inbox-kpi">
            <div class="kpi-label">${v.label}</div>
            <div class="kpi-value" data-count="${v.count}" data-fmt="${v.fmt}" ${v.suffix ? `data-suffix="${v.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${v.dir}">${v.trend}</span>
              <span class="faint" style="font-size:10px;font-family:var(--font-mono);letter-spacing:1px">14D</span>
            </div>
            <div class="spark">${H.charts.spark(v.spark)}</div>
          </div>
        `));
      });
      root.appendChild(krow);

      /* ── TWO-PANE SPLIT: conversation list | reading pane ────────────── */
      const split = H.el(`
        <div class="card flush inbox-split" style="margin-bottom:var(--gap)">
          <div class="inbox-list">
            <div class="inbox-list-head">
              <div class="inbox-tabs">
                <button class="inbox-tab active" data-filter="all">All <span class="badge">${THREADS.length}</span></button>
                <button class="inbox-tab" data-filter="unread">Unread <span class="badge bad" data-badge="unread">${unreadCount}</span></button>
                <button class="inbox-tab" data-filter="needs">Needs reply <span class="badge warn" data-badge="needs">${needsReplyCount}</span></button>
              </div>
            </div>
            <div class="inbox-list-scroll"></div>
          </div>
          <div class="inbox-read"></div>
        </div>
      `);
      const listScroll = split.querySelector('.inbox-list-scroll');
      const readPane = split.querySelector('.inbox-read');

      /* keep the Unread / Needs-reply tab counters honest as threads are
         opened, resolved or replied to — recompute live from row state so the
         badge never drifts from what the filters actually show. */
      function refreshTabBadges() {
        const rows = Array.from(split.querySelectorAll('.inbox-row'));
        const unread = rows.filter(r => r.dataset.unread === '1').length;
        const needs = rows.filter(r => r.dataset.needs === '1').length;
        const ub = split.querySelector('[data-badge="unread"]'); if (ub) ub.textContent = unread;
        const nb = split.querySelector('[data-badge="needs"]'); if (nb) nb.textContent = needs;
      }

      /* build list rows */
      THREADS.forEach((th, i) => {
        const grad = `linear-gradient(135deg, hsl(${(D.int('ib-h-' + th.id, 160, 280))} 70% 55%), hsl(${(D.int('ib-h2-' + th.id, 180, 300))} 70% 45%))`;
        const row = H.el(`
          <button class="inbox-row ${i === 0 ? 'active' : ''} ${th.unread ? 'unread' : ''}" data-id="${th.id}" data-unread="${th.unread ? 1 : 0}" data-needs="${th.needsReply ? 1 : 0}">
            <div class="inbox-av" style="background:${grad}">${esc(D.initials(th.who))}<span class="inbox-chan">${CHAN_ICO[th.chan] || '✉️'}</span></div>
            <div class="inbox-row-body">
              <div class="inbox-row-top">
                <span class="inbox-from">${esc(th.from)}</span>
                <span class="inbox-time">${esc(th.time)}</span>
              </div>
              <div class="inbox-subj">${esc(th.subject)}</div>
              <div class="inbox-prev">${esc(th.preview)}</div>
              <div class="inbox-row-foot">
                <span class="tag ${th.tagCls}">${esc(th.tag)}</span>
                ${th.needsReply ? '<span class="inbox-needs">↩ Needs reply</span>' : ''}
                ${th.unread ? `<span class="badge bad">${th.unread}</span>` : ''}
              </div>
            </div>
          </button>
        `);
        row.addEventListener('click', () => loadThread(th.id));
        listScroll.appendChild(row);
      });

      /* render a thread into the reading pane */
      function loadThread(id) {
        const th = THREADS.find(t => t.id === id);
        if (!th) return;
        // active state + clear unread badge visually
        split.querySelectorAll('.inbox-row').forEach(r => {
          const on = r.dataset.id === id;
          r.classList.toggle('active', on);
          if (on) { r.classList.remove('unread'); r.dataset.unread = '0'; const b = r.querySelector('.inbox-row-foot .badge'); if (b) b.remove(); }
        });
        refreshTabBadges();

        const grad = `linear-gradient(135deg, hsl(${(D.int('ib-h-' + th.id, 160, 280))} 70% 55%), hsl(${(D.int('ib-h2-' + th.id, 180, 300))} 70% 45%))`;
        const bubbles = th.msgs.map(m => `
          <div class="inbox-bubble ${m.side === 'out' ? 'out' : 'in'}">
            <div class="inbox-bubble-meta"><span>${esc(m.side === 'out' ? (fname || 'You') : m.name)}</span><span>${esc(m.t)}</span></div>
            <div class="inbox-bubble-body">${esc(m.body)}</div>
          </div>
        `).join('');

        readPane.innerHTML = `
          <div class="inbox-read-head">
            <div class="inbox-av lg" style="background:${grad}">${esc(D.initials(th.who))}</div>
            <div class="inbox-read-id">
              <div class="inbox-read-from">${esc(th.from)} <span class="tag ${th.tagCls}">${esc(th.tag)}</span>${th.needsReply ? '<span class="inbox-needs">↩ Needs reply</span>' : ''}</div>
              <div class="inbox-read-sub">${esc(th.who)} · ${esc(th.email)} → ${esc(u.email || '')}</div>
            </div>
            <div class="inbox-read-actions">
              <button class="btn btn-sm" data-act="snooze" title="Snooze">⏲</button>
              <button class="btn btn-sm" data-act="assign" title="Assign">👤</button>
              <button class="btn btn-sm btn-primary" data-act="resolve">✓ Resolve</button>
            </div>
          </div>
          <div class="inbox-read-subject">${esc(th.subject)}</div>
          <div class="inbox-thread">${bubbles}</div>
          <div class="inbox-reply">
            <div class="inbox-reply-chips">
              <button class="inbox-chip" data-canned="thanks">Tack-svar</button>
              <button class="inbox-chip" data-canned="refund">Återbetalning</button>
              <button class="inbox-chip" data-canned="eta">Leverans-ETA</button>
            </div>
            <textarea class="inbox-reply-box" rows="2" placeholder="Skriv ett svar till ${esc(th.from)} som ${esc(u.email || fname)}…"></textarea>
            <div class="inbox-reply-bar">
              <div class="inbox-reply-tools">
                <button class="inbox-tool" data-tool="attach" title="Bifoga">📎</button>
                <button class="inbox-tool" data-tool="emoji" title="Emoji">😊</button>
                <button class="inbox-tool" data-tool="ai" title="AI-utkast">✦</button>
              </div>
              <button class="btn btn-primary btn-sm" data-act="send">Skicka svar ➤</button>
            </div>
          </div>
        `;

        // wire reading-pane actions
        readPane.querySelector('[data-act="resolve"]').addEventListener('click', () => {
          th.needsReply = false;
          const r = split.querySelector(`.inbox-row[data-id="${th.id}"]`);
          if (r) { r.dataset.needs = '0'; const n = r.querySelector('.inbox-needs'); if (n) n.remove(); }
          const headNeeds = readPane.querySelector('.inbox-read-from .inbox-needs'); if (headNeeds) headNeeds.remove();
          refreshTabBadges();
          H.audit.log({
            action: 'thread.resolved', entityType: 'Conversation', entityId: th.id,
            summary: `${u.name} markerade "${th.subject}" från ${th.from} som löst`,
            links: [{ entityType: 'Person', entityId: u.id }], module: 'inbox'
          });
          H.toast(`${th.from} markerad som löst`, 'success');
        });
        readPane.querySelector('[data-act="snooze"]').addEventListener('click', () => H.toast('Konversationen snoozad till imorgon', 'info'));
        readPane.querySelector('[data-act="assign"]').addEventListener('click', () => H.toast('Tilldelad till support-teamet', 'info'));
        const box = readPane.querySelector('.inbox-reply-box');
        const CANNED = {
          thanks: 'Tack så mycket för att du hörde av dig! Vi uppskattar verkligen din feedback.',
          refund: 'Inga problem — vi har påbörjat en återbetalning som syns på ditt konto inom 3–5 bankdagar.',
          eta: 'Din order är på väg! Beräknad leverans via PostNord är imorgon innan 14:00.'
        };
        readPane.querySelectorAll('[data-canned]').forEach(c =>
          c.addEventListener('click', () => { box.value = CANNED[c.dataset.canned] || ''; box.focus(); H.toast('Mall infogad', 'info'); }));
        readPane.querySelector('[data-tool="ai"]').addEventListener('click', () => {
          H.toast('Copilot skriver ett utkast…', 'info');
          setTimeout(() => { box.value = `Hej ${th.who.split(' ')[0]}! Tack för ditt meddelande. `; box.focus(); H.toast('AI-utkast klart', 'success'); }, 900);
        });
        readPane.querySelector('[data-tool="attach"]').addEventListener('click', () => H.toast('Bifoga fil…', 'info'));
        readPane.querySelector('[data-tool="emoji"]').addEventListener('click', () => H.toast('Emoji-väljare', 'info'));
        readPane.querySelector('[data-act="send"]').addEventListener('click', () => {
          const text = box.value.trim();
          if (!text) { H.toast('Skriv ett meddelande först', 'warn'); return; }
          // append the reply to the thread + reflect immediately
          const now = (typeof Date !== 'undefined') ? new Date() : null;
          const t = now ? (String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')) : 'nu';
          th.msgs.push({ side: 'out', name: fname || 'You', t, body: text });
          const threadEl = readPane.querySelector('.inbox-thread');
          if (threadEl) {
            threadEl.insertAdjacentHTML('beforeend', `
              <div class="inbox-bubble out">
                <div class="inbox-bubble-meta"><span>${esc(fname || 'You')}</span><span>${esc(t)}</span></div>
                <div class="inbox-bubble-body">${esc(text)}</div>
              </div>`);
            threadEl.scrollTop = threadEl.scrollHeight;
          }
          // sending a reply clears the "needs reply" state
          if (th.needsReply) {
            th.needsReply = false;
            const r = split.querySelector(`.inbox-row[data-id="${th.id}"]`);
            if (r) { r.dataset.needs = '0'; const n = r.querySelector('.inbox-needs'); if (n) n.remove(); }
            const headNeeds = readPane.querySelector('.inbox-read-from .inbox-needs'); if (headNeeds) headNeeds.remove();
            refreshTabBadges();
          }
          box.value = '';
          H.audit.log({
            action: 'reply.sent', entityType: 'Conversation', entityId: th.id,
            summary: `${u.name} svarade ${th.from} om "${th.subject}"`,
            links: [{ entityType: 'Person', entityId: u.id }], module: 'inbox'
          });
          H.toast(`Svar skickat till ${th.from}`, 'success');
        });
      }

      loadThread(THREADS[0].id);

      // list tab filter (all / unread / needs-reply)
      split.querySelectorAll('.inbox-tab').forEach(t => t.addEventListener('click', () => {
        split.querySelectorAll('.inbox-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const f = t.dataset.filter;
        split.querySelectorAll('.inbox-row').forEach(r => {
          const show = f === 'all' ? true : f === 'unread' ? r.dataset.unread === '1' : f === 'needs' ? r.dataset.needs === '1' : true;
          r.style.display = show ? '' : 'none';
        });
      }));
      root.appendChild(split);

      /* ── ANALYTICS ROW: volume by channel (bars) + breakdown (donut) ─── */
      const months7 = D.months.slice(0, 7);
      const emailVol = D.series('ib-email-vol', 7, 90, 142, 0.14);
      const chatVol = D.series('ib-chat-vol', 7, 60, 98, 0.18);

      const arow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      arow.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📨</span> Conversation Volume</h3>
            <span class="ch-meta">EMAIL × CHAT · 7 WK</span>
          </div>
          <div class="row wrap" style="gap:14px;margin-bottom:4px">
            <span class="pill ok">● EMAIL</span>
            <span class="pill info" style="color:var(--accent3);border-color:color-mix(in srgb, var(--accent3) 30%, transparent)">● CHAT</span>
          </div>
          <div class="chart" style="height:196px">
            ${H.charts.bars(emailVol.map((v, i) => ({ label: months7[i], value: v })), { height: 196, b: chatVol })}
          </div>
        </div>
      `));

      arow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🎯</span> By Channel</h3>
            <span class="ch-meta">THIS WEEK</span>
          </div>
          <div class="chart" style="height:170px">
            ${H.charts.donut(
        [
          { label: 'Email', value: 142 },
          { label: 'Live chat', value: 98 },
          { label: 'System', value: 41 },
          { label: 'Social', value: 23 }
        ],
        { size: 170, thickness: 22, center: { value: '304', label: 'TOTAL' } }
      )}
          </div>
          <div class="mt-sm">
            <div class="stat-row"><span class="sr-label">● Email</span><span class="sr-val">142</span></div>
            <div class="stat-row"><span class="sr-label">● Live chat</span><span class="sr-val">98</span></div>
            <div class="stat-row"><span class="sr-label">● System</span><span class="sr-val">41</span></div>
            <div class="stat-row"><span class="sr-label">● Social</span><span class="sr-val">23</span></div>
          </div>
        </div>
      `));
      root.appendChild(arow);

      /* ── SUPPORT TICKETS TABLE + CANNED REPLIES / QUICK ACTIONS strip ── */
      const brow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const TICKETS = [
        ['#TK-4471', 'Fel momssats på faktura #2294', 'Northwind AB', 'High', 'warn', 'Open', 'billing'],
        ['#TK-4470', 'Aktivera 4 nya säten', 'Lykke Studios', 'Med', '', 'In progress', 'customers'],
        ['#TK-4469', 'Volymrabatt vid förnyelse', 'Forsberg Konsult', 'Low', 'ok', 'Awaiting', 'revenue'],
        ['#TK-4468', 'Leverans försenad #1043', 'PostNord', 'High', 'bad', 'Open', 'orders'],
        ['#TK-4465', 'SSO-inloggning misslyckas', 'Bergström Handel', 'Urgent', 'bad', 'Escalated', 'integrations'],
        ['#TK-4463', 'Exportera bokföring till Fortnox', 'Sjöberg Design', 'Med', '', 'Resolved', 'ledger']
      ];
      const statusCls = { 'Open': 'info', 'In progress': '', 'Awaiting': 'warn', 'Escalated': 'bad', 'Resolved': 'ok' };

      const ticketCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🎫</span> Support Tickets</h3>
            <span class="ch-meta">6 ACTIVE · 1 ESCALATED</span>
          </div>
          <div class="inbox-table-wrap">
            <table class="table inbox-tickets">
              <thead>
                <tr>
                  <th>ID</th><th>Subject</th><th>Customer</th><th>Priority</th><th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = ticketCard.querySelector('tbody');
      TICKETS.forEach(([id, subj, cust, prio, prioCls, status, route]) => {
        const tr = H.el(`
          <tr data-route="${route}">
            <td class="mono">${id}</td>
            <td>${subj}</td>
            <td class="muted">${cust}</td>
            <td><span class="pill ${prioCls}">${prio}</span></td>
            <td><span class="tag ${statusCls[status] || ''}">${status}</span></td>
          </tr>
        `);
        tr.addEventListener('click', () => H.show(route));
        tbody.appendChild(tr);
      });
      brow.appendChild(ticketCard);

      /* canned replies / quick actions strip */
      const quick = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⚡</span> Quick Actions</h3>
            <span class="ch-meta">CANNED</span>
          </div>
          <div class="inbox-quick"></div>
          <div class="section-title" style="margin-top:14px">SATISFACTION</div>
          <div class="row between">
            <div>
              <div class="big-num" style="color:var(--success)">96<span style="font-size:16px;color:var(--text-muted)">%</span></div>
              <div class="faint" style="font-size:11px">CSAT · 142 svar</div>
            </div>
            <div class="spark" style="width:120px">${H.charts.spark(D.series('ib-csat', 16, 88, 96, 0.06))}</div>
          </div>
        </div>
      `);
      const quickWrap = quick.querySelector('.inbox-quick');
      [
        ['✉️', 'Skicka faktura-PDF', 'Bifoga från Fortnox', 'success', 'Faktura-PDF köad'],
        ['💳', 'Återbetala order', 'Stripe · refund flow', 'info', 'Återbetalning startad'],
        ['📦', 'Spåra leverans', 'PostNord / DHL', 'info', 'Spårning öppnad'],
        ['🔀', 'Tilldela kollega', 'Routa till rätt team', 'info', 'Konversation tilldelad'],
        ['✦', 'AI-sammanfatta tråd', 'Copilot TL;DR', 'info', 'Copilot sammanfattar…']
      ].forEach(([ico, title, sub, type, msg]) => {
        const b = H.el(`
          <button class="inbox-action">
            <span class="inbox-action-ico">${ico}</span>
            <span class="inbox-action-body"><span class="inbox-action-title">${title}</span><span class="inbox-action-sub">${sub}</span></span>
            <span class="inbox-action-go">➤</span>
          </button>
        `);
        b.addEventListener('click', () => H.toast(msg, type));
        quickWrap.appendChild(b);
      });
      brow.appendChild(quick);
      root.appendChild(brow);

      /* ── wire view-head actions ──────────────────────────────────────── */
      root.querySelector('[data-act="cmdk"]').addEventListener('click', () => H.openCmdk());
      root.querySelector('[data-act="compose"]').addEventListener('click', () => H.toast('Nytt meddelande — väljer mottagare…', 'info'));

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });
})();
