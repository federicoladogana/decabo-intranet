# DECABO — guida all'installazione

Portale interno (procedure, strumenti, rubrica collegamenti, tabella PC) ospitato gratis su Netlify, con salvataggio in tempo reale su Firebase.

Nessun comando da programmatore richiesto: solo click su due siti web (Firebase e Netlify).

## 1. Crea il progetto Firebase (gratis)

1. Vai su **console.firebase.google.com** e accedi con un account Google
2. **Aggiungi progetto** → dagli un nome (es. "decabo-intranet") → puoi disattivare Google Analytics (non serve) → **Crea progetto**
3. Nel menu a sinistra, apri **Build → Firestore Database** → **Crea database** → scegli una località vicina (es. `eur3 (europe-west)`) → avvia in **modalità produzione**
4. Sempre nel menu a sinistra, **Build → Storage** → **Inizia** → stessa località → modalità produzione
5. **Build → Authentication** → **Inizia** → scheda "Sign-in method" → attiva **Anonimo** (serve solo per distinguere "chi ha aperto la pagina" da un bot esterno, l'utente non se ne accorge, non chiede login)

### Collega la pagina web al progetto

6. Icona a forma di **ingranaggio** (in alto a sinistra) → **Impostazioni progetto**
7. In basso, sezione "Le tue app" → icona **`</>`** (Web) → dagli un nome (es. "decabo-web") → **Registra app**
8. Ti mostra un blocco di codice `firebaseConfig = { apiKey: ..., ... }` — **copia questi valori**
9. Apri il file **`firebase-config.js`** (in questa cartella) e incolla i valori al posto dei segnaposto `INCOLLA_QUI_...`

### Imposta le regole di sicurezza

10. Torna su **Firestore Database → Regole** (scheda in alto) → cancella il contenuto e incolla quello del file **`firestore.rules`** (in questa cartella) → **Pubblica**
11. Vai su **Storage → Regole** → stessa cosa con il contenuto di **`storage.rules`** → **Pubblica**

## 2. Metti il codice su GitHub

1. Su github.com, crea un **nuovo repository** (es. "decabo-intranet"), anche privato
2. Carica tutti i file di questa cartella (tranne `README.md` se vuoi, ma va bene anche con) — puoi trascinarli nella pagina "Upload files" di GitHub direttamente dal browser, non serve la riga di comando

## 3. Pubblica su Netlify (gratis)

1. Vai su **app.netlify.com** → **Add new site → Import an existing project**
2. Scegli **GitHub** e autorizza l'accesso, poi seleziona il repository appena creato
3. Lascia le impostazioni di build vuote/di default (il sito è già statico, non serve compilare nulla) → **Deploy**
4. Dopo un minuto avrai un indirizzo tipo `nome-a-caso.netlify.app` — funzionante e già collegato a Firebase
5. (Facoltativo) Da **Site settings → Domain management** puoi cambiare il nome in qualcosa tipo `decabo.netlify.app`, oppure collegare un dominio tuo se un giorno lo acquisti

Da questo momento, ogni volta che aggiorni i file su GitHub, Netlify ripubblica automaticamente il sito.

## Come funziona il salvataggio

- Ogni modifica (testo, file caricati, nuove righe) viene scritta subito su Firestore/Storage e arriva in tempo reale a chiunque abbia la pagina aperta — niente più problemi di "si perde al ricaricamento"
- Il lucchetto ⚙ con password **0079** resta un filtro solo visivo per evitare click accidentali: chiunque conosca l'indirizzo del sito può leggere i contenuti (è pensato per un'intranet aziendale, non per dati sensibili)
- I file caricati (immagini nelle procedure, PDF, Excel, Word) vanno su Firebase Storage: fino a **15 MB** per i PDF nelle procedure, **25 MB** per i file nella Rubrica collegamenti, **8 MB** per le immagini inserite nel testo

## Limiti del piano gratuito Firebase (piano "Spark")

Per un uso interno con poche decine di persone resti ampiamente dentro i limiti gratuiti:
- Firestore: 1 GB di dati, 50.000 letture e 20.000 scritture al giorno
- Storage: 5 GB totali, 1 GB di download al giorno

Se un giorno li superate, Firebase semplicemente smette di rispondere finché non passate al piano a consumo (Blaze) — non addebita nulla automaticamente.
