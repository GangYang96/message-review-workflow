const C = require('../src/core.js');
const {options, read, emit, main} = require('./common.cjs');
main(() => {
  const args = options(process.argv.slice(2), ['input','corrections','reviewer','notes','decision','output'], ['help']);
  if (args.help) { console.log('node scripts/review.cjs --input FILE [--corrections JSON_FILE] [--decision inspect|approve|return] [--reviewer NAME] [--notes TEXT] [--output NEW_FILE]'); return; }
  const source = read(args.input, 30000), original = C.parse(source);
  const corrections = args.corrections ? JSON.parse(read(args.corrections, 10000)) : {};
  if (!corrections || Array.isArray(corrections) || typeof corrections !== 'object') throw Error('Corrections must be a JSON object');
  if (Object.keys(corrections).some(key => !original.required.includes(key) || typeof corrections[key] !== 'string')) throw Error('Corrections contain an unknown field or non-string value');
  const corrected = Object.fromEntries(original.required.map(key=>[key,(corrections[key] ?? original.fields[key].value).trim()]));
  const issues = C.inspect(original, corrected, args.notes), decision = args.decision ?? 'inspect';
  if (!['inspect','approve','return'].includes(decision)) throw Error('Decision must be inspect, approve or return');
  if (decision !== 'inspect' && !args.reviewer?.trim()) throw Error('A reviewer is required');
  if (decision === 'return' && !args.notes?.trim()) throw Error('A return reason is required');
  if (decision === 'approve' && issues.length) throw Error(`Approval blocked: ${issues.map(i=>i.field+':'+i.reason).join(', ')}`);
  emit({synthetic:Object.values(C.samples).includes(source.trim()), scope:'Independent schema-based public prototype', source, original, corrected, issues, state:decision==='approve'?'approved':decision==='return'?'returned':'review', reviewer:args.reviewer?.trim()??'', notes:args.notes?.trim()??''}, args.output);
});
