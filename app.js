(function () {
  const PL = window.ProbationLogic;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let lastFileName = '';
  let lastRows = null;
  let lastOutput = null;

  const stepPanels = {
    1: $('#step-1'),
    2: $('#step-2'),
    3: $('#step-3'),
    4: $('#step-4'),
  };

  function setStep(n) {
    Object.keys(stepPanels).forEach((k) => {
      const el = stepPanels[k];
      if (el) el.classList.toggle('hidden', Number(k) !== n);
    });
    $$('.nav-card').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.step) === n);
    });
  }

  $$('.nav-card').forEach((btn) => {
    btn.addEventListener('click', () => setStep(Number(btn.dataset.step)));
  });

  const refDateInput = $('#ref-date');
  if (refDateInput) {
    const t = new Date();
    refDateInput.valueAsDate = t;
  }

  function normalizeRowKeys(rows) {
    return rows.map((row) => {
      const o = {};
      Object.keys(row).forEach((k) => {
        o[String(k).trim()] = row[k];
      });
      return o;
    });
  }

  function sheetRowsFromWorkbook(wb) {
    const name = wb.SheetNames[0];
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    return normalizeRowKeys(rows).filter((r) => {
      const n = r['姓名'];
      return n != null && String(n).trim() !== '';
    });
  }

  function formatDateCell(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function runTransform(rows, today) {
    return PL.buildOutputRows(rows, today);
  }

  /** 仅保留存在待补/delay 的行（无 delay 不占表格）；解析失败行仍保留便于修正源表 */
  function onlyDelayRows(rows) {
    return rows.filter((r) => {
      if (r._error) return true;
      const d = Number(r['delay月跨度']);
      if (!isNaN(d) && d > 0) return true;
      const p = r['待补考核内容'];
      return p != null && String(p).trim() !== '';
    });
  }

  function renderPreview(output) {
    const tbody = $('#preview-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const shown = onlyDelayRows(output);
    if (shown.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td colspan="5" style="text-align:center;color:#6b7280;padding:24px">暂无待补记录（当前无 delay 或无需催办）</td>';
      tbody.appendChild(tr);
      $('#btn-download')?.classList.add('hidden');
      return;
    }
    $('#btn-download')?.classList.remove('hidden');
    shown.forEach((r) => {
      const tr = document.createElement('tr');
      const err = r._error ? ` title="${r._error}"` : '';
      tr.innerHTML = `
        <td>${escapeHtml(String(r['姓名'] ?? ''))}</td>
        <td>${escapeHtml(String(r['导师'] ?? ''))}</td>
        <td>${escapeHtml(formatDateCell(r['入职日期']))}</td>
        <td${err}>${escapeHtml(String(r['待补考核内容'] ?? '')).replace(/\n/g, '<br>')}</td>
        <td>${r['delay月跨度'] ?? ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function downloadXlsx(output) {
    const shown = onlyDelayRows(output);
    if (shown.length === 0) return;
    const data = shown.map((r) => ({
      姓名: r['姓名'],
      导师: r['导师'],
      入职日期: formatDateCell(r['入职日期']),
      待补考核内容: r['待补考核内容'] || '',
      delay月跨度: r['delay月跨度'] ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '待补考核');
    const fname = `试用期待补考核_${formatDateFile(new Date())}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  function formatDateFile(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function processFile(file) {
    if (!file) return;
    lastFileName = file.name;
    const notice = $('#last-file-notice');
    if (notice) {
      const ts = new Date().toLocaleString('zh-CN', { hour12: false });
      notice.textContent = `使用上次上传的记录：${file.name}（上传时间：${ts}）`;
      notice.classList.remove('hidden');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      lastRows = sheetRowsFromWorkbook(wb);
      const ref = refDateInput && refDateInput.value ? new Date(refDateInput.value) : new Date();
      lastOutput = runTransform(lastRows, ref);
      renderPreview(lastOutput);
    };
    reader.readAsArrayBuffer(file);
  }

  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      dropzone.classList.remove('dragover');
      const f = ev.dataTransfer.files[0];
      if (f) processFile(f);
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) processFile(f);
    });
  }

  $('#btn-regenerate')?.addEventListener('click', () => {
    if (!lastRows) return;
    const ref = refDateInput && refDateInput.value ? new Date(refDateInput.value) : new Date();
    lastOutput = runTransform(lastRows, ref);
    renderPreview(lastOutput);
  });

  $('#btn-download')?.addEventListener('click', () => {
    if (lastOutput && lastOutput.length) downloadXlsx(lastOutput);
  });

  setStep(1);
})();
