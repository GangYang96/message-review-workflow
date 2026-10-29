(() => {
  'use strict';

  const {
      t,
      esc,
      $
    } = Demo,
    C = MessageCore;
  let parsed = null,
    edited = {},
    state = 'draft',
    audit = [],
    revision = 0;
  const names = {
    REFERENCE: t('Reference', '业务编号'),
    DIRECTION: t('Direction', '交易方向'),
    INSTITUTION: t('Institution', '相关机构'),
    DEADLINE: t('Deadline', '回复时限'),
    REASON: t('Return reason', '退回原因')
  };
  const issueNames = {
    MISSING: t('Required field missing', '必填字段缺失'),
    CONFLICT: t('Conflicting source values', '原文存在冲突值'),
    INVALID: t('Invalid field format', '字段格式不合法'),
    REVIEW_NOTE: t('Add a review note for this correction', '请填写此修改的复核依据'),
    UNKNOWN: t('Unknown or conflicting message type', '报文类型未知或冲突')
  };
  Demo.mount('message-lab', t('Message Parsing and Review', '报文解析与人工复核'), t('A message parsing and human-review workflow.', '报文分类、字段抽取、原文定位与人工复核。'), `<div class="notice">${t('Independent demo based on the HiAgent project description. The local parser supports the displayed key-value format, not arbitrary bank messages or a live HiAgent model.', '依据 HiAgent 项目介绍独立实现。当前解析器支持所示键值格式，不处理任意银行报文，也不连接真实 HiAgent 模型。')}</div><div class="grid"><div><section class="card"><h2><span class="section-no">01</span>${t('Input message', '输入报文')}<span class="badge amber" id="state">${t('Draft', '待解析')}</span></h2><div class="actions" style="margin:0 0 12px"><button class="btn" id="complete">${t('Complete', '完整样例')}</button><button class="btn" id="missing">${t('Missing deadline', '缺失时限')}</button><button class="btn" id="conflict">${t('Conflicting references', '编号冲突')}</button></div><label>${t('Synthetic message · editable', '合成报文 · 可编辑')}<textarea id="message" rows="8" spellcheck="false"></textarea></label><div class="actions"><button class="btn primary" id="parse">${t('Parse & validate', '解析并校验')} →</button><button class="btn" id="reset">${t('Reset review', '重置复核')}</button></div></section><section class="card"><h2><span class="section-no">03</span>${t('Source evidence', '原文依据')}</h2><p>${t('Select a source link beside an extracted field to highlight the matching line.', '点击字段旁的来源链接，定位并高亮对应原文。')}</p><div class="source-panel" id="source">${t('Parse a message to inspect its evidence.', '解析报文后查看原文依据。')}</div></section><section class="card"><h2>${t('Review history', '复核记录')}</h2><ul class="log" id="audit"><li>${t('No actions yet.', '尚无操作。')}</li></ul><p class="note-bottom">${t('This session is temporary. Export the review record before closing.', '当前会话临时保存，关闭页面前可导出复核记录。')}</p></section></div><aside><section class="card"><h2><span class="section-no">02</span>${t('Structured fields', '结构化字段')}</h2><div id="type" class="hint">${t('Awaiting classification', '等待分类')}</div><div id="fields" class="empty">${t('Extracted fields appear here.', '解析后的字段会显示在这里。')}</div><div id="issues" aria-live="polite"></div></section><section class="card"><h2><span class="section-no">04</span>${t('Human review', '人工复核')}</h2><label>${t('Reviewer', '复核人')}<input id="reviewer" value="Demo reviewer" maxlength="60"></label><label style="margin-top:10px">${t('Correction / return reason', '修订依据 / 退回原因')}<textarea id="notes" rows="3" placeholder="${t('Explain corrected values or missing information.', '说明补充字段的来源或需要退回的原因。')}"></textarea></label><div class="review-actions" style="margin-top:12px"><button class="btn primary" id="approve" disabled>${t('Approve record', '确认复核')}</button><button class="btn" id="return" disabled>${t('Return for details', '退回补充')}</button></div><div class="actions"><button class="btn" id="export" disabled>${t('Export review JSON', '导出复核 JSON')}</button></div><div id="decision"></div><p class="note-bottom">${t('A human correction is retained separately from the original extraction.', '人工修订单独记录，原始抽取结果与原文保持可追溯。')}</p></section></aside></div>`);
  const stateLabels = {
    draft: t('Draft', '待解析'),
    review: t('Needs review', '待复核'),
    approved: t('Reviewed', '已复核'),
    returned: t('Returned', '已退回')
  };
  function log(action) {
    audit.push({
      at: new Date().toISOString(),
      action,
      revision
    });
    $('audit').innerHTML = audit.slice().reverse().map(a => `<li><time>${new Date(a.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}</time>${esc(a.action)}</li>`).join('');
  }
  function evidence(line) {
    if (!parsed) return;
    $('source').innerHTML = parsed.lines.map((text, i) => `${i + 1 === line ? '<mark>' : ''}<span class="mono">${String(i + 1).padStart(2, '0')} </span>${esc(text)}${i + 1 === line ? '</mark>' : ''}`).join('\n');
  }
  function assess() {
    if (!parsed) return [];
    const issues = C.inspect(parsed, edited, $('notes').value);
    $('issues').innerHTML = issues.length ? `<div class="review warning">${issues.length} ${t('checks need attention', '项需要核实')}<ul style="margin:5px 0 0;padding-left:17px">${issues.map(i => `<li>${esc(names[i.field] || i.field)}：${issueNames[i.reason]}</li>`).join('')}</ul></div>` : `<div class="review">✓ ${t('Required fields complete. Ready for human confirmation.', '必填字段完整，等待人工确认。')}</div>`;
    return issues;
  }
  function updateState() {
    const b = $('state');
    b.textContent = stateLabels[state];
    b.className = 'badge ' + (state === 'approved' ? '' : 'amber');
    $('approve').disabled = !parsed || state !== 'review';
    $('return').disabled = !parsed || state !== 'review';
    $('export').disabled = !parsed;
    document.querySelectorAll('#fields input, #reviewer, #notes').forEach(e => e.disabled = state === 'approved' || state === 'returned');
  }
  function invalidate() {
    parsed = null;
    edited = {};
    revision++;
    state = 'draft';
    $('fields').innerHTML = `<div class="empty">${t('Input changed. Parse again to refresh fields.', '输入已改变，请重新解析。')}</div>`;
    $('type').textContent = t('Awaiting classification', '等待分类');
    $('issues').innerHTML = '';
    $('source').textContent = t('Awaiting fresh extraction.', '等待重新提取原文。');
    $('decision').innerHTML = '';
    updateState();
  }
  function run() {
    try {
      parsed = C.parse($('message').value);
      edited = Object.fromEntries(parsed.required.map(key => [key, parsed.fields[key].value]));
      state = 'review';
      revision++;
      $('type').textContent = parsed.type;
      $('fields').className = '';
      $('fields').innerHTML = parsed.required.map(key => {
        const f = parsed.fields[key];
        return `<div class="field-row ${f.issue ? 'missing' : ''}"><label class="field-label" for="field-${key}">${names[key]}</label><div><input id="field-${key}" data-field="${key}" value="${esc(f.value)}" maxlength="200"><div class="field-status">${f.issue ? issueNames[f.issue] : t('Extracted from source', '已从原文提取')}${f.evidence.map(e => ` · <button class="field-source" data-line="${e.line}">L${e.line}</button>`).join('')}</div></div></div>`;
      }).join('');
      $('notes').value = '';
      $('decision').innerHTML = '';
      evidence();
      assess();
      updateState();
      log(t('Parsed and validated message', '完成报文分类与字段校验'));
    } catch {
      Demo.toast(t('Message is too large or invalid.', '报文过长或格式无效。'));
    }
  }
  $('message').value = C.samples.complete;
  $('message').oninput = invalidate;
  for (const key of Object.keys(C.samples)) $(key).onclick = () => {
    $('message').value = C.samples[key];
    invalidate();
    Demo.toast(t('Sample loaded', '样例已载入'));
  };
  $('parse').onclick = run;
  $('fields').oninput = e => {
    const k = e.target.dataset.field;
    if (k) {
      edited[k] = e.target.value;
      assess();
    }
  };
  $('fields').onclick = e => {
    const b = e.target.closest('[data-line]');
    if (b) evidence(Number(b.dataset.line));
  };
  $('notes').oninput = () => {
    if (parsed && state === 'review') assess();
  };
  $('approve').onclick = () => {
    if (!parsed || state !== 'review') return;
    const issues = assess();
    if (issues.length) {
      Demo.toast(t('Resolve the listed checks before approval.', '请先处理待核实项。'));
      return;
    }
    if (!$('reviewer').value.trim()) {
      Demo.toast(t('Enter a reviewer.', '请填写复核人。'));
      return;
    }
    state = 'approved';
    log(t('Approved by ', '复核确认：') + $('reviewer').value.trim());
    updateState();
    $('decision').innerHTML = `<div class="review">✓ ${t('Review confirmed. Original evidence and corrections are retained.', '复核已确认，保留原文、抽取值及人工修订。')}</div>`;
  };
  $('return').onclick = () => {
    if (!parsed || state !== 'review') return;
    if (!$('notes').value.trim() || !$('reviewer').value.trim()) {
      Demo.toast(t('Enter a reviewer and return reason.', '请填写复核人及退回原因。'));
      return;
    }
    state = 'returned';
    log(t('Returned for clarification: ', '退回补充：') + $('notes').value.trim());
    updateState();
    $('decision').innerHTML = `<div class="review warning">${t('Returned. Update the message and parse again when information arrives.', '已退回。补充信息后更新报文，重新解析。')}</div>`;
  };
  $('reset').onclick = () => {
    invalidate();
    $('notes').value = '';
    log(t('Review reset', '已重置复核'));
  };
  $('export').onclick = () => {
    if (parsed) Demo.download('message-review-demo.json', {
      synthetic: true,
      scope: 'Independent key-value parsing demo; no live HiAgent service',
      source: $('message').value,
      original: parsed,
      corrected: edited,
      reviewer: $('reviewer').value,
      notes: $('notes').value,
      state,
      revision,
      audit
    });
  };
  updateState();
})();
