# Piano di test manuali — estensione YouTube per Gopeed

Versione di riferimento: `manifest.json` 2.1.0. Stato iniziale: **nessun trasferimento multimediale completo verificato nell'app Gopeed**. I 45 test automatici, build, lint, prova del motore Goja e lettura online della playlist campione sono documentati in [VALIDATION.md](VALIDATION.md), ma non sostituiscono queste prove. Segnare le caselle solo dopo aver osservato il risultato. Questo documento è anche il registro per i test prima di una pubblicazione ufficiale; lo sviluppo resta in pausa finché non arrivano esiti concreti.

## Come registrare una prova

Per ogni ID annotare **PASS / FAIL / BLOCCATO / NON APPLICABILE / DA FARE**, data, versione esatta di Gopeed e dell'estensione, piattaforma (e versione Android, se pertinente), tipo di connessione, URL pubblico, impostazioni, file prodotti, risultato osservato ed eventuale errore. Se FAIL, specificare in quale fase: riconoscimento link, elenco pre-download, avvio, progresso, merge, file finale o riproduzione. Ripetere dopo una modifica usando lo stesso ID. Non inserire cookie, token, URL firmati dei flussi o informazioni dell'account nei report/log condivisi.

Priorità: **P0** = impedisce l'uso principale o crea file sbagliati; **P1** = funzione promessa o caso importante; **P2** = compatibilità e robustezza aggiuntiva. Le caselle sotto sono tutte inizialmente non verificate.

### Preparazione e percorso breve (eseguire per primi)

1. Usare Gopeed **2.0.0-beta.3 o successivo** e annotare la versione esatta; installare il fork dall'URL `https://github.com/Waph1/gopeed-extension-youtube-V1`. Disattivare altre estensioni YouTube; disporre di spazio libero, connessione stabile e un video pubblico che si può scaricare legittimamente.
2. Impostare `Download Mode = Video + audio`, `Video Quality = 720p`, `Audio Quality = Highest`, `Choose Quality On Download = off`, cookie vuoto. Scaricare un video pubblico breve. Aprire il **file finito**, controllare immagine, suono, durata e risoluzione. Annotare se l'app dispone delle funzionalità WebView/FFmpeg richieste.
3. Ripetere con `Audio only`, prima M4A poi WebM, e aprire entrambi i file.
4. Attivare `Choose Quality On Download`: nella lista preselezionata deselezionare **tutto**, spuntare **una** variante e controllare che arrivi **un solo** file.
5. Aprire `https://youtube.com/playlist?list=OLAK5uy_m7WK0j-v1eLCguUDonKUjJs7Rjza-6lKg`, selezionare i due brani, completare entrambi i download e ascoltarli. Una lista corretta, da sola, non significa che i file siano stati scaricati.

Se un punto fallisce, fermarsi e inviare l'ID, i dati diagnostici sotto e i passaggi esatti: risolvere prima i P0 evita di moltiplicare prove inconcludenti.

## Installazione, riconoscimento e compatibilità

| ID | Pr. | Prova | Esito atteso |
| --- | --- | --- | --- |
| B01 | P0 | Installazione pulita dal fork; riavvio di Gopeed. | Estensione installata/attiva con autore `Waph1` e impostazioni visibili. |
| B02 | P0 | Provare un link `https://www.youtube.com/watch?v=...` di video pubblico breve. | Gopeed riconosce la URL, mostra metadati corretti, crea e completa il task. |
| B03 | P0 | Ripetere in modalità predefinita `Video + audio`. | Un MP4 riproducibile con audio e video sincronizzati; nessun file vuoto/temporaneo scambiato per finale. |
| B04 | P1 | Aggiornare l'estensione dal fork e riaprire le impostazioni. | Versione attesa; impostazioni persistenti e download funzionante. |
| B05 | P1 | Installazione con precedente estensione YouTube disattivata/rimossa. | Non ci sono conflitti né task affidati all'estensione sbagliata; l'identità ora è `Waph1@youtube`. |
| B06 | P1 | Provare Gopeed sulla piattaforma di destinazione e, se disponibili, desktop e Android. | Le funzionalità WebView richieste partono; annotare per ogni OS la versione e le differenze. |
| B07 | P1 | Testare una versione compatibile recente di Gopeed oltre alla beta.3. | Nessuna regressione di avvio, elenco, merge e file finale; annotare numero esatto. |
| B08 | P2 | Incollare un URL che non sia YouTube e poi un URL YouTube invalido. | L'estensione non intercetta host estranei; errore chiaro per link invalido, nessun file spurio. |
| B09 | P2 | Tentare con Gopeed 1.x solo se già disponibile, senza alterare l'installazione principale. | Incompatibilità dichiarata e comprensibile; non segnare come regressione della 2.x. |

## Video singoli: modalità e qualità

Usare lo **stesso** video pubblico per comparare le prove. La qualità scelta è un tetto sulla risoluzione del **lato corto**, non una promessa di stream esatto; il bitrate audio indica lo stream disponibile più vicino, senza conversione/upsampling.

| ID | Pr. | Prova | Esito atteso |
| --- | --- | --- | --- |
| Q01 | P0 | `Video + audio`, qualità video `Highest`, audio `Highest`; scaricare e riprodurre. | MP4 intero con una traccia video e audio udibile. |
| Q02 | P0 | `Audio only`, contenitore `M4A`, `Highest`. | File `.m4a` intero, riproducibile, con traccia audio e **senza** traccia video. |
| Q03 | P0 | `Audio only`, contenitore `WebM`, `Highest`. | File `.webm` audio intero, riproducibile, senza traccia video. |
| Q04 | P1 | `Video only`, poi riprodurre. | File con traccia video e **senza audio**; silenzio intenzionale. |
| Q05 | P1 | `Video and audio (separate files)`. | Due file distinti e completi: uno video e uno audio; niente MP4 con merge automatico. |
| Q06 | P1 | Sullo stesso video confrontare `1080p` e `720p`, se tali stream sono disponibili. | Risoluzione effettiva non supera il limite selezionato; differenza verificabile dove la sorgente lo consente. |
| Q07 | P1 | Selezionare `Highest`, `Lowest`, e un limite non disponibile (es. `480p`). | Scelta dello stream disponibile secondo il limite; se tutti lo superano, il più basso disponibile. |
| Q08 | P1 | Su un video verticale/Short, scegliere `720p`. | Limite applicato al lato corto; video non deformato né ruotato. |
| Q09 | P1 | In M4A, confrontare `Highest`, `Lowest` e `128`; poi in WebM. | Audio riproducibile; bitrate disponibili coerenti con la scelta più vicina, senza supporre 128 kbps esatti. |
| Q10 | P1 | Confrontare contenitori audio M4A/AAC e WebM/Opus. | Estensione e codec del file corrispondono alla scelta; `Highest` è interno a ciascun formato. |
| Q11 | P1 | Impostare audio WebM come predefinito, poi `Video + audio`. | MP4 unito con audio AAC utilizzabile, indipendentemente dal contenitore audio scelto per `Audio only`. |
| Q12 | P1 | Cambiare qualità e modalità predefinite, chiudere e riaprire Gopeed. | Le impostazioni restano e valgono per il download successivo. |
| Q13 | P1 | Provare un video che offre solo alcune risoluzioni o bitrate. | L'elenco/risultato non dichiara qualità inesistenti come garantite; nessun blocco arbitrario. |
| Q14 | P2 | Provare 144p, 240p, 360p, 480p, 1440p, 2160p e 4320p solo dove offerti e con spazio sufficiente. | File rispetta il limite o usa il fallback documentato; segnalare codec non riproducibile su Android separatamente dal download incompleto. |
| Q15 | P2 | Riprodurre dall'inizio a metà e alla fine, confrontando durata con il video fonte. | Durata plausibile, nessun taglio, desincronizzazione marcata o blocco alla fine. |

Per controllare le tracce **senza dedurle dall'estensione**, usare se disponibile `ffprobe -v error -show_entries format=duration:stream=index,codec_type,codec_name,width,height,bit_rate -of json "NOME_FILE"`. In alternativa utilizzare le proprietà di un lettore multimediale. Annotare il valore reale, non attribuire automaticamente ogni qualità richiesta al file.

## Scelta nell'elenco e parametri del link

Gopeed offre un **elenco di file selezionabili**, non un menu a discesa personalizzato. Quando l'opzione è attiva può selezionare inizialmente **tutte** le varianti: occorre deselezionarle esplicitamente. Verificare ogni volta numero di task e file finali.

| ID | Pr. | Prova | Esito atteso |
| --- | --- | --- | --- |
| S01 | P0 | Attivare `Choose Quality On Download`, aggiungere video singolo. | Si vedono alternative video+audio e solo audio identificabili prima della conferma. |
| S02 | P0 | Deselezionare tutto e scegliere una sola variante solo audio. | Parte una sola variante, esce un solo audio senza video. |
| S03 | P0 | Deselezionare tutto e scegliere una sola variante video+audio. | Parte un solo download MP4 completo con audio. |
| S04 | P1 | Scegliere volontariamente due varianti. | Escono due file distinti, con nomi non sovrascritti; evitare di selezionarle tutte involontariamente. |
| S05 | P0 | Deselezionare **tutte** le varianti e confermare/tentare di avviare. | Nessun download inatteso: se Gopeed avvia comunque tutte le varianti, segnalarlo come blocco di pubblicazione e documentare comportamento UI. |
| S06 | P1 | Con `Choose Quality On Download` attivo controllare impostazione audio predefinita sulle varianti video. | La variante video usa la qualità audio predefinita, salva disponibilità dello stream. |
| S07 | P1 | Usare `#gopeed:mode=audio&audio=128&container=m4a` su un link singolo. | Un audio M4A con bitrate disponibile vicino a 128; l'override prevale sui default. |
| S08 | P1 | Usare `#gopeed:mode=muxed&video=1080p&audio=128` con elenco alternative attivo. | Una sola configurazione prevale sull'elenco; il video segue il limite e l'audio quello disponibile. |
| S09 | P1 | Provare `#gopeed:mode=audio&audio=highest&container=webm` e poi un nuovo URL senza override. | Il primo produce audio WebM; il secondo riprende i default salvati, non eredita l'override. |

## Formati di link e playlist

Impostare `playlistLimit = 0` per la playlist completa; **ogni voce può fallire separatamente al momento del trasferimento**. Per non intasare memoria/rete, usare un limite basso prima delle playlist lunghe. Non basarsi solo sulla lista restituita: verificare almeno una traccia completa e, per gli album campione, entrambe.

| ID | Pr. | Prova | Esito atteso |
| --- | --- | --- | --- |
| U01 | P1 | Video singolo con `https://youtube.com/watch?v=...`. | Download completo. |
| U02 | P1 | Stesso video con `https://www.youtube.com/watch?v=...`. | Stesso contenuto. |
| U03 | P1 | Stesso video con `https://m.youtube.com/watch?v=...`. | Stesso contenuto. |
| U04 | P1 | Stesso video con `https://youtu.be/...` e parametri aggiuntivi leciti. | ID corretto e download completo. |
| U05 | P1 | Video pubblico `https://music.youtube.com/watch?v=...`. | Brano riconosciuto, file audio/video coerente con modalità scelta. |
| U06 | P2 | Video `https://www.youtube-nocookie.com/embed/...`. | ID ricavato e download del video pubblico. |
| U07 | P1 | Shorts `https://www.youtube.com/shorts/...` (se formato accettato). | Video riproducibile oppure errore esplicito; annotare se il link non viene intercettato. |
| U08 | P2 | URL con `t=`, `si=`, `feature=` o `&list=`; riprovare senza parametri. | ID video corretto; parametri non necessari non cambiano il file. |
| U09 | P1 | `watch?v=...&list=...` con `Download Playlist From Video Link = off`. | Solo il video indicato, non l'intera playlist. |
| U10 | P1 | Stesso link con `Download Playlist From Video Link = on`. | Elenco della playlist, con ordine e limite conformi alle impostazioni. |
| U11 | P2 | URL con frammento normale e URL con `#gopeed:`. | Solo il secondo modifica le preferenze; nessun ID contaminato dal frammento. |
| U12 | P1 | ID video errato, URL malformata o host somigliante a YouTube. | Errore chiaro/nessuna intercettazione indebita; nessun download di altro contenuto. |
| P01 | P0 | Playlist album `https://youtube.com/playlist?list=OLAK5uy_m7WK0j-v1eLCguUDonKUjJs7Rjza-6lKg` con `playlistLimit = 0`. | Compaiono **due** elementi, in ordine: `Punk Rock / Cody (2026 Mix)` (`ML1A1-VSWWo`), `A Mimesis of Purpose (2026 Mix)` (`cbPAlLx6vuQ`). Titoli/contenuto online possono cambiare: registrare eventuale divergenza. |
| P02 | P0 | Con l'album di P01 scaricare e ascoltare **entrambi** i brani da `youtube.com`. | Due file completi distinti, numerati nell'ordine corretto, con audio riproducibile. |
| P03 | P1 | Stesso ID playlist con `https://music.youtube.com/playlist?list=...`. | Se accessibile, lista e download equivalenti; annotare eventuali restrizioni differenti. |
| P04 | P1 | Playlist YouTube ordinaria, pubblica e breve. | Tutte le voci riproducibili compaiono e si scaricano in ordine. |
| P05 | P1 | `playlistLimit = 2` su lista con più di due brani, poi `0`. | Prima esattamente due voci riproducibili, poi lista completa; ripristinare `0`. |
| P06 | P1 | Playlist con più pagine (oltre la prima pagina restituita da YouTube). | Non si ferma alla prima pagina; ordine, numero e assenza di perdite verificati confrontando la fonte. |
| P07 | P1 | Playlist con voci non disponibili/private, se reperibile lecitamente. | Voci non accessibili saltate o errore puntuale comprensibile, senza associare audio al titolo sbagliato. |
| P08 | P1 | Playlist con video duplicati. | Ripetizioni e ordine conservati; file non sovrascritti grazie alla numerazione. |
| P09 | P1 | Playlist con più durate/titoli e caratteri accentati, simboli, emoji. | Nomi file utilizzabili, distinti, privi di separatori di percorso dannosi. |
| P10 | P1 | Playlist con `Download Mode = Audio only` e qualità M4A scelta. | Ogni voce selezionata produce un file audio, nessun video o varianti multiple inattese. |
| P11 | P1 | Playlist con `#gopeed:mode=audio&audio=128&container=webm`. | Override applicato a ciascuna voce scaricata, senza cambiare i default. |
| P12 | P1 | Playlist con `Choose Quality On Download = on`. | Varianti identificabili per ogni voce; selezionandone una per brano esce solo quanto scelto. |
| P13 | P1 | Playlist lunga: iniziare pochi file, attendere prima di avviare gli altri. | URL del flusso ottenuto quando parte il download; nessun errore di URL scaduto dovuto alla sola attesa. |
| P14 | P1 | Interrompere la rete mentre si carica una pagina successiva. | Errore visibile, non una lista incompleta presentata come lista completa. |
| P15 | P2 | Playlist con voce rimossa mentre la coda è in attesa. | Eventuale errore relativo alla voce, altri file restano correttamente associati ai titoli. |
| P16 | P1 | Provare una lista `RD...` (radio/Mix) e, se disponibili, `LL` e `WL`. | **Fuori ambito dichiarato**: niente promessa di supporto; errore esplicito preferibile a file sbagliati. |
| P17 | P2 | Playlist vuota, privata o non raggiungibile senza cookie. | Messaggio comprensibile; non trasformarla in falso completamento. |
| P18 | P2 | Playlist grande con `playlistLimit = 0`; misurare tempo e memoria. | Elenco completo o errore esplicito, senza blocco indefinito dell'app; registrare scala e dispositivo. |

## Affidabilità, sicurezza dei file e Android

| ID | Pr. | Prova | Esito atteso |
| --- | --- | --- | --- |
| R01 | P0 | Dopo trasferimento al 100%, aprire il file dall'app e da un lettore esterno. | Esiste nella cartella scelta, dimensione plausibile, audio/video fino alla fine. |
| R02 | P1 | Mettere in pausa, poi riprendere un trasferimento. | Non appare un file corrotto o falsamente completo. Lo stream SABR può ripartire dall'inizio: **nessuna garanzia di resume a byte**. |
| R03 | P1 | Interrompere la connessione a metà e ripristinarla. | Errore o retry identificabile; il file finale, se completato, è integro. |
| R04 | P1 | Forzare errore e controllare `onError`/retry. | Nessun ciclo infinito; retry limitato e risultato/errore leggibile. |
| R05 | P1 | Avviare due video o due brani in parallelo. | Nessuno scambio di tracce, sovrascrittura o blocco permanente. |
| R06 | P1 | Scaricare due volte lo stesso video e due titoli identici in playlist. | Gestione prevedibile di nomi duplicati; nessuna perdita silenziosa del primo file. |
| R07 | P1 | Verificare cartella destinazione, nomi lunghi e caratteri speciali. | Percorso sicuro e file apribili sulla piattaforma. |
| R08 | P1 | Spazio libero insufficiente durante download/merge. | Errore chiaro, nessun file finale dichiarato valido se incompleto; liberare poi spazio e riprovare. |
| R09 | P1 | Su Android: app in background e schermo spento per alcuni minuti durante un file breve. | Registrare se prosegue o riparte; file finale integro. Distinguere restrizioni batteria del dispositivo da errore dell'estensione. |
| R10 | P1 | Su Android: passaggio Wi-Fi/dati mobili e ripristino rete. | Errore/retry gestito; dopo completamento file riproducibile. Annotare costi dei dati prima del test. |
| R11 | P1 | Su Android: scegliere destinazione accessibile e riaprire il file con un'app esterna. | File effettivamente presente e leggibile; annotare permessi/cartella. |
| R12 | P2 | Su Android: ruotare schermo, chiudere/riaprire app mentre il task è in corso. | UI e stato del task coerenti; non assumere ripresa senza test. |
| R13 | P1 | Provare una diretta in corso e un video programmato. | **Fuori ambito**: errore chiaro, nessun falso successo o file valido apparente. |
| R14 | P1 | Video privato, geobloccato, con limite di età o richiesta di login. | Errore onesto; cookie opzionale solo se proprio e lecito, nessuna promessa di aggiramento delle restrizioni. |
| R15 | P1 | Senza cookie su video pubblico, poi con cookie personale solo se necessario; guardare i log prima di condividerli. | Video pubblico funziona senza cookie; valore e URL firmati **mai** pubblicati in issue/screenshot/log. |

## Criteri per valutare la pubblicazione

- [ ] Tutti i **P0** applicabili superati **su Gopeed reale**, inclusi file finali singoli video+audio, audio M4A/WebM, una scelta dalla lista e i **due** brani dell'album; nessun P0 irrisolto.
- [ ] Funzioni pubblicizzate e P1 principali verificate sulla piattaforma di pubblicazione (Android compreso, se dichiarato); eventuali P1 aperti descritti chiaramente come limiti, senza affermare che sono supportati.
- [ ] Almeno un video singolo, una playlist ordinaria e l'album musicale testati **fino alla riproduzione dei file**; playlist oltre una pagina e fallback di qualità provati.
- [ ] Verificati compatibilità con versione Gopeed dichiarata, installazione da fork, file/codec reali, spazio insufficiente ed errori di rete. Ripetere smoke test dopo l'ultima modifica.
- [ ] Documentazione, versione e note di rilascio riflettono gli esiti veri; nessun cookie o dato sensibile nei report pubblici.

### Modello per comunicare un risultato

```text
ID: B03 / Q02 / ...
Esito: PASS | FAIL | BLOCCATO | NON APPLICABILE
Data e ambiente: Gopeed ..., estensione ..., Android/OS ..., dispositivo ...
URL pubblico e durata: ...
Impostazioni e varianti selezionate: ...
Passaggi per riprodurre: 1. ... 2. ... 3. ...
Atteso: ...
Osservato: fase ..., task ..., file finale ... (dimensione/durata/tracce se note)
Errore mostrato dall'app: ...
Log pertinenti con dati sensibili rimossi: ...
Ripetibilità: ... tentativi su ...
```

Per debug, `extension.log` e `core.log` sono nella cartella `logs` di Gopeed. Se non si può ottenere un URL pubblico riproducibile, descrivere proprietà del contenuto senza condividere dati privati. Conservare gli esiti come commenti/issue oppure aggiungere qui una tabella datata; **non** spuntare una voce per il solo fatto che un test automatico passa.
