import { app, nativeImage } from 'electron';
import path from 'node:path';
import { Daemon } from './daemon.js';
import { DesktopPaths } from './paths.js';
import { AppScheme } from './scheme.js';
import { AppMenu, IdeWindows, TrayIcon } from './shell.js';

class Desktop {
  private readonly paths = new DesktopPaths(path.resolve(__dirname, '..'));
  private readonly scheme = new AppScheme(this.paths.client);
  private readonly daemon = new Daemon({
    serverDir: this.paths.server,
    configDir: this.paths.config,
    logsDir: this.paths.logs,
    trustedOrigin: this.scheme.origin,
  });
  private readonly windows = new IdeWindows(async () => this.scheme.url(await this.daemon.ready()), this.scheme.origin);
  private tray: TrayIcon | null = null;
  private quitting = false;

  run(): void {
    app.setName('Mosetta IDE');
    if (process.platform === 'win32') app.setAppUserModelId('com.mosetta.ide');
    const debug = process.env.MOSETTA_DEBUG_PORT;
    if (debug) app.commandLine.appendSwitch('remote-debugging-port', debug);
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }
    this.scheme.register();
    app.on('second-instance', () => this.windows.focusOrOpen());
    app.on('window-all-closed', () => undefined);
    app.on('activate', () => {
      if (this.windows.count === 0) void this.windows.open();
    });
    app.on('before-quit', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.quitting = true;
      void this.daemon.stop().then(() => app.quit());
    });
    void app.whenReady().then(() => this.ready());
  }

  private ready(): void {
    const seeded = this.paths.seedConfig();
    if (seeded.length) console.info(`[desktop] конфиг засеян: ${seeded.join(', ')} → ${this.paths.config}`);
    this.scheme.serve();
    new AppMenu().install();
    this.daemon.start();
    const mac = process.platform === 'darwin';
    const image = nativeImage.createFromPath(path.join(this.paths.assets, mac ? 'trayTemplate.png' : 'tray.png'));
    this.tray = new TrayIcon(image, {
      open: () => this.windows.focusOrOpen(),
      newWindow: () => void this.windows.open(),
      quit: () => app.quit(),
    });
    this.tray.show();
    if (mac) app.dock?.setIcon(nativeImage.createFromPath(path.join(this.paths.assets, 'icon.png')));
    void this.windows.open();
  }
}

new Desktop().run();
