const W = require('../src/workflow.js');
const C = require('../src/core.js');
const { options, read, emit, main } = require('./common.cjs');
main(() => {
  const args = options(process.argv.slice(2), ['input', 'restore', 'at', 'output'], ['help']);
  if (args.help) { console.log('node scripts/batch.cjs --input BATCH_JSON [--at ISO_TIMESTAMP] [--output NEW_FILE]\nnode scripts/batch.cjs --restore QUEUE_JSON [--output NEW_FILE]'); return; }
  if (Boolean(args.input) === Boolean(args.restore)) throw Error('Choose --input or --restore');
  const data = JSON.parse(read(args.input || args.restore, 5000000));
  const records = args.restore ? W.importQueue(data.queue || data) : W.batch(data, args.at);
  emit({ queue: W.exportQueue(records), summary: records.map(r => ({ id: r.id, state: r.state, revision: r.revision, issues: C.inspect(r.original, r.corrected, r.notes) })) }, args.output);
});
