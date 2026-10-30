(() => {
  'use strict';
  const { $, t, esc } = Demo, C = MessageCore, W = ReviewWorkflow;
  const KEY = 'gang-yang-message-queue-v1';
  let queue = [], activeId = null, stored = null, dirty = false;
  const labels = { review: t('Needs review', '待复核'), approved: t('Reviewed', '已复核'), returned: t('Returned', '已退回') };
  const names = { REFERENCE: t('Reference', '业务编号'), DIRECTION: t('Direction', '交易方向'), INSTITUTION: t('Institution', '相关机构'), DEADLINE: t('Deadline', '回复时限'), REASON: t('Reason', '原因') };
  const issueLabels = { MISSING: t('Missing', '缺失'), CONFLICT: t('Conflicting values', '原文冲突'), INVALID: t('Invalid value', '格式错误'), REVIEW_NOTE: t('Correction note required', '需要修订依据'), UNKNOWN: t('Unknown type', '未知类型') };
  const actions = { create: t('Parsed', '解析入队'), revise: t('Fields revised', '保存修订'), approve: t('Approved', '复核确认'), return: t('Returned', '退回补充'), reopen: t('Reopened', '重新复核') };
  document.querySelector('.grid').insertAdjacentHTML('beforebegin', `<section class="card"><h2>${t('Review queue', '复核待办')}</h2><div class="controls"><label>${t('Filter', '筛选')}<select id="queueFilter"><option value="all">${t('All', '全部')}</option>${Object.entries(labels).map(([key, value]) => `<option value="${key}">${value}</option>`).join('')}</select></label><button class="btn" id="newCase">${t('New message', '新增报文')}</button><button class="btn" id="saveQueue">${t('Save on this device', '保存到本机')}</button><button class="btn" id="exportQueue">${t('Export queue', '导出待办包')}</button></div><label>${t('Import queue JSON · replaces the in-memory queue', '导入待办 JSON · 替换当前内存队列')}<input id="importQueue" type="file" accept=".json"></label><p class="hint">${t('Only Save writes to browser storage. Local files have no identity verification or tamper-proof guarantee. Use synthetic data.', '仅点击保存才写入浏览器。这里没有身份认证或防篡改服务，请使用合成数据。')}</p><p id="storageStatus" role="status"></p><div id="queue" class="table-scroll"></div><div id="workspaceError" class="error" role="alert"></div></section>`);
  $('reset').textContent = t('New message', '新增报文');
  $('export').insertAdjacentHTML('beforebegin', `<button class="btn" id="saveRevision">${t('Save revision', '保存修订')}</button><button class="btn" id="reopen">${t('Reopen', '重新复核')}</button>`);
  $('decision').insertAdjacentHTML('afterend', `<label>${t('Reopen reason', '重新复核原因')}<input id="reopenReason" maxlength="2000"></label>`);
  $('audit').nextElementSibling.textContent = t('History retains original evidence, field snapshots, decisions and reopen reasons. Save or export to retain changes.', '记录保留原文、字段快照、复核决定及重开原因。修改后请保存到本机或导出。');
  const current = () => queue.find(record => record.id === activeId);
  function fail(error) {
    const messages = { APPROVAL_BLOCKED: t('Resolve checks and supply correction notes before approval.', '请处理待核实项并填写修订依据后再确认。'), INVALID_TEXT: t('Check reviewer, reason and field lengths.', '请检查复核人、原因及字段长度。'), RECORD_LOCKED: t('Reopen the record before editing.', '请先填写原因并重新复核。') };
    $('workspaceError').textContent = messages[error.message] || t('Operation failed: ', '操作未完成：') + error.message;
  }
  function markDirty() { dirty = true; $('storageStatus').textContent = t('Unsaved changes — save or export.', '有未保存修改，请保存到本机或导出。'); }
  function renderQueue() {
    const filter = $('queueFilter').value;
    const visible = queue.filter(r => filter === 'all' || r.state === filter);
    $('queue').innerHTML = `<p>${queue.length} / 100 ${t('messages', '笔报文')}</p><table><thead><tr><th>ID</th><th>${t('Reference', '业务编号')}</th><th>${t('State', '状态')}</th><th>${t('Revision', '版本')}</th></tr></thead><tbody>${visible.map(r => `<tr class="${r.id === activeId ? 'selected' : ''}"><td><button class="btn" data-case="${esc(r.id)}">${esc(r.id)}</button></td><td>${esc(r.corrected.REFERENCE)}</td><td>${labels[r.state]}</td><td>${r.revision}</td></tr>`).join('')}</tbody></table>`;
  }
  function evidence(line) {
    const r = current();
    $('source').innerHTML = r ? r.original.lines.map((value, i) => `${i + 1 === line ? '<mark>' : ''}<span class="mono">${i + 1} </span>${esc(value)}${i + 1 === line ? '</mark>' : ''}`).join('\n') : '';
  }
  function values() { const r = current(); return r ? Object.fromEntries(r.original.required.map(key => [key, $('field-' + key).value])) : {}; }
  function assess() {
    const r = current();
    if (!r) return;
    const issues = C.inspect(r.original, values(), $('notes').value);
    $('issues').innerHTML = issues.length ? `<div class="review warning">${issues.map(i => `${esc(names[i.field] || i.field)}：${issueLabels[i.reason]}`).join('<br>')}</div>` : `<div class="review">${t('Required fields pass validation.', '必填字段校验通过。')}</div>`;
  }
  function render() {
    const r = current(), locked = r && r.state !== 'review';
    $('message').readOnly = Boolean(r);
    $('message').parentElement.firstChild.textContent = r ? t('Original message · locked', '原始报文 · 已锁定') : t('Synthetic message · editable', '合成报文 · 可编辑');
    $('parse').disabled = Boolean(r);
    $('state').textContent = r ? labels[r.state] : t('Draft', '待解析');
    $('type').textContent = r?.original.type || t('Awaiting classification', '等待分类');
    $('fields').className = '';
    $('fields').innerHTML = r ? r.original.required.map(key => `<div class="field-row"><label for="field-${key}">${names[key]}</label><div><input id="field-${key}" data-field="${key}" maxlength="200" value="${esc(r.corrected[key])}" ${locked ? 'disabled' : ''}><div class="field-status">${r.original.fields[key].evidence.map(e => `<button class="field-source" data-line="${e.line}">L${e.line}</button>`).join(' ')}</div></div></div>`).join('') : '';
    $('notes').value = r?.notes || '';
    $('reviewer').value = r?.reviewer || 'Demo reviewer';
    $('notes').disabled = Boolean(locked);
    $('reviewer').disabled = Boolean(locked);
    for (const id of ['approve', 'return', 'saveRevision']) $(id).disabled = !r || locked;
    $('reopen').disabled = !locked;
    $('export').disabled = !r;
    if (r) $('message').value = r.source;
    $('audit').innerHTML = r ? r.events.slice().reverse().map(event => `<li><time>${esc(event.at)}</time><strong>v${event.revision} · ${actions[event.action]}</strong>${event.corrected ? `<pre>${esc(JSON.stringify(event.corrected, null, 2))}</pre>` : ''}<p>${esc(event.reviewer || '')} ${esc(event.reason || event.notes || '')}</p></li>`).join('') : '';
    $('issues').innerHTML = '';
    $('decision').textContent = '';
    evidence(); assess(); renderQueue();
  }
  function commitForm() {
    const r = current();
    if (!r || r.state !== 'review') return;
    const command = { action: 'revise', corrected: values(), reviewer: $('reviewer').value, notes: $('notes').value };
    if (JSON.stringify(command.corrected) === JSON.stringify(r.corrected) && command.reviewer === r.reviewer && command.notes === r.notes) return;
    queue[queue.indexOf(r)] = W.transition(r, command, r.revision);
    markDirty();
  }
  function newDraft(source = C.samples.complete) { commitForm(); activeId = null; $('message').value = source; render(); }
  function protect(fn) { return () => { try { $('workspaceError').textContent = ''; fn(); } catch (error) { fail(error); } }; }
  for (const key of Object.keys(C.samples)) $(key).onclick = protect(() => newDraft(C.samples[key]));
  $('newCase').onclick = $('reset').onclick = protect(() => newDraft());
  $('parse').onclick = protect(() => {
    if (queue.length >= 100) throw Error('QUEUE_LIMIT');
    let n = 1; while (queue.some(r => r.id === 'CASE-' + n)) n++;
    const record = W.create('CASE-' + n, $('message').value);
    queue.push(record); activeId = record.id; markDirty(); render();
  });
  $('fields').oninput = () => { markDirty(); assess(); };
  $('notes').oninput = () => { markDirty(); assess(); };
  $('reviewer').oninput = markDirty;
  $('message').oninput = markDirty;
  $('fields').onclick = event => { const button = event.target.closest('[data-line]'); if (button) evidence(Number(button.dataset.line)); };
  $('saveRevision').onclick = protect(() => { commitForm(); render(); });
  for (const action of ['approve', 'return']) $(action).onclick = protect(() => {
    commitForm(); const r = current();
    queue[queue.indexOf(r)] = W.transition(r, { action }, r.revision);
    markDirty(); render();
  });
  $('reopen').onclick = protect(() => {
    const r = current();
    queue[queue.indexOf(r)] = W.transition(r, { action: 'reopen', reviewer: $('reviewer').value, reason: $('reopenReason').value }, r.revision);
    $('reopenReason').value = ''; markDirty(); render();
  });
  $('queue').onclick = event => { const button = event.target.closest('[data-case]'); if (button) protect(() => { commitForm(); activeId = button.dataset.case; render(); })(); };
  $('queueFilter').onchange = renderQueue;
  $('saveQueue').onclick = protect(() => {
    commitForm();
    if (!current() && $('message').value.trim() && dirty) throw Error(t('Parse the draft before saving.', '请先解析草稿后再保存。'));
    // Compare with the last read value to avoid silently replacing another tab's updates.
    if (localStorage.getItem(KEY) !== stored) throw Error(t('Another tab changed the saved queue. Export this queue, then reload.', '其他标签页已修改存档。请先导出当前队列，再刷新。'));
    const next = JSON.stringify(W.exportQueue(queue));
    localStorage.setItem(KEY, next); stored = next; dirty = false;
    $('storageStatus').textContent = t('Saved on this browser.', '已保存到当前浏览器。');
  });
  $('exportQueue').onclick = protect(() => { commitForm(); Demo.download('review-queue.json', W.exportQueue(queue)); });
  $('export').onclick = protect(() => { commitForm(); Demo.download('review-record.json', W.exportQueue([current()])); });
  $('importQueue').onchange = async event => {
    const file = event.target.files[0];
    try {
      if (!file) return;
      if (file.size > 5000000) throw Error('QUEUE_SIZE');
      const data = JSON.parse(await file.text());
      const restored = W.importQueue(data.queue || data);
      if (dirty && !confirm(t('Replace unsaved work with the imported queue?', '用导入队列替换尚未保存的修改？'))) return;
      queue = restored; activeId = queue[0]?.id || null; markDirty(); render();
      Demo.toast(t('Queue imported. Save to retain it.', '待办已导入，请保存到本机。'));
    } catch (error) { fail(error); }
    finally { event.target.value = ''; }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  try {
    stored = localStorage.getItem(KEY);
    if (stored) { queue = W.importQueue(JSON.parse(stored)); activeId = queue[0]?.id || null; $('storageStatus').textContent = t('Saved queue restored.', '已恢复本机待办。'); }
  } catch (error) { fail(error); }
  $('message').value = C.samples.complete;
  render();
})();
