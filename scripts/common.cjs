/* Small CLI helpers. Errors go to stderr; results go to stdout or a new file. */
const fs = require('node:fs');
const path = require('node:path');
function options(argv, names, flags = []) {
  const result = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || ![...names, ...flags].includes(name)) throw Error(`Unknown option: ${argv[i]}`);
    if (name in result) throw Error(`Repeated option: --${name}`);
    if (flags.includes(name)) result[name] = true;
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw Error(`Missing value: --${name}`);
      result[name] = value;
    }
  }
  return result;
}
function read(file, maxBytes) {
  if (!file) throw Error('Missing --input');
  if (fs.statSync(file).size > maxBytes) throw Error('Input exceeds size limit');
  return fs.readFileSync(file, 'utf8');
}
function emit(value, file) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (!file) { process.stdout.write(text); return; }
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive:true});
  fs.writeFileSync(file, text, {flag:'wx'});
  process.stderr.write(`Saved ${file}\n`);
}
function main(fn) {
  try { fn(); } catch (error) { process.stderr.write(`Error: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = {options, read, emit, main};
