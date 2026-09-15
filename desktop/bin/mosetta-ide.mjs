#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Versions } from './versions.mjs';

const NAME = 'Mosetta IDE';
const ID = 'com.mosetta.ide';

class Layout {
  constructor() {
    this.pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    this.version = JSON.parse(fs.readFileSync(path.join(this.pkg, 'package.json'), 'utf8')).version;
    this.home = path.join(os.homedir(), '.mosetta', 'ide');
    this.apps = path.join(this.home, 'app');
    this.target = path.join(this.apps, this.version);
    this.current = path.join(this.apps, 'current');
  }

  sourceRoot() {
    let dir = this.pkg;
    while (path.basename(dir) !== 'node_modules') {
      const up = path.dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
    return path.dirname(dir);
  }

  packageIn(root) {
    return path.join(root, 'node_modules', '@mosetta', 'ide');
  }

  mainIn(root) {
    return path.join(this.packageIn(root), '.build', 'main.cjs');
  }

  electronIn(root) {
    return createRequire(path.join(this.packageIn(root), 'package.json'))('electron');
  }

  iconIn(root) {
    return path.join(this.packageIn(root), 'assets', 'icon.png');
  }
}

class MacLauncher {
  constructor(layout) {
    this.layout = layout;
    this.app = path.join(os.homedir(), 'Applications', `${NAME}.app`);
  }

  running() {
    const exe = path.join(this.app, 'Contents', 'MacOS', 'Electron').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return spawnSync('pgrep', ['-f', `^${exe}`]).status === 0;
  }

  create() {
    const root = this.layout.current;
    const bundle = path.resolve(this.layout.electronIn(root), '..', '..', '..');
    fs.rmSync(this.app, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(this.app), { recursive: true });
    fs.cpSync(bundle, this.app, { recursive: true, verbatimSymlinks: true });
    const contents = path.join(this.app, 'Contents');
    const plist = path.join(contents, 'Info.plist');
    const set = (key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist]);
    set('CFBundleName', NAME);
    set('CFBundleDisplayName', NAME);
    set('CFBundleIdentifier', ID);
    set('CFBundleIconFile', 'mosetta.icns');
    this.icon(path.join(contents, 'Resources', 'mosetta.icns'));
    const app = path.join(contents, 'Resources', 'app');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'mosetta-ide', productName: NAME, main: 'main.cjs' }, null, 2));
    fs.writeFileSync(path.join(app, 'main.cjs'), `require(${JSON.stringify(this.layout.mainIn(root))});\n`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', this.app], { stdio: 'ignore' });
    spawnSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', this.app]);
  }

  icon(out) {
    const set = fs.mkdtempSync(path.join(os.tmpdir(), 'mosetta-')) + '.iconset';
    fs.mkdirSync(set);
    const png = this.layout.iconIn(this.layout.current);
    for (const size of [16, 32, 128, 256, 512]) {
      execFileSync('sips', ['-z', String(size), String(size), png, '--out', path.join(set, `icon_${size}x${size}.png`)], { stdio: 'ignore' });
      execFileSync('sips', ['-z', String(size * 2), String(size * 2), png, '--out', path.join(set, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', out]);
    fs.rmSync(set, { recursive: true, force: true });
  }

  launch() {
    spawn('open', [this.app], { detached: true, stdio: 'ignore' }).unref();
  }

  remove() {
    fs.rmSync(this.app, { recursive: true, force: true });
  }
}

class WindowsLauncher {
  constructor(layout) {
    this.layout = layout;
    const appdata = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    this.links = [
      path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${NAME}.lnk`),
      path.join(os.homedir(), 'Desktop', `${NAME}.lnk`),
    ];
    this.ico = path.join(layout.home, 'mosetta.ico');
  }

  running() {
    return false;
  }

  create() {
    this.writeIco();
    const exe = this.layout.electronIn(this.layout.current);
    const main = this.layout.mainIn(this.layout.current);
    const q = (text) => text.replace(/'/g, "''");
    for (const link of this.links) {
      fs.mkdirSync(path.dirname(link), { recursive: true });
      const script =
        `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(link)}');` +
        `$s.TargetPath='${q(exe)}';$s.Arguments='"${q(main)}"';` +
        `$s.IconLocation='${q(this.ico)}';$s.WorkingDirectory='${q(os.homedir())}';$s.Save()`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
    }
  }

  writeIco() {
    const png = fs.readFileSync(this.layout.iconIn(this.layout.current));
    const head = Buffer.alloc(22);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(1, 4);
    head.writeUInt8(0, 6);
    head.writeUInt8(0, 7);
    head.writeUInt16LE(1, 10);
    head.writeUInt16LE(32, 12);
    head.writeUInt32LE(png.length, 14);
    head.writeUInt32LE(22, 18);
    fs.mkdirSync(path.dirname(this.ico), { recursive: true });
    fs.writeFileSync(this.ico, Buffer.concat([head, png]));
  }

  launch() {
    const exe = this.layout.electronIn(this.layout.current);
    spawn(exe, [this.layout.mainIn(this.layout.current)], { detached: true, stdio: 'ignore' }).unref();
  }

  remove() {
    for (const link of this.links) fs.rmSync(link, { force: true });
  }
}

class LinuxLauncher {
  constructor(layout) {
    this.layout = layout;
    const share = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
    this.entry = path.join(share, 'applications', 'mosetta-ide.desktop');
    this.icon = path.join(share, 'icons', 'hicolor', '512x512', 'apps', 'mosetta-ide.png');
  }

  running() {
    return false;
  }

  create() {
    const exe = this.layout.electronIn(this.layout.current);
    const main = this.layout.mainIn(this.layout.current);
    fs.mkdirSync(path.dirname(this.icon), { recursive: true });
    fs.copyFileSync(this.layout.iconIn(this.layout.current), this.icon);
    fs.mkdirSync(path.dirname(this.entry), { recursive: true });
    fs.writeFileSync(
      this.entry,
      [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${NAME}`,
        'Comment=IDE for frontend developers',
        `Exec="${exe}" "${main}" %U`,
        'Icon=mosetta-ide',
        'Terminal=false',
        'Categories=Development;IDE;',
        `StartupWMClass=${NAME}`,
        '',
      ].join('\n'),
    );
    fs.chmodSync(this.entry, 0o755);
    spawnSync('update-desktop-database', [path.dirname(this.entry)], { stdio: 'ignore' });
  }

  launch() {
    const exe = this.layout.electronIn(this.layout.current);
    spawn(exe, [this.layout.mainIn(this.layout.current)], { detached: true, stdio: 'ignore' }).unref();
  }

  remove() {
    fs.rmSync(this.entry, { force: true });
    fs.rmSync(this.icon, { force: true });
  }
}

class Cli {
  constructor() {
    this.layout = new Layout();
    this.launcher =
      process.platform === 'darwin'
        ? new MacLauncher(this.layout)
        : process.platform === 'win32'
          ? new WindowsLauncher(this.layout)
          : new LinuxLauncher(this.layout);
  }

  run(argv) {
    const [command = 'install', ...rest] = argv;
    const flags = new Set(rest);
    if (command === 'install') return this.install(flags.has('--force'));
    if (command === 'start') return this.launcher.launch();
    if (command === 'uninstall') return this.uninstall(flags.has('--purge'));
    this.fail(`unknown command: ${command}. Use install, start or uninstall.`);
  }

  install(force) {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 20) this.fail(`Node ${process.versions.node} is too old: Mosetta IDE needs Node 20 or newer.`);
    const root = this.layout.sourceRoot();
    if (!root) this.fail('Run it through npm: npx @mosetta/ide install');
    if (this.launcher.running()) this.fail(`${NAME} is running. Quit it (tray → Quit) and run install again.`);

    const { target } = this.layout;
    if (fs.existsSync(target) && !force) {
      this.step(`${this.layout.version} is already here: ${target} (--force to reinstall)`);
    } else {
      this.step(`copying ${this.layout.version} → ${target}`);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(root, target, { recursive: true, verbatimSymlinks: true });
    }

    this.step('building on this machine');
    execFileSync(process.execPath, [path.join(this.layout.packageIn(target), 'scripts', 'build.mjs')], { stdio: 'inherit' });

    const versions = new Versions(this.layout.apps);
    const previous = versions.currentName(this.layout.current);
    fs.rmSync(this.layout.current, { recursive: true, force: true });
    fs.symlinkSync(target, this.layout.current, process.platform === 'win32' ? 'junction' : 'dir');
    for (const gone of versions.prune([this.layout.version, previous])) {
      this.step(`removed old ${gone.name} (${Versions.megabytes(gone.bytes)}); keeping ${previous ?? 'nothing'} for rollback`);
    }

    this.step('creating the shortcut');
    this.launcher.create();
    this.step(`starting ${NAME}`);
    this.launcher.launch();
  }

  uninstall(purge) {
    this.launcher.remove();
    fs.rmSync(this.layout.apps, { recursive: true, force: true });
    if (purge) fs.rmSync(this.layout.home, { recursive: true, force: true });
    this.step(purge ? 'removed, with config and state' : `removed; config and state are kept in ${this.layout.home}`);
  }

  step(text) {
    console.log(`mosetta-ide: ${text}`);
  }

  fail(text) {
    console.error(`mosetta-ide: ${text}`);
    process.exit(1);
  }
}

new Cli().run(process.argv.slice(2));
