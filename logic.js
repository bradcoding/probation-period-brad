/**
 * 试用期转正操作台 — 绩效表 → 待补考核表 核心逻辑
 * 规则：入职日期 = 试用期预计到期日 − 6 个月；期望环节由「满 M 个月」推导。
 * 「业务评估」与「上级评估」在业务上等同，解析时映射到同一里程碑。
 */

/** @typedef {{ id: number; kind: 'goal'|'eval'|'plan'; month: number; patterns: RegExp[] }} Milestone */

/** 与文件1「当前环节」常见文案对齐，顺序即流程顺序（各月评估同时兼容业务/上级两种写法） */
const MILESTONE_SPECS = [
  { kind: 'goal', month: 0, patterns: [/直属上级制定目标/] },
  {
    kind: 'eval',
    month: 1,
    patterns: [/第一个月上级评估/, /第一个月业务评估/],
  },
  {
    kind: 'plan',
    month: 2,
    patterns: [/第二个月直属上级制定工作计划/, /制定第二个月工作计划/],
  },
  {
    kind: 'eval',
    month: 2,
    patterns: [/第二个月上级评估/, /第二个月业务评估/],
  },
  {
    kind: 'plan',
    month: 3,
    patterns: [/第三个月直属上级制定工作计划/, /制定第三个月工作计划/],
  },
  {
    kind: 'eval',
    month: 3,
    patterns: [/第三个月上级评估/, /第三个月业务评估/],
  },
  {
    kind: 'plan',
    month: 4,
    patterns: [/第四个月直属上级制定工作计划/, /制定第四个月工作计划/],
  },
  {
    kind: 'eval',
    month: 4,
    patterns: [/第四个月业务评估/, /第四个月上级评估/],
  },
  {
    kind: 'plan',
    month: 5,
    patterns: [/制定第五个月工作计划/, /第五个月直属上级制定工作计划/, /第五个月HRBP确认工作计划/],
  },
  {
    kind: 'eval',
    month: 5,
    patterns: [/第五个月业务评估/, /第五个月上级评估/],
  },
  { kind: 'plan', month: 6, patterns: [/制定第六个月工作计划/, /第六个月直属上级制定工作计划/] },
  {
    kind: 'eval',
    month: 6,
    patterns: [/第六个月业务评估/, /第六个月上级评估/],
  },
];

/** 扩展更多月份（第7个月及以后） */
function extendMilestones(maxMonth = 12) {
  const out = [];
  let id = 0;
  for (const s of MILESTONE_SPECS) {
    out.push({ id: id++, ...s });
  }
  for (let m = 7; m <= maxMonth; m++) {
    out.push({
      id: id++,
      kind: 'plan',
      month: m,
      patterns: [
        new RegExp(`第${m}个月直属上级制定工作计划`),
        new RegExp(`制定第${m}个月工作计划`),
      ],
    });
    out.push({
      id: id++,
      kind: 'eval',
      month: m,
      patterns: [
        new RegExp(`第${m}个月业务评估`),
        new RegExp(`第${m}个月上级评估`),
      ],
    });
  }
  return out;
}

const MILESTONES = extendMilestones(12);

/**
 * 试用期预计到期日往前推 6 个自然月（与 Excel 常见约定一致）
 * @param {Date} end
 */
function entryDateFromProbationEnd(end) {
  const d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  d.setMonth(d.getMonth() - 6);
  return d;
}

/** 只比较年月日，避免时分秒影响 */
function dateOnly(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/** 自然月加减（与入职日同日对齐） */
function addMonths(date, n) {
  const d = dateOnly(date);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

/**
 * 已入职满多少个月：第 k 个「入职月同日」的当天，仍视为未满 k 个月（仍在第 k 个自然月周期内）。
 * 例：11-28 入职，2026-03-28 当天仍算满 3 个月、未满 4 个月（与「第四个月在 3-28 结束」一致）。
 */
function fullMonthsSince(entry, today) {
  const e = dateOnly(entry);
  const t = dateOnly(today);
  if (!e || !t || t.getTime() < e.getTime()) return 0;
  let m = 0;
  for (;;) {
    const boundary = addMonths(e, m + 1);
    if (!boundary) break;
    const b = dateOnly(boundary);
    if (b.getTime() < t.getTime()) m++;
    else break;
  }
  return m;
}

/**
 * 期望应处于的环节索引（与「当前环节」同一索引系）：
 * - 不满 1 个月：仍处「直属上级制定目标」阶段，不要求第一个月评估
 * - 满 M 个月且 M≥1：处于 [满M, 满M+1) 时，正常应对齐「第(M+1)个月直属上级制定工作计划」
 *   例：满2个月不满3个月 → 第三个月计划（索引 4）
 */
function expectedMilestoneIndex(fullMonths) {
  if (fullMonths === 0) return 0;
  return 2 * fullMonths;
}

/**
 * 解析文件1「当前环节」→ 里程碑 id；空/NaN → 视为目标前（0）
 */
function parseCurrentStage(text) {
  if (text == null || String(text).trim() === '') return 0;
  const s = String(text).trim();
  for (const m of MILESTONES) {
    for (const re of m.patterns) {
      if (re.test(s)) return m.id;
    }
  }
  return 0;
}

function getMilestoneById(id) {
  return MILESTONES[id] || null;
}

/**
 * 待补：「当前环节」表示正处在该环节且尚未完成，故从当前里程碑（含）起，
 * 到期望里程碑（含）为止；若已快于期望，则至少包含当前未完成环节。
 */
function missingRangeIds(actualId, expectedId) {
  if (expectedId > actualId) {
    const out = [];
    for (let i = actualId; i <= expectedId; i++) out.push(i);
    return out;
  }
  if (expectedId < actualId) {
    return [actualId];
  }
  return [actualId];
}

/**
 * 将缺口列表格式化为「待补考核内容」
 * 尽量贴近示例：如 "4月&5月计划和评估"、"5月计划&评估"
 */
function formatPendingGap(ids) {
  if (ids.length === 0) return '';

  const items = ids.map((id) => MILESTONES[id]).filter(Boolean);
  const months = [...new Set(items.map((m) => m.month))].sort((a, b) => a - b);

  if (months.length === 0) return '';

  const hasGoal = () => items.some((x) => x.kind === 'goal');
  const minM = months[0];
  const maxM = months[months.length - 1];
  const span = maxM - minM + 1;

  const hasPlan = (mo) => items.some((x) => x.month === mo && x.kind === 'plan');
  const hasEval = (mo) => items.some((x) => x.month === mo && x.kind === 'eval');

  if (months.length === 1 && months[0] === 0 && hasGoal()) {
    return '直属上级制定目标';
  }

  if (span === 1) {
    const mo = minM;
    if (hasPlan(mo) && hasEval(mo)) return `${mo}月计划&评估`;
    if (hasPlan(mo) && !hasEval(mo)) return `${mo}月计划`;
    if (hasEval(mo) && !hasPlan(mo)) return `${mo}月评估`;
  }

  if (
    months.length === 2 &&
    months[0] === 1 &&
    months[1] === 2 &&
    hasEval(1) &&
    hasPlan(2) &&
    !hasPlan(1) &&
    !hasEval(2)
  ) {
    return '1月&2月计划和评估';
  }

  if (months.length >= 2) {
    const allPlanEval = months.every((mo) => hasPlan(mo) && hasEval(mo));
    if (allPlanEval) {
      if (months.length === 2) return `${months[0]}月&${months[1]}月计划和评估`;
      return `${months[0]}月&${months[months.length - 1]}月计划和评估`;
    }
  }

  const parts = [];
  for (const mo of months) {
    if (mo === 0 && hasGoal()) {
      parts.push('直属上级制定目标');
      continue;
    }
    const p = hasPlan(mo);
    const e = hasEval(mo);
    if (p && e) parts.push(`${mo}月计划和评估`);
    else if (p) parts.push(`${mo}月计划`);
    else if (e) parts.push(`${mo}月评估`);
  }
  return parts.join('\n');
}

/**
 * delay 月跨度：待补涉及的月份从最小到最大的跨度（含端点）
 */
function computeDelaySpan(ids) {
  if (ids.length === 0) return 0;
  const months = ids
    .map((id) => MILESTONES[id])
    .filter(Boolean)
    .map((m) => m.month);
  if (months.length === 0) return 0;
  const min = Math.min(...months);
  const max = Math.max(...months);
  return max - min + 1;
}

/** 参考日期晚于试用期预计到期日（不含到期日当天）→ 已满 6 个月试用期，视为已转正 */
function isAfterProbationEnd(today, probationEnd) {
  const t = dateOnly(today);
  const e = dateOnly(probationEnd);
  if (!t || !e) return false;
  return t.getTime() > e.getTime();
}

function isCurrentStageBlank(row) {
  const v = row['当前环节'];
  if (v == null) return true;
  return String(v).trim() === '';
}

/**
 * 从文件1解析行（列名需与模板一致）
 */
function parseRow(row, today) {
  const name = row['姓名'];
  const mentorCol = row['导师/引导人'] ?? row['导师&引导人'] ?? '';
  const mentor = mentorCol == null || mentorCol === '' ? '' : String(mentorCol).trim();
  const endRaw = row['试用期预计到期日期'];
  const end = excelDateToDate(endRaw);
  if (!end) {
    return {
      姓名: name,
      导师: mentor,
      入职日期: null,
      待补考核内容: '',
      delay月跨度: 0,
      _error: '无法解析试用期预计到期日期',
    };
  }
  const entry = entryDateFromProbationEnd(end);

  /** 试用期 6 个月：参考日期已到或超过「试用期预计到期日」→ 默认已转正，不计算 delay */
  if (isAfterProbationEnd(today, end)) {
    return {
      姓名: name,
      导师: mentor,
      入职日期: entry,
      待补考核内容: '',
      delay月跨度: 0,
      _meta: { reason: '转正', probationEnd: end },
    };
  }

  /** 「当前环节」空白 → 视为环节正常、无缺口 */
  if (isCurrentStageBlank(row)) {
    return {
      姓名: name,
      导师: mentor,
      入职日期: entry,
      待补考核内容: '',
      delay月跨度: 0,
      _meta: { reason: '环节空白', probationEnd: end },
    };
  }

  const fm = fullMonthsSince(entry, today);
  const expId = expectedMilestoneIndex(fm);
  const actId = parseCurrentStage(row['当前环节']);
  const miss = missingRangeIds(actId, expId);
  const pending = formatPendingGap(miss);
  const delay = computeDelaySpan(miss);

  return {
    姓名: name,
    导师: mentor,
    入职日期: entry,
    待补考核内容: pending,
    delay月跨度: delay,
    _meta: { fullMonths: fm, actualId: actId, expectedId: expId, missingIds: miss },
  };
}

function excelDateToDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utc);
    return d;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function buildOutputRows(sheetRows, today) {
  return sheetRows.map((row) => parseRow(row, today));
}

window.ProbationLogic = {
  entryDateFromProbationEnd,
  addMonths,
  fullMonthsSince,
  expectedMilestoneIndex,
  parseCurrentStage,
  getMilestoneById,
  missingRangeIds,
  formatPendingGap,
  computeDelaySpan,
  parseRow,
  buildOutputRows,
  dateOnly,
  isAfterProbationEnd,
  isCurrentStageBlank,
  MILESTONES,
};
