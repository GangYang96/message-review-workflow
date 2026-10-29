/* Independent schema-based message review. Required-field checks and evidence citations are deterministic; no HiAgent or SWIFT integration is implied. */
(function (root) {
  'use strict';

  const samples = {
    complete: 'TYPE: COMPLIANCE_QUERY\nREFERENCE: DEMO-FX-2026-0081\nDIRECTION: INBOUND\nINSTITUTION: DEMO CLEARING UNIT\nDEADLINE: 2026-11-05\nDETAILS: Please provide the purpose of this synthetic transfer and supporting documents.',
    missing: 'TYPE: COMPLIANCE_QUERY\nREFERENCE: DEMO-FX-2026-0082\nDIRECTION: OUTBOUND\nINSTITUTION: DEMO SETTLEMENT UNIT\nDETAILS: Supporting documents are required. Please confirm the response deadline.',
    conflict: 'TYPE: RETURN_NOTICE\nREFERENCE: DEMO-FX-2026-0083\nDIRECTION: INBOUND\nINSTITUTION: DEMO SETTLEMENT UNIT\nREASON: BENEFICIARY_DETAILS_INCOMPLETE\nREFERENCE: DEMO-FX-2026-0099\nDETAILS: Conflicting references require manual clarification.'
  };
  const fields = ['REFERENCE', 'DIRECTION', 'INSTITUTION', 'DEADLINE', 'REASON'];
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 30000) throw Error('MESSAGE_SIZE');
    const lines = text.split(/\r?\n/),
      found = {};
    lines.forEach((line, index) => {
      const m = /^\s*(TYPE|REFERENCE|DIRECTION|INSTITUTION|DEADLINE|REASON)\s*[:：]\s*(.*?)\s*$/i.exec(line);
      if (m) {
        const key = m[1].toUpperCase();
        (found[key] ??= []).push({
          value: m[2],
          line: index + 1,
          source: line
        });
      }
    });
    const typeEntries = found.TYPE || [];
    const typeValues = [...new Set(typeEntries.map(x => x.value))];
    const type = typeValues.length === 1 && ['COMPLIANCE_QUERY', 'RETURN_NOTICE'].includes(typeValues[0]) ? typeValues[0] : 'UNKNOWN';
    const required = type === 'COMPLIANCE_QUERY' ? ['REFERENCE', 'DIRECTION', 'INSTITUTION', 'DEADLINE'] : type === 'RETURN_NOTICE' ? ['REFERENCE', 'DIRECTION', 'INSTITUTION', 'REASON'] : ['REFERENCE', 'DIRECTION', 'INSTITUTION'];
    const result = {
      type,
      lines,
      fields: {},
      typeIssue: type === 'UNKNOWN',
      required
    };
    for (const key of fields) {
      const evidence = found[key] || [];
      const distinct = [...new Set(evidence.map(x => x.value).filter(Boolean))];
      let value = distinct[0] || '',
        issue = distinct.length > 1 ? 'CONFLICT' : required.includes(key) && !value ? 'MISSING' : '';
      if (!issue && value) {
        if (key === 'DEADLINE' && !validDate(value)) issue = 'INVALID';
        if (key === 'DIRECTION' && !['INBOUND', 'OUTBOUND'].includes(value)) issue = 'INVALID';
        if (key === 'REFERENCE' && !/^[A-Z0-9-]{1,80}$/i.test(value)) issue = 'INVALID';
      }
      result.fields[key] = {
        value,
        issue,
        evidence,
        required: required.includes(key)
      };
    }
    return result;
  }
  function inspect(parsed, edited, notes) {
    const issues = [];
    if (parsed.typeIssue) issues.push({
      field: 'TYPE',
      reason: 'UNKNOWN'
    });
    for (const key of parsed.required) {
      const original = parsed.fields[key],
        value = String(edited[key] ?? original.value).trim();
      if (!value) issues.push({
        field: key,
        reason: 'MISSING'
      });else if (key === 'DEADLINE' && !validDate(value) || key === 'DIRECTION' && !['INBOUND', 'OUTBOUND'].includes(value) || key === 'REFERENCE' && !/^[A-Z0-9-]{1,80}$/i.test(value) || value.length > 200) issues.push({
        field: key,
        reason: 'INVALID'
      });else if ((original.issue || value !== original.value) && !String(notes || '').trim()) issues.push({
        field: key,
        reason: 'REVIEW_NOTE'
      });
    }
    return issues;
  }
  const api = {
    samples,
    fields,
    parse,
    inspect,
    validDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;else root.MessageCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
