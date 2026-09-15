const { spawnSync } = require('node:child_process');
const path = require('node:path');
console.log('parent starts child');
spawnSync(process.execPath, [path.join(__dirname, 'child.js')], { stdio: 'inherit' });
console.log('parent done');
