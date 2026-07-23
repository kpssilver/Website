#!/usr/bin/env node
/*
 * KPS Print Relay
 * ---------------
 * A tiny, zero-dependency HTTP relay that lets the KPS admin web app print
 * barcode/label tags directly to a local printer, bypassing the browser print
 * dialog entirely.
 *
 *   [ KPS admin (browser) ] --fetch()--> [ this relay @127.0.0.1:17777 ] --> [ printer ]
 *
 * It receives raw TSPL/ZPL/EPL command text and hands it to the OS print
 * spooler in RAW mode, so the label prints at its true size (e.g. 92x15mm)
 * with no A4 / no dialog.
 *
 * Endpoints
 *   GET  /            -> tiny human-readable status page
 *   GET  /status      -> { ok, os, version, printers: [names] }
 *   GET  /printers    -> { ok, printers: [names] }
 *   POST /print       -> body { printer, data, encoding? }  ->  { ok } | { ok:false, error }
 *
 * Run it:  node relay.js            (defaults to 127.0.0.1:17777)
 *          PORT=17777 node relay.js
 *
 * No npm install needed — this uses only Node's standard library.
 */

'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const VERSION = '1.0.0';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 17777);
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'

// -------------------------------------------------------------------------
// Printer discovery
// -------------------------------------------------------------------------
function listPrinters() {
  return new Promise((resolve) => {
    if (PLATFORM === 'win32') {
      // PowerShell is present on every supported Windows. Return printer names.
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
        { windowsHide: true, timeout: 8000 },
        (err, stdout) => {
          if (err || !stdout) return resolve([]);
          resolve(
            stdout
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          );
        },
      );
      return;
    }
    // macOS / Linux: CUPS `lpstat -a` lists accepting queues.
    execFile('lpstat', ['-a'], { timeout: 8000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/)[0])
          .filter(Boolean),
      );
    });
  });
}

// -------------------------------------------------------------------------
// Raw printing
// -------------------------------------------------------------------------

// Windows: send RAW bytes straight to the spooler via a small embedded C#
// helper (winspool.drv) run through PowerShell. This preserves the printer's
// native command language (TSPL) instead of rasterizing to a page.
function printRawWindows(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `kps-tag-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`);
    try {
      fs.writeFileSync(tmp, buffer);
    } catch (e) {
      return reject(new Error(`Could not write spool file: ${e.message}`));
    }

    // Escape for embedding inside a single-quoted PowerShell string.
    const psPrinter = String(printerName).replace(/'/g, "''");
    const psFile = tmp.replace(/'/g, "''");

    const script = `
$ErrorActionPreference = 'Stop'
$signature = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class KpsRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void SendFile(string printer, string file) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed for '" + printer + "' (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "KPS Tag";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        byte[] bytes = File.ReadAllBytes(file);
        int written;
        if (!WritePrinter(h, bytes, bytes.Length, out written)) throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
Add-Type -TypeDefinition $signature -Language CSharp
[KpsRawPrinter]::SendFile('${psPrinter}', '${psFile}')
`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 20000 },
      (err, _stdout, stderr) => {
        fs.unlink(tmp, () => {});
        if (err) return reject(new Error((stderr && stderr.trim()) || err.message));
        resolve();
      },
    );
  });
}

// macOS / Linux: `lp -d <printer> -o raw` streams the bytes untouched.
function printRawUnix(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const child = spawn('lp', ['-d', printerName, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let errOut = '';
    child.stderr.on('data', (d) => (errOut += d.toString()));
    child.on('error', (e) => reject(new Error(`lp not available: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error((errOut && errOut.trim()) || `lp exited with code ${code}`));
    });
    child.stdin.write(buffer);
    child.stdin.end();
  });
}

function printRaw(printerName, buffer) {
  if (PLATFORM === 'win32') return printRawWindows(printerName, buffer);
  return printRawUnix(printerName, buffer);
}

// -------------------------------------------------------------------------
// HTTP server
// -------------------------------------------------------------------------
function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome Private Network Access: allow requests from a public (HTTPS) page to
  // this local device. Sent on both preflight and actual responses.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && route === '/') {
      const printers = await listPrinters();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>KPS Print Relay</title>` +
          `<body style="font-family:system-ui;max-width:640px;margin:40px auto;color:#111">` +
          `<h1>KPS Print Relay <small style="color:#888">v${VERSION}</small></h1>` +
          `<p>Status: <b style="color:#0a7">running</b> on ${os.type()} (${PLATFORM}).</p>` +
          `<p>Printers found (${printers.length}):</p><ul>${printers.map((p) => `<li>${p}</li>`).join('') || '<li><i>none</i></li>'}</ul>` +
          `<p style="color:#888">Leave this window running while you print tags from the KPS admin app.</p>`,
      );
      return;
    }

    if (req.method === 'GET' && route === '/status') {
      const printers = await listPrinters();
      sendJson(res, 200, { ok: true, os: os.type(), platform: PLATFORM, version: VERSION, printers });
      return;
    }

    if (req.method === 'GET' && route === '/printers') {
      const printers = await listPrinters();
      sendJson(res, 200, { ok: true, printers });
      return;
    }

    if (req.method === 'POST' && route === '/print') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
      }
      const printer = payload && typeof payload.printer === 'string' ? payload.printer.trim() : '';
      const data = payload && typeof payload.data === 'string' ? payload.data : '';
      if (!printer) return sendJson(res, 400, { ok: false, error: 'Missing "printer"' });
      if (!data) return sendJson(res, 400, { ok: false, error: 'Missing "data"' });

      // TSPL/ZPL are Latin-1 command streams; binary1 preserves the bytes.
      const buffer = Buffer.from(data, 'latin1');
      try {
        await printRaw(printer, buffer);
        return sendJson(res, 200, { ok: true });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || String(e) });
      }
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message || String(e) });
  }
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`\n[KPS Print Relay] Port ${PORT} is already in use.`);
    console.error('Another copy may already be running — that is fine, you can keep using it.');
  } else {
    console.error('[KPS Print Relay] Server error:', e.message || e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  KPS Print Relay v${VERSION}`);
  console.log(`  Listening on http://${HOST}:${PORT}`);
  console.log(`  OS: ${os.type()} (${PLATFORM})`);
  console.log(`\n  Keep this window open while printing tags. Press Ctrl+C to stop.\n`);
  listPrinters().then((p) => console.log(`  Printers detected: ${p.length ? p.join(', ') : '(none yet)'}\n`));
});
