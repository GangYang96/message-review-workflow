/* Deterministic review transitions. A local audit history is not an authenticated audit service. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.MessageCore;
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
    return value;
  }
  const canonical = value => JSON.stringify(ordered(value));
  function text(value, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('INVALID_TEXT');
    return value.trim();
  }
  function timestamp(at, last) {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at || (last && at < last)) throw Error('INVALID_TIMESTAMP');
    return at;
  }
  function create(id, source, at = new Date().toISOString()) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw Error('INVALID_ID');
    text(source, 30000, true);
    const original = C.parse(source);
    return { id, source, original, corrected: Object.fromEntries(original.required.map(k => [k, original.fields[k].value])),
      state: 'review', reviewer: '', notes: '', revision: 1,
      events: [{ action: 'create', source, at: timestamp(at), revision: 1 }] };
  }
  function transition(record, command, expectedRevision, at = new Date().toISOString()) {
    if (expectedRevision !== record.revision) throw Error('REVISION_CONFLICT');
    if (!object(command)) throw Error('INVALID_COMMAND');
    if (record.events.length >= 500) throw Error('HISTORY_LIMIT');
    timestamp(at, record.events.at(-1).at);
    const next = copy(record);
    const action = command.action;
    let event;
    if (action === 'revise') {
      if (record.state !== 'review') throw Error('RECORD_LOCKED');
      const fields = command.corrected;
      if (!object(fields) || Object.keys(fields).some(k => !record.original.required.includes(k))) throw Error('INVALID_FIELDS');
      next.corrected = Object.fromEntries(record.original.required.map(k => [k, text(fields[k] ?? record.corrected[k], 200)]));
      next.notes = text(command.notes ?? record.notes, 2000);
      next.reviewer = text(command.reviewer ?? record.reviewer, 60);
      event = { action, corrected: next.corrected, notes: next.notes, reviewer: next.reviewer };
    } else if (action === 'approve' || action === 'return') {
      if (record.state !== 'review') throw Error('RECORD_LOCKED');
      text(record.reviewer, 60, true);
      if (action === 'return') text(record.notes, 2000, true);
      if (action === 'approve' && C.inspect(record.original, record.corrected, record.notes).length) throw Error('APPROVAL_BLOCKED');
      next.state = action === 'approve' ? 'approved' : 'returned';
      event = { action, reviewer: record.reviewer, notes: record.notes };
    } else if (action === 'reopen') {
      if (record.state === 'review') throw Error('ALREADY_OPEN');
      event = { action, reviewer: text(command.reviewer, 60, true), reason: text(command.reason, 2000, true) };
      next.state = 'review';
      next.reviewer = event.reviewer;
      // Earlier decisions retain their notes. The next review must supply fresh justification.
      next.notes = '';
    } else throw Error('INVALID_ACTION');
    next.revision++;
    next.events.push({ ...copy(event), at, revision: next.revision });
    return next;
  }
  function exportQueue(records) {
    if (!Array.isArray(records) || records.length > 100 || new Set(records.map(r => r.id)).size !== records.length) throw Error('QUEUE_LIMIT_OR_DUPLICATE');
    return { schema_version: 1, kind: 'message-review-queue', records: records.map(record => ({ id: record.id, events: copy(record.events) })) };
  }
  function importQueue(value) {
    if (!object(value) || value.schema_version !== 1 || value.kind !== 'message-review-queue' || !Array.isArray(value.records) || value.records.length > 100) throw Error('QUEUE_SCHEMA');
    if (JSON.stringify(value).length > 5000000) throw Error('QUEUE_SIZE');
    const seen = new Set();
    return value.records.map(saved => {
      if (!object(saved) || seen.has(saved.id) || !Array.isArray(saved.events) || !saved.events.length || saved.events.length > 500) throw Error('INVALID_HISTORY');
      seen.add(saved.id);
      const first = saved.events[0];
      if (!object(first) || first.action !== 'create' || first.revision !== 1) throw Error('INVALID_HISTORY');
      let record = create(saved.id, first.source, first.at);
      if (canonical(first) !== canonical(record.events[0])) throw Error('INVALID_HISTORY');
      for (const event of saved.events.slice(1)) {
        if (!object(event) || event.revision !== record.revision + 1) throw Error('INVALID_HISTORY');
        record = transition(record, event, record.revision, event.at);
        if (canonical(event) !== canonical(record.events.at(-1))) throw Error('INVALID_HISTORY');
      }
      return record;
    });
  }
  function batch(items, at = new Date().toISOString()) {
    if (!Array.isArray(items) || items.length > 100) throw Error('BATCH_LIMIT');
    const ids = new Set();
    return items.map(item => {
      if (!object(item) || ids.has(item.id)) throw Error('DUPLICATE_ID');
      ids.add(item.id);
      if (item.decision && !['inspect', 'approve', 'return'].includes(item.decision)) throw Error('INVALID_DECISION');
      let record = create(item.id, item.source, at);
      record = transition(record, { action: 'revise', corrected: item.corrections || {}, reviewer: item.reviewer || '', notes: item.notes || '' }, record.revision, at);
      if (item.decision && item.decision !== 'inspect') record = transition(record, { action: item.decision }, record.revision, at);
      return record;
    });
  }
  const api = { create, transition, exportQueue, importQueue, batch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ReviewWorkflow = api;
})(typeof window !== 'undefined' ? window : globalThis);
