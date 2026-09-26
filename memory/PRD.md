# Bolty — PRD

## Problem Statement
Piattaforma mobile dove il cliente carica la bolletta (luce/gas/telefonia), riceve un'analisi della spesa attuale e un confronto con un'offerta preparata dall'amministratore. Percorso guidato: carica → analisi → offerta (controllata dall'admin) → accetta → raccolta dati → contratto/firma → stato pratica. Design moderno, mobile-first, grandi pulsanti, pochissimo testo.

## Architecture
- **Frontend**: Expo Router (React Native), react-query, react-native-keyboard-controller, phosphor icons, expo-image/linear-gradient/reanimated. Tema brand (giallo #F5CE3E + blu navy #16213E, sfondo crema) in `src/theme.ts`. Font Plus Jakarta Sans (expo-font, remoto).
- **Backend**: FastAPI (`/api`), MongoDB (motor). Auth JWT (email/password) + Emergent Google session. Object Storage Emergent per file bollette. Email transazionali via Emergent Resend + notifiche in-app.
- **Integrazioni**: Emergent Google Auth, Emergent Object Storage, Emergent Resend.

## User Personas
1. **Cliente**: carica bollette, vede analisi, riceve offerte, accetta e firma, segue lo stato pratica.
2. **Amministratore** (account fisso): rivede le bollette, propone offerte, gestisce i contratti, monitora le statistiche.

## Core Requirements (static)
- Upload PDF/foto + estrazione dati (simulata/manuale, correggibile).
- Analisi: spesa attuale, stima annua, consumo annuo, costo medio, risparmio possibile.
- Modulo confronto offerte controllato dall'admin (situazione attuale X, proposta Y, risparmio Z/anno).
- Raccolta dati cliente (nome, cognome, CF, telefono, email, indirizzo, POD/PDR).
- Contratto: condizioni, accettazione, firma digitale, conferma.
- Aree cliente (forniture, bollette, offerte) e admin (dashboard, da analizzare, contratti, statistiche).
- Notifiche: bolletta ricevuta, analisi completata, nuova offerta, contratto completato, aggiornamento pratica.

## Implemented (2026-06)
- [x] Auth email/password (JWT) + Google (Emergent) + ruolo admin fisso (seed idempotente).
- [x] Home guidata: logo Bolty, claim, CTA "Analizza la mia bolletta", categorie Luce/Gas/Telefonia.
- [x] Upload bolletta (camera/galleria/PDF) con permessi, storage Emergent, animazione scansione.
- [x] Bill detail: banner "Abbiamo analizzato la tua bolletta", analisi, dati estratti correggibili, conferma.
- [x] Offerta cliente: confronto attuale vs proposta + risparmio annuo + "Voglio questa offerta".
- [x] Contratto multi-step: dati cliente → condizioni + firma digitale → conferma; timeline stato pratica.
- [x] Area cliente tabs: Home, Forniture, Bollette (storico + filtri + carica), Offerte.
- [x] Area admin: Dashboard (statistiche + valore generato), Da analizzare, Bill detail + proponi offerta, Contratti + aggiornamento stato.
- [x] Notifiche in-app + email (Resend) su tutti gli eventi chiave.
- [x] Invita e Guadagna: codice invito per ogni cliente, campo codice in registrazione, premio (€20 configurabile) al referrer quando l'amico attiva un'offerta, schermata dedicata con stats e storico premi.
- [x] Testing: 8/8 backend pytest + flussi frontend validati.

## Backlog (prioritized)
- **P1**: Estrazione dati reale da PDF/foto con AI (OCR + LLM) al posto della simulazione.
- **P1**: E2E UI test del form contratto (campi + accettazione + firma + submit).
- **P2**: Campi raccolta dati configurabili dall'admin.
- **P2**: Filtri/ricerca nella coda admin; export contratti.
- **P2**: Notifiche push (richiede build nativa).
- **P2**: Dark mode.

## Next Tasks
- Valutare integrazione AI per estrazione automatica dei dati bolletta.
- Aggiungere gestione offerte multiple per bolletta e cronologia proposte.

## Iterazione 3 — Restyling bianco, Welcome animato, Andamento mercato (Giu 2026)
- Tema: sfondo puro bianco (#FFFFFF), bordi/divider grigio-azzurro chiaro; logo convertito in PNG con sfondo trasparente (`assets/images/bolty-logo.png`) + ritaglio mascotte (`bolty-bolt.png`).
- Welcome animato (`app/welcome.tsx`): mostrato SOLO dopo login/registrazione (flag `welcomePending` in auth-context), bolt con bounce/wiggle + alone pulsante, poi redirect automatico a Home (cliente `/(tabs)`, admin `/(admin)`) dopo ~2.4s.
- Home: hero brand navy/giallo con mascotte (rimossa foto stock); nuova card "Andamento energia e gas" (`home-market`) con mini-stat PUN/PSV → schermata `app/market.tsx` (tab Luce/Gas, grafico a barre 12 mesi SVG, delta mese/anno, "Per la tua casa", 3 consigli, fonti).
- Backend: `GET /api/market/overview` (auth) — dati curati indicativi (PUN/PSV medie mensili Giu25→Mag26). Scelta utente: dati indicativi, non feed live.
- Fix: redirect cliente da `/` (segments vuoto) → `/(tabs)` in `_layout.tsx`.
- Test: iteration_3 — 25/25 pytest (4 nuovi in `tests/test_market.py`), flussi frontend verificati.

## Iterazione 4 — Dati reali di mercato (Set 2026)
- Scelta utente: fonti pubbliche gratuite senza chiavi; grafico ultimi 12 mesi.
- Nuovo modulo `backend/market.py`: Luce = media mensile prezzo day-ahead zona IT-North (Energy-Charts / SMARD, CC BY 4.0, riferimento PUN, con "mese in corso"); Gas = tabella ARERA CMEM,m (media mensile ufficiale PSV, €/MWh e €/Smc).
- Cache Mongo `market_data` (TTL 24h), loop background ogni 6h avviato allo startup, fallback a serie indicative se fonte irraggiungibile e nessuna cache. Insight generati dinamicamente dai trend.
- Endpoint: `GET /api/market/overview` (auth), `POST /api/admin/market/refresh` (admin, forza aggiornamento).
- Frontend `market.tsx`: etichetta fonte, tag mese di riferimento, riga "mese in corso" (luce), costo materia prima €/kWh–€/Smc, badge "Dati reali aggiornati il…", fonti. Home card mostra mese di riferimento.
- Test iteration_4: 33/33 pytest, UI verificata.

## Iterazione 5-6 — Conformità App Store (Set 2026) · v1.1.0 (build 2)
- Eliminazione account: tab Profilo → "Elimina account" → schermata di conferma (`app/delete-account.tsx`, checkbox + dialog) → `DELETE /api/auth/me` (clienti; admin 403) cancella utente, sessioni, bollette + file (object storage non ha DELETE: il file viene sovrascritto a 0 byte), offerte, contratti, notifiche, premi, richieste assistenza; referral degli altri utenti scollegati; logout automatico. Apple: il backend riceve `authorization_code`, scambia/salva refresh token e revoca alla cancellazione SOLO se configurati `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (altrimenti skip, `apple_revoked=false`).
- Pagine legali pubbliche HTTPS servite dal backend (`backend/legal.py`): `/api/legal/privacy`, `/api/legal/terms`, `/api/legal/support`; dati azienda via env `LEGAL_COMPANY_NAME/ADDRESS/VAT/PRIVACY_EMAIL`. Link in login, registrazione, contratto (checkbox), Profilo.
- Assistenza (`app/support.tsx`): email `SUPPORT_EMAIL` (mailto) + modulo in-app `POST /api/support` (salva in `support_requests`, email a supporto e conferma all'utente) + FAQ.
- app.json: version 1.1.0, ios.buildNumber "2", android.versionCode 2, `usesNonExemptEncryption:false`, `ios.privacyManifests` (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1 + dati raccolti), splash `#FFFFFF`.
- Font Plus Jakarta Sans bundlati in `assets/fonts` (niente CDN).
- Bug fix: crash OfferDetail (`Circle` → `CircleIcon` phosphor 3.x); toast `pointerEvents` in style.
- Test: iteration_5 (47/47 pytest + UI) e iteration_6 (retest flusso offerta→contratto OK).
- Da completare dal cliente: email assistenza reale, dati societari nelle pagine legali, credenziali Apple per revoca token (opzionale), test su iPhone reale.

## Iterazione 7-8 — Email admin con bolletta originale allegata + referral senza premi (Set 2026)
- Su upload: sha256 del file, verifica che la copia in storage sia byte-identica (altrimenti 502), campi `file_size`/`file_sha256`. Email a `ADMIN_NOTIFY_EMAIL` (env, = amministrazioneverbagroup@gmail.com) con il FILE ORIGINALE allegato (base64, nome originale sanificato o `Bolletta_<Fornitore>.<ext>`, max 25 MB) + link sicuro a scadenza (`/api/files/{path}?token=` JWT scope=file, 7 gg). `send_email` supporta `attachments`.
- Cliente: email "Bolletta ricevuta" senza allegato (privacy); nel dettaglio bolletta pulsante "Apri il file originale".
- Email service blocca destinatari finti (*@test.it) con 422 — usare delivered@resend.dev nei test.
- Referral: rimossi "Invita e Guadagna" e €20 ovunque (home, referral, profilo, delete-account, legal, notifiche backend). Nuovo messaggio: "Invita un amico e regalagli l'esperienza di risparmiare sulle sue fatture." `REFERRAL_REWARD` default 0; il record di attivazione resta (conteggio Attivati).
- Test iteration_7 (61/61) e iteration_8 (77/77 + UI).

## Iterazione 9 — Occhiolino, estrazione reale, richiesta contatto, News (Set 2026)
- Welcome: fulmine con occhiolino animato (frame `bolty-bolt-open.png` occhi aperti + overlay `bolty-bolt.png` con opacità 0→1→0→1), durata 3s.
- Estrazione reale (`backend/extraction.py`): PDF → testo (pdfplumber); PDF scansionato/foto → immagini (pypdfium2/PIL) → modello vision. LLM GPT-5.4 via EMERGENT_LLM_KEY (`EXTRACTION_MODEL` env) restituisce SOLO fornitore, intestatario, tipo_intestatario, codice_fiscale, partita_iva; con testo disponibile ogni valore è verificato letteralmente nel documento altrimenti null → UI "Non rilevato". Nessuna stima: `analysis=null`, rimossi simulate_extraction/compute_analysis, "Correggi" limitato ai 4 campi. Test Duferco reale: Duferco Energia SpA / VERBA GROUP SRLS / 04137230928.
- Richiesta contatto (`src/components/contact-request.tsx`, `POST /api/bills/{id}/contact`): email e/o telefono (validati), consenso obbligatorio con informativa + link privacy; salvato in `bill.contact_request`, email all'admin con dati bolletta + link file, notifica in-app; visibile nel dettaglio admin.
- News (`backend/news.py`): feed RSS QualEnergia, Canale Energia, Rinnovabili.it (energia), ANSA Economia e Sole 24 Ore (filtrati per keyword energia); dedupe per link in `news`, refresh ogni 3 giorni (loop 6h), `GET /api/news` paginato, `POST /api/admin/news/refresh`; schermata `/news` + card Home.
- Test iteration_9: 99/99 pytest + UI verificata.

## Iterazione 10 — Pannello ADMIN (Set 2026)
- Backend `backend/admin_panel.py` (router /api/admin, tutte le rotte con `get_admin_user` → 401/403): `stats`, `bills/search` (q su nome/ragione sociale/email/telefono/fornitore/CF/PIVA/stato/data + filtri nuove/da_analizzare/da_contattare/contattati/conclusi + intervallo date), `users`, `users/{id}` (storico/timeline), `contacts` + `PUT contacts/{bill_id}/status` (nuovo/da_contattare/contattato/in_lavorazione/concluso, nota), `referrals`, `notifications` (+read), `audit`. Notifiche admin (`admin_notifications`) create su upload e richiesta contatto; audit (`admin_audit`) per view_user, contact_status, open_file. Stato iniziale richiesta contatto = "nuovo".
- Frontend `(admin)/_layout.tsx`: sidebar ≥900px / menu a chip su telefono; schermate Dashboard (auto-refresh 20s), Bollette, Da analizzare, Clienti (+ `admin/user/[id]`), Richieste di contatto, Contratti, Referral, News (+Aggiorna ora), Notifiche, Impostazioni (registro operazioni, logout). Componenti condivisi `src/components/admin-ui.tsx`. Dettaglio bolletta admin con "Apri il file originale" (Bearer, nessun URL pubblico permanente).
- Test iteration_10: 34 nuovi test admin + 123 regressione, UI verificata desktop e mobile.
