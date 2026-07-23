# KPS Print Relay

A tiny, free, zero-dependency helper that lets the KPS admin web app print
barcode/label tags **directly** to the shop's label printer — no browser print
dialog, no A4 page, no third-party software.

```
[ KPS admin (browser) ] --fetch()--> [ KPS Print Relay @127.0.0.1:17777 ] --> [ label printer ]
```

The web app builds the raw **TSPL** commands for the tag and POSTs them to the
relay. The relay hands the bytes to the OS print spooler in **RAW** mode, so the
printer prints the label at its true size (e.g. 92 × 15 mm).

It uses only Node.js's standard library — nothing to `npm install`.

---

## One-time setup on the store computer

1. **Install Node.js** (LTS) once from <https://nodejs.org> if it isn't already
   installed. Verify in a terminal / command prompt:

   ```
   node --version
   ```

2. **Copy the `kps-print-relay` folder** to the store computer (e.g. onto the
   Desktop). Only these files are needed:
   - `relay.cjs`
   - `start-relay.bat` (Windows)
   - `start-relay.command` (macOS)

3. **Make sure the label printer is installed** in the OS with a driver, so it
   shows up in *Devices & Printers* (Windows) / *Printers & Scanners* (macOS).
   Note the **exact printer name** (e.g. `TSC TE244`).

---

## Starting the relay

- **Windows:** double-click `start-relay.bat`.
- **macOS:** double-click `start-relay.command`
  (first time: right-click → Open to get past Gatekeeper).
- **Any OS from a terminal:** `node relay.cjs`

A small window opens showing `Listening on http://127.0.0.1:17777` and the list
of detected printers. **Leave this window open** while printing. To stop it,
close the window or press `Ctrl+C`.

You can confirm it's alive by opening <http://127.0.0.1:17777/> in a browser.

---

## Printing tags

1. Start the relay (above).
2. In the KPS admin app, open **Stock → Print tag**.
3. The dialog shows **"Print relay connected — N printer(s) found."** Pick or
   type your label printer (e.g. `TSC TE244`).
4. Click **Print to label printer**. The tag prints instantly at the correct
   size.

If the relay isn't running, the dialog says so and you can still use the
**System print dialog** fallback.

---

## Auto-start on boot (optional, recommended)

So staff never have to think about it:

**Windows** — press `Win + R`, type `shell:startup`, Enter. Put a shortcut to
`start-relay.bat` in that folder. It will launch on every login.

**macOS** — *System Settings → General → Login Items → Open at Login → +* and
add `start-relay.command`. (Or create a `launchd` agent for a headless start.)

---

## How it works (for maintainers)

- **Server:** `relay.cjs`, Node stdlib `http` server bound to `127.0.0.1:17777`.
- **CORS / Private Network Access:** responses include
  `Access-Control-Allow-Origin`, `Access-Control-Allow-Private-Network: true`
  and answer `OPTIONS` preflights, so an HTTPS page (the live site) may call
  `http://127.0.0.1` (browsers treat loopback as a trustworthy origin).
- **Printer list:**
  - Windows: `powershell Get-Printer`.
  - macOS/Linux: `lpstat -a` (CUPS).
- **Raw printing:**
  - Windows: an embedded C# `winspool.drv` helper (`OpenPrinter` →
    `StartDocPrinter` with datatype `RAW` → `WritePrinter`), run via PowerShell.
  - macOS/Linux: `lp -d "<printer>" -o raw`.

### HTTP API

| Method | Path        | Body                              | Response                                  |
| ------ | ----------- | --------------------------------- | ----------------------------------------- |
| GET    | `/status`   | –                                 | `{ ok, os, platform, version, printers }` |
| GET    | `/printers` | –                                 | `{ ok, printers }`                        |
| POST   | `/print`    | `{ printer, data }` (data = TSPL) | `{ ok }` or `{ ok:false, error }`         |

The port can be changed with the `PORT` env var, e.g. `PORT=18000 node relay.cjs`
(must match `RELAY_BASE` in `src/admin/stock.js`).
