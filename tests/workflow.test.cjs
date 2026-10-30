const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const C = require('../src/core.js'), W = require('../src/workflow.js');
const at = '2026-10-30T00:00:00.000Z';
const create = source => W.create('CASE-1',source || C.samples.complete,at);
const step = (r,c) => W.transition(r,c,r.revision,at);
test('approval requires identity and valid fields, and freezes further corrections', () => {
  let r=create();assert.throws(()=>step(r,{action:'approve'}),/INVALID_TEXT/);
  r=step(r,{action:'revise',corrected:{},reviewer:'Reviewer'});r=step(r,{action:'approve'});
  assert.equal(r.state,'approved');assert.throws(()=>step(r,{action:'revise',corrected:{}}),/LOCKED/);
  assert.throws(()=>step(r,{action:'return'}),/LOCKED/);
});
test('missing and conflicting source fields need a recorded correction reason', () => {
  let r=create(C.samples.missing);r=step(r,{action:'revise',corrected:{DEADLINE:'2026-11-05'},reviewer:'Reviewer'});
  assert.throws(()=>step(r,{action:'approve'}),/APPROVAL_BLOCKED/);
  r=step(r,{action:'revise',corrected:{},notes:'Confirmed from a synthetic follow-up'});
  assert.equal(step(r,{action:'approve'}).state,'approved');
  assert.equal(r.original.fields.DEADLINE.value,'');
});
test('return then reopen preserves the previous decision and requires a reason', () => {
  let r=step(create(),{action:'revise',corrected:{},reviewer:'Reviewer',notes:'Need clarification'});
  r=step(r,{action:'return'});assert.throws(()=>step(r,{action:'reopen',reviewer:'Other',reason:''}));
  r=step(r,{action:'reopen',reviewer:'Other',reason:'Follow-up arrived'});
  assert.equal(r.state,'review');assert.equal(r.notes,'');assert.equal(r.events[2].notes,'Need clarification');
});
test('revision conflicts and backwards timestamps reject stale updates without mutation', () => {
  const r=create(), before=JSON.stringify(r);
  assert.throws(()=>W.transition(r,{action:'return'},0,at),/REVISION_CONFLICT/);
  assert.throws(()=>W.transition(r,{action:'revise'},1,'2026-10-29T00:00:00.000Z'),/TIMESTAMP/);
  assert.equal(JSON.stringify(r),before);
});
test('versioned queue round-trips through transition replay including field snapshots', () => {
  let r=step(create(),{action:'revise',corrected:{INSTITUTION:'Another synthetic unit'},reviewer:'Reviewer',notes:'Confirmed'});
  r=step(r,{action:'approve'});
  assert.deepEqual(W.importQueue(JSON.parse(JSON.stringify(W.exportQueue([r])))),[r]);
});
test('import rejects skipped revisions, illegal decisions, duplicate IDs and oversized fields', () => {
  const data=W.exportQueue([create()]);
  const clone=()=>JSON.parse(JSON.stringify(data));
  let bad=clone();bad.records[0].events.push({action:'approve',revision:2,at});assert.throws(()=>W.importQueue(bad));
  bad=clone();bad.records[0].events.push({action:'revise',revision:3,at,corrected:{}});assert.throws(()=>W.importQueue(bad));
  bad=clone();bad.records.push(bad.records[0]);assert.throws(()=>W.importQueue(bad));
  assert.throws(()=>step(create(),{action:'revise',corrected:{REFERENCE:'x'.repeat(201)}}));
  assert.throws(()=>step(create(),{action:'revise',corrected:{UNKNOWN:'x'}}));
});
test('batch processing keeps decisions separate and is reproducible with an explicit timestamp', () => {
  const input=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/batch.json'),'utf8'));
  const records=W.batch(input,at);assert.deepEqual(records.map(r=>r.state),['approved','approved','returned']);
  assert.deepEqual(W.batch(input,at),records);assert.throws(()=>W.batch([input[0],input[0]],at));
});
test('batch CLI creates and validates a saved queue', () => {
  const run=args=>spawnSync(process.execPath,['scripts/batch.cjs',...args],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  const a=run(['--input','examples/batch.json','--at',at]);assert.equal(a.status,0,a.stderr);
  const b=run(['--restore','examples/queue.json']);assert.equal(b.status,0,b.stderr);
  assert.deepEqual(JSON.parse(a.stdout),JSON.parse(b.stdout));
});
test('import rejects a decision attributed to a different reviewer than its prior revision', () => {
  let r=step(create(),{action:'revise',corrected:{},reviewer:'Reviewer'});r=step(r,{action:'approve'});
  const data=W.exportQueue([r]);data.records[0].events.at(-1).reviewer='Someone else';
  assert.throws(()=>W.importQueue(data),/INVALID_HISTORY/);
  assert.throws(()=>W.batch([{id:'CASE-X',source:C.samples.complete,decision:'revise'}],at),/INVALID_DECISION/);
});
