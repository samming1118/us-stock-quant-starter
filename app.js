'use strict';

const state = { rows: [], result: null, chart: null, theme: 'light' };
const $ = (id) => document.getElementById(id);
const fmtPct = (x) => Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '—';
const fmtNum = (x, digits = 2) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const esc = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  const btn = document.querySelector('[data-theme-toggle]');
  btn.setAttribute('aria-label', theme === 'dark' ? '切換至淺色模式' : '切換至深色模式');
  btn.innerHTML = theme === 'dark'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function navigate(view) {
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === view));
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) throw new Error('CSV 至少需要標題及兩行數據。');
  const split = (line) => {
    const out = []; let current = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { current += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(current.trim()); current = ''; }
      else current += ch;
    }
    out.push(current.trim()); return out;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const required = ['date', 'ticker', 'close'];
  required.forEach((h) => { if (!headers.includes(h)) throw new Error(`欠缺必要欄位：${h}`); });
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows = lines.slice(1).map((line, lineIndex) => {
    const cols = split(line); const date = cols[idx.date]; const ticker = (cols[idx.ticker] || '').toUpperCase();
    const close = Number(cols[idx.close]); const volume = idx.volume === undefined || cols[idx.volume] === '' ? null : Number(cols[idx.volume]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`第 ${lineIndex + 2} 行日期無效，請用 YYYY-MM-DD。`);
    if (!ticker) throw new Error(`第 ${lineIndex + 2} 行欠缺 ticker。`);
    if (!Number.isFinite(close) || close <= 0) throw new Error(`第 ${lineIndex + 2} 行 close 必須大於 0。`);
    if (volume !== null && (!Number.isFinite(volume) || volume < 0)) throw new Error(`第 ${lineIndex + 2} 行 volume 無效。`);
    return { date, ticker, close, volume };
  });
  const unique = new Set();
  rows.forEach((r) => { const key = `${r.date}|${r.ticker}`; if (unique.has(key)) throw new Error(`重複資料：${r.date} ${r.ticker}`); unique.add(key); });
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
}

function loadRows(rows) {
  state.rows = rows; state.result = null;
  const tickers = [...new Set(rows.map((r) => r.ticker))];
  const dates = rows.map((r) => r.date);
  $('dataStatus').textContent = '已載入'; $('dataStatus').className = 'status positive';
  $('dataSummary').hidden = false;
  $('dataSummary').innerHTML = `<strong>${rows.length.toLocaleString()} 行有效數據</strong><br>${tickers.length} 隻股票 · ${esc(dates[0])} 至 ${esc(dates[dates.length - 1])}`;
  $('dataError').hidden = true; $('runBacktest').disabled = false;
}

function handleText(text) {
  try { loadRows(parseCsv(text)); } catch (error) {
    $('dataError').textContent = error.message; $('dataError').hidden = false;
    $('dataStatus').textContent = '格式錯誤'; $('dataStatus').className = 'status error'; $('runBacktest').disabled = true;
  }
}

function sma(values, period) {
  const out = Array(values.length).fill(null); let sum = 0;
  for (let i = 0; i < values.length; i += 1) { sum += values[i]; if (i >= period) sum -= values[i - period]; if (i >= period - 1) out[i] = sum / period; }
  return out;
}

function rsi(values, period = 14) {
  const out = Array(values.length).fill(null); if (values.length <= period) return out;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i += 1) { const d = values[i] - values[i - 1]; gain += Math.max(d, 0); loss += Math.max(-d, 0); }
  let avgGain = gain / period; let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) { const d = values[i] - values[i - 1]; avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period; avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period; out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss); }
  return out;
}

function metrics(returns, equity) {
  const n = returns.length; const mean = n ? returns.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? returns.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const vol = Math.sqrt(variance) * Math.sqrt(252); const sharpe = vol ? (mean * 252) / vol : 0;
  let peak = equity[0] || 1; let maxDd = 0;
  equity.forEach((v) => { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1); });
  const years = Math.max(n / 252, 1 / 252); const total = (equity.at(-1) || 1) - 1;
  const cagr = (equity.at(-1) || 1) > 0 ? (equity.at(-1) || 1) ** (1 / years) - 1 : -1;
  return { total, cagr, maxDd, vol, sharpe, best: Math.max(...returns, 0), worst: Math.min(...returns, 0) };
}

function backtest(rows, config) {
  const grouped = new Map();
  rows.forEach((r) => { if (!grouped.has(r.ticker)) grouped.set(r.ticker, []); grouped.get(r.ticker).push({ ...r }); });
  grouped.forEach((arr) => {
    arr.sort((a, b) => a.date.localeCompare(b.date)); const closes = arr.map((r) => r.close); const volumes = arr.map((r) => r.volume || 0);
    const fast = sma(closes, config.fast); const slow = sma(closes, config.slow); const strength = rsi(closes); const volAvg = sma(volumes, 20);
    arr.forEach((r, i) => { r.fast = fast[i]; r.slow = slow[i]; r.rsi = strength[i]; r.signal = fast[i] !== null && slow[i] !== null && strength[i] !== null && fast[i] > slow[i] && r.close > slow[i] && strength[i] >= config.rsiMin && strength[i] <= config.rsiMax && (!config.volume || (r.volume !== null && volAvg[i] !== null && r.volume > volAvg[i])); });
  });
  const dates = [...new Set(rows.map((r) => r.date))].sort(); const byDate = new Map(dates.map((d) => [d, new Map()]));
  grouped.forEach((arr, ticker) => arr.forEach((r) => byDate.get(r.date).set(ticker, r)));
  const daily = []; let equity = 1; let benchmark = 1; let prevWeights = new Map();
  for (let i = 1; i < dates.length; i += 1) {
    const prev = byDate.get(dates[i - 1]); const today = byDate.get(dates[i]);
    const eligible = [...prev.entries()].filter(([ticker, r]) => r.signal && today.has(ticker));
    const weights = new Map(eligible.map(([ticker]) => [ticker, 1 / Math.max(eligible.length, 1)]));
    let gross = 0; weights.forEach((weight, ticker) => { const p0 = prev.get(ticker).close; const p1 = today.get(ticker).close; gross += weight * (p1 / p0 - 1); });
    const allTradable = [...prev.keys()].filter((ticker) => today.has(ticker)); let benchRet = 0;
    allTradable.forEach((ticker) => { benchRet += (today.get(ticker).close / prev.get(ticker).close - 1) / Math.max(allTradable.length, 1); });
    const union = new Set([...prevWeights.keys(), ...weights.keys()]); let turnover = 0; union.forEach((t) => { turnover += Math.abs((weights.get(t) || 0) - (prevWeights.get(t) || 0)); });
    turnover /= 2; const net = gross - turnover * config.costBps / 10000; equity *= 1 + net; benchmark *= 1 + benchRet;
    daily.push({ date: dates[i], return: net, grossReturn: gross, benchmarkReturn: benchRet, equity, benchmark, positions: eligible.length, turnover }); prevWeights = weights;
  }
  const valid = daily.filter((d) => Number.isFinite(d.return)); const m = metrics(valid.map((d) => d.return), valid.map((d) => d.equity));
  const avgPositions = valid.length ? valid.reduce((s, d) => s + d.positions, 0) / valid.length : 0;
  const annualTurnover = valid.length ? valid.reduce((s, d) => s + d.turnover, 0) / valid.length * 252 : 0;
  const activeRate = valid.length ? valid.filter((d) => d.positions > 0).length / valid.length : 0;
  const latestDate = dates.at(-1); const latest = [...byDate.get(latestDate).entries()].map(([ticker, r]) => ({ ticker, ...r })).sort((a, b) => Number(b.signal) - Number(a.signal) || a.ticker.localeCompare(b.ticker));
  return { daily: valid, metrics: m, avgPositions, annualTurnover, activeRate, latest, start: dates[0], end: dates.at(-1) };
}

function getConfig() {
  const config = { fast: Number($('fastSma').value), slow: Number($('slowSma').value), rsiMin: Number($('rsiMin').value), rsiMax: Number($('rsiMax').value), costBps: Number($('costBps').value), volume: $('volumeFilter').checked };
  if (config.fast >= config.slow) throw new Error('快速平均線日數必須少於慢速平均線。');
  if (config.rsiMin >= config.rsiMax) throw new Error('RSI 下限必須少於上限。');
  if (config.volume && state.rows.every((r) => r.volume === null)) throw new Error('成交量確認需要 CSV 的 volume 欄位。');
  const minRows = Math.max(config.slow, 15) + 2;
  const counts = new Map(); state.rows.forEach((r) => counts.set(r.ticker, (counts.get(r.ticker) || 0) + 1));
  if ([...counts.values()].every((n) => n < minRows)) throw new Error(`每隻股票最少需要 ${minRows} 個交易日。`);
  return config;
}

function renderResults(result) {
  $('emptyResults').hidden = true; $('resultContent').hidden = false; $('exportResults').disabled = false;
  $('periodLabel').textContent = `${result.start} 至 ${result.end} · ${result.daily.length.toLocaleString()} 個回測日`;
  $('kpiReturn').textContent = fmtPct(result.metrics.total); $('kpiCagr').textContent = fmtPct(result.metrics.cagr); $('kpiDrawdown').textContent = fmtPct(result.metrics.maxDd); $('kpiSharpe').textContent = fmtNum(result.metrics.sharpe);
  $('metricVol').textContent = fmtPct(result.metrics.vol); $('metricBest').textContent = fmtPct(result.metrics.best); $('metricWorst').textContent = fmtPct(result.metrics.worst); $('metricPositions').textContent = fmtNum(result.avgPositions, 1); $('metricTurnover').textContent = fmtPct(result.annualTurnover); $('metricDays').textContent = result.daily.length.toLocaleString(); $('activeRate').textContent = `${fmtPct(result.activeRate)} 日子有持倉`;
  const selected = result.latest.filter((r) => r.signal).length; $('signalCount').textContent = `${selected} 隻入選`; $('signalCount').className = `status ${selected ? 'positive' : 'neutral'}`;
  $('signalBody').innerHTML = result.latest.map((r) => `<tr><td><strong>${esc(r.ticker)}</strong></td><td>${fmtNum(r.close)}</td><td>${fmtNum(r.fast)}</td><td>${fmtNum(r.slow)}</td><td>${fmtNum(r.rsi, 1)}</td><td><span class="signal ${r.signal ? 'on' : ''}">${r.signal ? '入選' : '觀望'}</span></td></tr>`).join('');
  if (state.chart) state.chart.destroy();
  const styles = getComputedStyle(document.documentElement); const primary = styles.getPropertyValue('--primary').trim(); const muted = styles.getPropertyValue('--muted').trim(); const border = styles.getPropertyValue('--border').trim(); const text = styles.getPropertyValue('--text').trim();
  state.chart = new Chart($('equityChart'), { type: 'line', data: { labels: result.daily.map((d) => d.date), datasets: [{ label: '策略', data: result.daily.map((d) => (d.equity - 1) * 100), borderColor: primary, backgroundColor: `${primary}18`, borderWidth: 2, pointRadius: 0, tension: .15, fill: true }, { label: '等權基準', data: result.daily.map((d) => (d.benchmark - 1) * 100), borderColor: muted, borderWidth: 1.5, pointRadius: 0, tension: .15 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'top', align: 'end', labels: { color: text, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 7 } }, y: { grid: { color: border }, ticks: { color: muted, callback: (v) => `${v}%` } } } } });
}

function run() {
  try { state.result = backtest(state.rows, getConfig()); renderResults(state.result); navigate('results'); } catch (error) { $('dataError').textContent = error.message; $('dataError').hidden = false; navigate('setup'); }
}

function exportCsv() {
  if (!state.result) return;
  const header = 'date,strategy_return,gross_return,benchmark_return,equity,benchmark,positions,turnover';
  const lines = state.result.daily.map((d) => [d.date, d.return, d.grossReturn, d.benchmarkReturn, d.equity, d.benchmark, d.positions, d.turnover].join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quantstart-backtest-results.csv'; a.click(); URL.revokeObjectURL(a.href);
}

document.querySelector('[data-theme-toggle]').addEventListener('click', () => { setTheme(state.theme === 'dark' ? 'light' : 'dark'); if (state.result) renderResults(state.result); });
setTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.view); }));
document.querySelectorAll('[data-go-setup]').forEach((el) => el.addEventListener('click', () => navigate('setup')));
$('rerun').addEventListener('click', () => navigate('setup')); $('runBacktest').addEventListener('click', run); $('exportResults').addEventListener('click', exportCsv);
$('pasteToggle').addEventListener('click', () => { $('pasteArea').hidden = !$('pasteArea').hidden; }); $('parsePaste').addEventListener('click', () => handleText($('csvPaste').value));
$('csvFile').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) file.text().then(handleText); });
const dropzone = $('dropzone');
['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => { const file = e.dataTransfer.files[0]; if (file) file.text().then(handleText); });
navigate(['setup', 'results', 'guide'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'setup');
