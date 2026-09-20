# Installazione e uso in italiano

Questa versione richiede **Gopeed 2.0.0-beta.3 o successivo**, con il componente WebView disponibile. Per ottenere un unico file video con audio serve anche il supporto FFmpeg di Gopeed. **Gopeed 1.x non è compatibile.**

## Installazione

1. Aggiorna Gopeed dalla [pagina ufficiale delle release](https://github.com/GopeedLab/gopeed/releases).
2. Disattiva o rimuovi la vecchia estensione YouTube. Annota prima eventuali impostazioni da conservare.
3. In **Estensioni → Installa**, inserisci:

   `https://github.com/Waph1/gopeed-extension-youtube-V1`

4. Apri le impostazioni di **YouTube Video & Audio**.
5. Crea un nuovo download incollando il link YouTube.

Il fork ora usa l’identità `Waph1@youtube`. La reinstallazione serve perché la vecchia copia dichiarava l’autore e il repository dell’originale. Gli aggiornamenti successivi arriveranno da questo fork.

## Impostazioni

| Impostazione | Significato |
| --- | --- |
| Download Mode | Video con audio in un MP4, solo audio, solo video o due file separati |
| Video Quality | Migliore, peggiore oppure risoluzione massima desiderata |
| Audio Quality | Migliore, peggiore oppure bitrate disponibile più vicino al valore indicato |
| Audio File Format | M4A/AAC oppure WebM/Opus; vale per audio e tracce separate |
| Choose Quality On Download | Mostra le alternative nell’elenco prima della conferma |
| Download Playlist From Video Link | Se un link video include anche una playlist, scarica l’intera playlist |
| Playlist Limit | Numero massimo di elementi riproducibili; 0 carica tutto l’elenco |

**Video con audio** viene unito automaticamente anche sopra 720p. Per il file MP4 viene scelto audio AAC. “Solo video” produce intenzionalmente un file muto.

La qualità video è un tetto: chiedendo 1080p, in assenza di 1080p si preferisce una risoluzione inferiore. Solo se tutte le risoluzioni superano il tetto si usa la più bassa disponibile. Nei video verticali conta il lato corto.

La qualità audio è quella offerta da YouTube: non si converte in MP3 e non si crea artificialmente una qualità superiore. “Migliore” vale all’interno del formato audio scelto.

## Scelta prima della conferma

Gopeed permette alle estensioni di restituire un elenco di file selezionabili. Non espone menu personalizzati per qualità e modalità.

Attivando **Choose Quality On Download**, vedrai versioni video con audio e versioni solo audio. **Gopeed le seleziona tutte inizialmente: deseleziona tutto e spunta soltanto la versione desiderata.** Ogni variante selezionata è un download distinto.

Le versioni video usano la qualità audio predefinita. Per scegliere contemporaneamente entrambe le qualità nel singolo download, senza cambiare le impostazioni, puoi aggiungere al link:

```text
#gopeed:mode=muxed&video=1080p&audio=128
```

Per solo audio WebM alla qualità migliore:

```text
#gopeed:mode=audio&audio=highest&container=webm
```

Esempio completo:

```text
https://youtu.be/aqz-KE-bpKQ#gopeed:mode=audio&audio=128&container=m4a
```

Queste opzioni disattivano l’elenco delle alternative per quel download e funzionano anche sulle playlist. La parte dopo `#gopeed:` non viene inviata a YouTube.

## Playlist musicali

Sono gestiti anche gli album con identificativo `OLAK5uy…`, sia da youtube.com sia da music.youtube.com. Il link fornito è stato verificato online: l’elenco contiene due brani dell’album **Deafheaven / Bosse-De-Nage (2026 Mix)**.

Titoli, ordine e ripetizioni sono conservati. Lo streaming viene preparato quando parte ciascun download, evitando di conservare per ore link destinati a scadere. Un errore nel caricamento delle pagine successive viene segnalato: non si presenta una playlist incompleta come completa.

Radio/Mix, Guarda più tardi, Video piaciuti, dirette in corso e video programmati non sono supportati. I video privati o non disponibili possono essere omessi dall’elenco o fallire al download, a seconda di quando YouTube segnala il problema.

## Stato delle verifiche

Consulta [VALIDATION.md](VALIDATION.md). I test automatici e la lettura reale della playlist non equivalgono a un download completo verificato su Gopeed: la prova del trasferimento con WebView non è stata completata nell’ambiente di sviluppo.

Se un download fallisce, servono versione di Gopeed, sistema operativo, link pubblico, modalità e testo dell’errore. Non condividere cookie o URL temporanei dei flussi. I log di Gopeed sono `extension.log` e `core.log` nella cartella `logs`.
