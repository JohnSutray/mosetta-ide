import { app, BrowserWindow, Menu, shell, Tray, type NativeImage } from 'electron';

export class IdeWindows {
  private readonly all = new Set<BrowserWindow>();

  constructor(
    private readonly url: () => Promise<string>,
    private readonly origin: string,
  ) {}

  get count(): number {
    return this.all.size;
  }

  async open(): Promise<void> {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      title: 'Mosetta IDE',
      backgroundColor: '#2b2b2b',
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.all.add(win);
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => this.all.delete(win));
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(this.origin)) return;
      event.preventDefault();
      void shell.openExternal(url);
    });
    await win.loadURL(await this.url());
  }

  focusOrOpen(): void {
    const last = [...this.all].at(-1);
    if (!last) {
      void this.open();
      return;
    }
    if (last.isMinimized()) last.restore();
    last.show();
    last.focus();
  }
}

export class TrayIcon {
  private tray: Tray | null = null;

  constructor(
    private readonly image: NativeImage,
    private readonly actions: { open(): void; newWindow(): void; quit(): void },
  ) {}

  show(): void {
    const tray = new Tray(this.image);
    tray.setToolTip('Mosetta IDE');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Mosetta IDE', click: () => this.actions.open() },
        { label: 'New window', click: () => this.actions.newWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => this.actions.quit() },
      ]),
    );
    tray.on('double-click', () => this.actions.open());
    this.tray = tray;
  }
}

export class AppMenu {
  install(): void {
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null);
      return;
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { type: 'separator' }, { role: 'quit' }] },
        { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
      ]),
    );
  }
}
