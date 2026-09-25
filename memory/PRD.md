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
