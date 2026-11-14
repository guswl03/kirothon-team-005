'use strict';
// docs/presentation.html -> PRESENTATION.pdf (npm run pdf)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720 });
  await win.loadFile(path.join(__dirname, '..', 'docs', 'presentation.html'));
  const data = await win.webContents.printToPDF({ landscape: false, printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(path.join(__dirname, '..', 'PRESENTATION.pdf'), data);
  app.exit(0);
}).catch(() => app.exit(1));