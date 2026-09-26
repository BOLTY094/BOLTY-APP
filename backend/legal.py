"""Public legal pages (Privacy Policy, Termini) served as HTML over HTTPS at /api/legal/*.

Company details are read from env so they can be completed without code changes:
LEGAL_COMPANY_NAME, LEGAL_COMPANY_ADDRESS, LEGAL_VAT, LEGAL_PRIVACY_EMAIL, SUPPORT_EMAIL.
"""
import os
from html import escape

APP = "Bolty"
LAST_UPDATE = "26 settembre 2026"


def _v(key: str, default: str) -> str:
    return escape(os.environ.get(key, "").strip() or default)


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} · {APP}</title>
<style>
 body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#16213E;margin:0;padding:24px;line-height:1.55}}
 main{{max-width:760px;margin:0 auto}} h1{{font-size:28px;margin:8px 0 4px}} h2{{font-size:18px;margin:28px 0 8px}} h3{{font-size:15px;margin:18px 0 6px}}
 .brand{{display:flex;align-items:center;gap:10px;margin-bottom:24px}} .bolt{{width:34px;height:34px;border-radius:17px;background:#F5CE3E;display:inline-flex;align-items:center;justify-content:center;font-size:20px}}
 .muted{{color:#6B7185;font-size:14px}} table{{border-collapse:collapse;width:100%;font-size:14px}} td,th{{border:1px solid #E9EBF1;padding:8px;text-align:left;vertical-align:top}} th{{background:#F4F5F9}}
 .todo{{background:#FDF3CE;border-radius:6px;padding:2px 6px}} nav a{{color:#16213E;margin-right:14px}} footer{{margin-top:40px;font-size:13px;color:#6B7185;border-top:1px solid #E9EBF1;padding-top:16px}}
</style></head><body><main>
<div class="brand"><span class="bolt">⚡</span><strong style="font-size:22px">bolty</strong></div>
<nav><a href="/api/legal/privacy">Privacy Policy</a><a href="/api/legal/terms">Termini di servizio</a><a href="/api/legal/support">Assistenza</a></nav>
{body}
<footer>{APP} · Ultimo aggiornamento: {LAST_UPDATE}</footer>
</main></body></html>"""


def privacy_html() -> str:
    company = _v("LEGAL_COMPANY_NAME", "Bolty S.r.l.")
    address = _v("LEGAL_COMPANY_ADDRESS", "<span class=\"todo\">[indirizzo sede legale da completare]</span>")
    vat = _v("LEGAL_VAT", "<span class=\"todo\">[P.IVA / C.F. da completare]</span>")
    privacy_email = _v("LEGAL_PRIVACY_EMAIL", os.environ.get("SUPPORT_EMAIL", "privacy@bolty.it"))
    support_email = _v("SUPPORT_EMAIL", "assistenza@bolty.it")
    body = f"""
<h1>Informativa sulla privacy</h1>
<p class="muted">Informativa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003.</p>

<h2>1. Titolare del trattamento</h2>
<p><strong>{company}</strong><br>{address}<br>{vat}<br>Email privacy: <a href="mailto:{privacy_email}">{privacy_email}</a></p>

<h2>2. Quali dati trattiamo</h2>
<table>
<tr><th>Categoria</th><th>Esempi</th><th>Origine</th></tr>
<tr><td>Dati identificativi e di contatto</td><td>Nome, cognome, email, telefono</td><td>Forniti da te alla registrazione o nella richiesta contratto</td></tr>
<tr><td>Dati di accesso</td><td>Password (memorizzata solo in forma cifrata), identificativi Google / Apple (Sign in with Apple, anche con email privata "Hide My Email")</td><td>Forniti da te / dal provider di accesso scelto</td></tr>
<tr><td>Bollette e documenti</td><td>File PDF o foto delle bollette caricate, dati estratti (fornitore, importi, consumi, POD/PDR, indirizzo di fornitura)</td><td>Caricati da te</td></tr>
<tr><td>Dati contrattuali</td><td>Codice fiscale, indirizzo, POD/PDR, firma grafometrica facoltativa, offerta accettata</td><td>Forniti da te al momento della richiesta di attivazione</td></tr>
<tr><td>Dati di utilizzo</td><td>Notifiche in-app, codice invito e amici invitati del programma "Invita un amico", registri tecnici (log) del server</td><td>Generati dall'uso dell'app</td></tr>
</table>
<p>Non trattiamo categorie particolari di dati (art. 9 GDPR) e non effettuiamo profilazione con effetti giuridici. Non utilizziamo SDK pubblicitari né strumenti di tracciamento cross-app.</p>

<h2>3. Finalità e basi giuridiche</h2>
<table>
<tr><th>Finalità</th><th>Base giuridica</th></tr>
<tr><td>Creazione e gestione dell'account, autenticazione</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
<tr><td>Analisi della bolletta e confronto con le offerte disponibili</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
<tr><td>Gestione della richiesta di attivazione di un'offerta e trasmissione dei dati al fornitore scelto</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
<tr><td>Invio di notifiche e email di servizio (bolletta ricevuta, offerta pronta, stato pratica)</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
<tr><td>Programma "Invita un amico"</td><td>Esecuzione del contratto (art. 6.1.b)</td></tr>
<tr><td>Assistenza clienti</td><td>Esecuzione del contratto / legittimo interesse (art. 6.1.b, 6.1.f)</td></tr>
<tr><td>Sicurezza, prevenzione abusi, adempimenti fiscali e legali</td><td>Obbligo legale / legittimo interesse (art. 6.1.c, 6.1.f)</td></tr>
</table>

<h2>4. Destinatari e responsabili del trattamento</h2>
<ul>
<li><strong>Fornitori di energia e telefonia</strong> di cui richiedi l'attivazione: ricevono i dati necessari al contratto.</li>
<li><strong>Consulenti Bolty</strong> (personale autorizzato) che verificano le bollette e propongono le offerte.</li>
<li><strong>Fornitori tecnici</strong> (responsabili ex art. 28 GDPR): hosting e database, archiviazione cifrata dei file (object storage), servizio di invio email, provider di autenticazione (Google, Apple).</li>
</ul>
<p>I dati non vengono venduti né ceduti a terzi per finalità di marketing.</p>

<h2>5. Trasferimenti extra-UE</h2>
<p>Alcuni fornitori tecnici possono trattare dati al di fuori dell'Unione Europea. In tal caso il trasferimento avviene sulla base di decisioni di adeguatezza o delle Clausole Contrattuali Standard approvate dalla Commissione Europea.</p>

<h2>6. Periodo di conservazione</h2>
<ul>
<li>Dati dell'account e bollette: per tutta la durata dell'account e fino alla richiesta di eliminazione.</li>
<li>Dati contrattuali: 10 anni dalla conclusione della pratica, per obblighi fiscali e di difesa in giudizio.</li>
<li>Log tecnici: fino a 12 mesi.</li>
</ul>

<h2>7. I tuoi diritti</h2>
<p>Puoi esercitare in qualsiasi momento i diritti di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione (artt. 15-22 GDPR) scrivendo a <a href="mailto:{privacy_email}">{privacy_email}</a>. Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it">www.garanteprivacy.it</a>).</p>

<h2>8. Eliminazione dell'account</h2>
<p>Puoi eliminare il tuo account direttamente dall'app: <em>Profilo → Elimina account</em>. L'eliminazione rimuove in modo definitivo account, sessioni, bollette e file caricati, offerte, notifiche e dati del programma invito. Per gli accessi con Apple viene inoltre revocato il collegamento con l'Apple ID. I dati contrattuali relativi a pratiche già concluse possono essere conservati per il periodo indicato al punto 6, in forma limitata e per soli obblighi di legge. In alternativa puoi richiedere l'eliminazione scrivendo a <a href="mailto:{support_email}">{support_email}</a>.</p>

<h2>9. Sicurezza</h2>
<p>Tutte le comunicazioni avvengono tramite HTTPS/TLS. Le password sono memorizzate con algoritmi di hashing sicuri; i file delle bollette sono archiviati in uno storage protetto e accessibili solo all'utente e al personale autorizzato.</p>

<h2>10. Minori</h2>
<p>Il servizio è rivolto a persone maggiorenni. Non raccogliamo consapevolmente dati di minori di 18 anni.</p>

<h2>11. Modifiche</h2>
<p>Questa informativa può essere aggiornata. La versione in vigore è sempre disponibile a questo indirizzo, con la data dell'ultimo aggiornamento.</p>
"""
    return _page("Privacy Policy", body)


def terms_html() -> str:
    company = _v("LEGAL_COMPANY_NAME", "Bolty S.r.l.")
    support_email = _v("SUPPORT_EMAIL", "assistenza@bolty.it")
    body = f"""
<h1>Termini e condizioni di servizio</h1>
<p class="muted">Condizioni generali di utilizzo dell'app {APP}, fornita da {company}.</p>

<h2>1. Oggetto del servizio</h2>
<p>{APP} consente di caricare le proprie bollette di luce, gas e telefonia, ricevere un'analisi dei costi, confrontare le offerte proposte dai consulenti Bolty e richiedere l'attivazione dell'offerta scelta. {APP} agisce come intermediario: il contratto di fornitura è concluso tra l'utente e il fornitore selezionato.</p>

<h2>2. Registrazione</h2>
<p>Per usare il servizio è necessario un account (email e password, Google o Apple). L'utente garantisce la veridicità dei dati forniti ed è responsabile della custodia delle credenziali.</p>

<h2>3. Analisi e offerte</h2>
<p>Le analisi e i risparmi stimati hanno valore indicativo e si basano sui dati della bolletta caricata e sulle condizioni delle offerte al momento della proposta. Il risparmio effettivo dipende dai consumi reali e dall'andamento dei prezzi di mercato.</p>

<h2>4. Richiesta di attivazione e diritto di ripensamento</h2>
<p>Inviando una richiesta di attivazione, l'utente autorizza {APP} a trasmettere i propri dati al fornitore scelto per la conclusione del contratto. Ai sensi del Codice del Consumo (D.Lgs. 206/2005) l'utente può esercitare il diritto di ripensamento entro 14 giorni dalla conclusione del contratto di fornitura, senza penali, contattando <a href="mailto:{support_email}">{support_email}</a>.</p>

<h2>5. Programma "Invita un amico"</h2>
<p>Ogni utente dispone di un codice invito con cui può invitare amici a provare {APP} e regalare loro l'esperienza di risparmiare sulle proprie fatture. Il programma non prevede pagamenti né premi in denaro. Sono esclusi auto-inviti, account duplicati e utilizzi fraudolenti. {APP} può modificare o sospendere il programma con preavviso.</p>

<h2>6. Costi</h2>
<p>L'utilizzo dell'app è gratuito per l'utente. Non sono previsti acquisti in-app.</p>

<h2>7. Responsabilità</h2>
<p>{APP} non è responsabile di interruzioni del servizio dovute a cause di forza maggiore, né delle condizioni economiche e contrattuali applicate dai fornitori terzi.</p>

<h2>8. Eliminazione dell'account</h2>
<p>L'utente può eliminare il proprio account in qualsiasi momento dall'app (Profilo → Elimina account). Vedi la <a href="/api/legal/privacy">Privacy Policy</a> per i dettagli sui dati eliminati e conservati.</p>

<h2>9. Legge applicabile</h2>
<p>I presenti termini sono regolati dalla legge italiana. Per i consumatori è competente il foro del luogo di residenza o domicilio.</p>

<h2>10. Contatti</h2>
<p>Per assistenza: <a href="mailto:{support_email}">{support_email}</a></p>
"""
    return _page("Termini di servizio", body)


def support_html() -> str:
    support_email = _v("SUPPORT_EMAIL", "assistenza@bolty.it")
    body = f"""
<h1>Assistenza {APP}</h1>
<p>Hai bisogno di aiuto con una bolletta, un'offerta o il tuo account? Scrivici: rispondiamo entro 2 giorni lavorativi.</p>
<p><a href="mailto:{support_email}" style="display:inline-block;background:#16213E;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Scrivi a {support_email}</a></p>
<h2>Domande frequenti</h2>
<h3>Come carico una bolletta?</h3><p>Dalla Home tocca "Analizza la mia bolletta" e scegli una foto o un PDF.</p>
<h3>Quanto tempo serve per ricevere un'offerta?</h3><p>Un consulente analizza la bolletta e propone un'offerta di norma entro 24-48 ore.</p>
<h3>Come elimino il mio account?</h3><p>Apri Profilo → Elimina account. L'operazione è definitiva.</p>
"""
    return _page("Assistenza", body)
