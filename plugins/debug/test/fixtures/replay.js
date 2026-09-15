const path = require('node:path');
const { replayed } = require('./replayed.js');

const real = path.join(__dirname, 'replayed.js');
const map = Buffer.from(
  JSON.stringify({ version: 3, file: 'fake', sources: [real], names: [], mappings: ';AACA' }),
).toString('base64');
const code =
  '({"replayed":_=>\n_()})' +
  '\n//# sourceURL=about://React/Server/file://' +
  encodeURI(real) +
  '?1' +
  '\n//# sourceMappingURL=data:application/json;base64,' +
  map;
const fake = (0, eval)(code).replayed;

for (let i = 0; i < 3; i += 1) fake(() => undefined);
console.log('real', replayed(21));
