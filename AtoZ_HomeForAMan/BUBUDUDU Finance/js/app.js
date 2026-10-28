import * as C from './core.js';
import { store } from './store.js';
import { groupedBars, lineChart, hBars, compareBars, donut, inr, COLORS, C_INCOME, C_EXPENSE, C_PREV } from './charts.js';

let state = store.load();
const ui = { view: 'dashboard', month: C.todayIso().slice(0, 7), txMonth: 'all', txQuery: '', txCategory: '', txLimit: 100, imp: null };

// ---------- DOM helpers (text only; never innerHTML) ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const main = document.getElementById('main');
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function commit(msg) {
  if (!store.save(state)) toast('Could not save: browser storage is full or blocked. Export a backup.');
  else if (msg) toast(msg);
  render();
}

const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const accName = (id) => state.accounts.find((a) => a.id === id)?.name || '';

// ---------- generic form dialog ----------
function openForm({ title, fields, values, validate, onSave, saveLabel = 'Save' }) {
  const dlg = h('dialog', { class: 'form-dialog', 'aria-label': title });
  const cur = { ...values };
  const errBox = h('ul', { class: 'errors', role: 'alert' });
  const rows = new Map();
  const inputs = new Map();

  const build = (f) => {
    let input;
    const common = { id: `f-${f.name}`, name: f.name };
    if (f.type === 'select') {
      input = h('select', common, f.options.map((o) => h('option', { value: o.value }, o.label)));
      input.value = cur[f.name] ?? '';
    } else {
      input = h('input', {
        ...common, type: f.type || 'text', step: f.step, min: f.min, autocomplete: 'off',
        list: f.list ? `dl-${f.name}` : false, inputmode: f.type === 'number' ? 'decimal' : false,
      });
      const v = cur[f.name];
      input.value = typeof v === 'number' && Number.isNaN(v) ? '' : (v ?? '');
    }
    inputs.set(f.name, input);
    const row = h('label', { class: 'field', for: common.id }, h('span', {}, f.label), input, f.hint ? h('small', {}, f.hint) : null);
    if (f.list) row.append(h('datalist', { id: `dl-${f.name}` }));
    rows.set(f.name, row);
    return row;
  };

  const read = () => {
    for (const f of fields) {
      const raw = inputs.get(f.name).value;
      cur[f.name] = f.type === 'number' ? (raw.trim() === '' ? NaN : Number(raw)) : raw.trim();
    }
  };
  const refresh = () => {
    read();
    for (const f of fields) {
      const row = rows.get(f.name);
      row.hidden = f.showIf ? !f.showIf(cur) : false;
      if (f.list) {
        const dl = row.querySelector('datalist');
        dl.replaceChildren(...f.list(cur).map((o) => h('option', { value: o })));
      }
    }
  };

  const form = h('form', { method: 'dialog', novalidate: true },
    h('h2', {}, title), fields.map(build), errBox,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); dlg.remove(); } }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, saveLabel)));
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    refresh();
    const out = { ...cur };
    for (const f of fields) if (f.showIf && !f.showIf(cur)) out[f.name] = f.type === 'number' ? NaN : '';
    const errs = validate ? validate(out) : [];
    errBox.replaceChildren(...errs.map((m) => h('li', {}, m)));
    if (errs.length) return;
    onSave(out);
    dlg.close();
    dlg.remove();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.append(form);
  document.body.append(dlg);
  refresh();
  dlg.showModal();
  inputs.get(fields[0].name).focus();
}

const opts = (arr) => arr.map((v) => ({ value: v, label: v }));
const accountOpts = (blank) => [{ value: '', label: blank }, ...state.accounts.map((a) => ({ value: a.id, label: a.name }))];

// ---------- transactions ----------
function txCategoryList(v) {
  return v.type === 'Income' ? C.INCOME_CATEGORIES : C.EXPENSE_CATEGORIES;
}

function editTransaction(existing) {
  if (!state.accounts.length) { toast('Add an account first.'); ui.view = 'accounts'; render(); return; }
  const t = existing || {
    id: C.newId('t'), date: C.todayIso(), type: 'Expense', category: '', from: state.accounts[0].id, to: '',
    amount: NaN, payee: '', source: 'Manual', externalId: '',
  };
  const needsFrom = (v) => ['Expense', 'Transfer', 'Investment Buy'].includes(v.type);
  const needsTo = (v) => ['Income', 'Refund', 'Transfer', 'Investment Sell'].includes(v.type);
  openForm({
    title: existing ? 'Edit transaction' : 'Add transaction',
    values: t,
    fields: [
      { name: 'type', label: 'Type', type: 'select', options: opts(C.TX_TYPES) },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'amount', label: 'Amount (INR)', type: 'number', step: '0.01', min: '0', hint: 'Always positive; the type decides direction.' },
      { name: 'from', label: 'From account', type: 'select', options: accountOpts('Select account'), showIf: needsFrom },
      { name: 'to', label: 'To account', type: 'select', options: accountOpts('Select account'), showIf: needsTo },
      { name: 'category', label: 'Category', list: txCategoryList, showIf: (v) => ['Income', 'Expense', 'Refund'].includes(v.type) },
      { name: 'payee', label: 'Payee / note' },
    ],
    validate: (v) => C.validateTransactionFields({ ...t, ...v }, new Set(state.accounts.map((a) => a.id)), state.settings.openingDate),
    onSave: (v) => {
      const next = { ...t, ...v };
      state.transactions = existing ? state.transactions.map((x) => (x.id === t.id ? next : x)) : [...state.transactions, next];
      commit(existing ? 'Transaction updated' : 'Transaction added');
    },
  });
}

function viewTransactions() {
  const an = C.analyze(state);
  const months = [...new Set(state.transactions.map((t) => C.monthOf(t.date || '')).filter(Boolean))].sort().reverse();
  const q = ui.txQuery.toLowerCase();
  let list = state.transactions.filter((t) => (ui.txMonth === 'all' || C.monthOf(t.date || '') === ui.txMonth)
    && (!ui.txCategory || t.category === ui.txCategory)
    && (!q || `${t.payee} ${t.category} ${t.type}`.toLowerCase().includes(q)));
  list = list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const shown = list.slice(0, ui.txLimit);
  const cats = [...new Set(state.transactions.map((t) => t.category).filter(Boolean))].sort();
  return h('section', {},
    h('div', { class: 'toolbar' },
      h('h1', {}, 'Transactions'),
      h('button', { class: 'btn primary', onclick: () => editTransaction() }, '+ Add')),
    h('div', { class: 'filters' },
      h('select', { 'aria-label': 'Month', onchange: (e) => { ui.txMonth = e.target.value; render(); } },
        h('option', { value: 'all' }, 'All months'), months.map((m) => h('option', { value: m, ...(m === ui.txMonth ? { selected: true } : {}) }, monthLabel(m)))),
      h('select', { 'aria-label': 'Category', onchange: (e) => { ui.txCategory = e.target.value; render(); } },
        h('option', { value: '' }, 'All categories'), cats.map((c) => h('option', { value: c, ...(c === ui.txCategory ? { selected: true } : {}) }, c))),
      h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search', value: ui.txQuery, oninput: (e) => { ui.txQuery = e.target.value; ui.txFocus = true; render(); } })),
    list.length === 0 ? emptyState('No transactions yet', 'Add one, import a statement, or load sample data from the Data tab.') : null,
    h('ul', { class: 'rows' }, shown.map((t) => {
      const issues = an.txIssues.get(t.id);
      const sign = ['Income', 'Refund', 'Investment Sell'].includes(t.type) ? '+' : ['Transfer'].includes(t.type) ? '' : '-';
      return h('li', { class: `row${issues ? ' bad' : ''}` },
        h('div', { class: 'row-main' },
          h('strong', {}, t.payee || t.category || t.type),
          h('small', {}, [t.date ? fmtDate(t.date) : 'No date', t.type, t.category, t.from ? `from ${accName(t.from) || '?'}` : '', t.to ? `to ${accName(t.to) || '?'}` : ''].filter(Boolean).join(' · ')),
          issues ? h('small', { class: 'issue' }, `Excluded from totals: ${issues.join('; ')}`) : null),
        h('div', { class: `amt ${sign === '+' ? 'pos' : sign === '-' ? 'neg' : ''}` }, `${sign}${inr(t.amount || 0)}`),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', onclick: () => editTransaction(t) }, 'Edit'),
          h('button', { class: 'btn small danger', onclick: () => { if (confirm('Delete this transaction?')) { state.transactions = state.transactions.filter((x) => x.id !== t.id); commit('Deleted'); } } }, 'Delete')));
    })),
    list.length > shown.length ? h('button', { class: 'btn', onclick: () => { ui.txLimit += 100; render(); } }, `Show more (${list.length - shown.length} left)`) : null);
}

// ---------- accounts ----------
function editAccount(existing) {
  const a = existing || { id: C.newId('acc'), name: '', type: 'Bank', openingBalance: 0 };
  openForm({
    title: existing ? 'Edit account' : 'Add account',
    values: a,
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'type', label: 'Type', type: 'select', options: opts(C.ACCOUNT_TYPES) },
      { name: 'openingBalance', label: 'Opening balance (INR)', type: 'number', step: '0.01', hint: 'Balance just before the opening date. Use a negative number for debt.' },
    ],
    validate: (v) => C.validateAccount({ ...a, ...v }),
    onSave: (v) => {
      const next = { ...a, ...v };
      state.accounts = existing ? state.accounts.map((x) => (x.id === a.id ? next : x)) : [...state.accounts, next];
      commit('Account saved');
    },
  });
}

function viewAccounts() {
  const an = C.analyze(state);
  const asOf = C.todayIso();
  const bal = C.accountBalances(state, an, asOf);
  return h('section', {},
    h('div', { class: 'toolbar' }, h('h1', {}, 'Accounts'), h('button', { class: 'btn primary', onclick: () => editAccount() }, '+ Add')),
    h('p', { class: 'muted' }, `Balances as of today (${fmtDate(asOf)}). Debt is shown as a negative balance.`),
    state.accounts.length === 0 ? emptyState('No accounts yet', 'Add your bank, wallet, cards and loans to start tracking.') : null,
    h('ul', { class: 'rows' }, state.accounts.map((a) => {
      const issues = an.accountIssues.get(a.id);
      const b = bal.get(a.id);
      const used = state.transactions.filter((t) => t.from === a.id || t.to === a.id).length;
      return h('li', { class: `row${issues ? ' bad' : ''}` },
        h('div', { class: 'row-main' }, h('strong', {}, a.name || '(unnamed)'), h('small', {}, `${a.type} · opening ${inr(a.openingBalance)}`), issues ? h('small', { class: 'issue' }, issues.join('; ')) : null),
        h('div', { class: `amt ${b < 0 ? 'neg' : ''}` }, b === undefined ? '—' : inr(C.fromPaise(b))),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', onclick: () => editAccount(a) }, 'Edit'),
          h('button', { class: 'btn small danger', onclick: () => {
            if (used) { toast(`Cannot delete: ${used} transaction(s) use this account.`); return; }
            if (confirm(`Delete account "${a.name}"?`)) { state.accounts = state.accounts.filter((x) => x.id !== a.id); commit('Deleted'); }
          } }, 'Delete')));
    })));
}

// ---------- investments ----------
function editHolding(existing) {
  const hd = existing || { id: '', provider: 'Manual', accountLabel: 'Main', instrumentId: '', name: '', assetClass: 'Equity', units: NaN, costBasis: NaN, price: NaN, priceDate: C.todayIso() };
  openForm({
    title: existing ? 'Edit holding' : 'Add holding',
    values: hd,
    fields: [
      { name: 'provider', label: 'Provider (e.g. Groww, Angel One)' },
      { name: 'accountLabel', label: 'Account label', hint: 'An alias, never a real account number.' },
      { name: 'instrumentId', label: 'Instrument ID', hint: 'Prefer the ISIN or exchange symbol.' },
      { name: 'name', label: 'Name' },
      { name: 'assetClass', label: 'Asset class', type: 'select', options: opts(C.ASSET_CLASSES) },
      { name: 'units', label: 'Units', type: 'number', step: 'any' },
      { name: 'costBasis', label: 'Total cost of remaining position (INR)', type: 'number', step: '0.01' },
      { name: 'price', label: 'Current price per unit (INR)', type: 'number', step: '0.0001' },
      { name: 'priceDate', label: 'Price date', type: 'date' },
    ],
    validate: (v) => {
      const next = { ...hd, ...v, id: `${v.provider}|${v.accountLabel}|${v.instrumentId}` };
      const errs = C.validateHoldingFields(next, null);
      if (state.holdings.some((x) => x.id === next.id && x.id !== hd.id)) errs.push('A position with this provider, account and instrument already exists');
      return errs;
    },
    onSave: (v) => {
      const next = { ...hd, ...v, id: `${v.provider}|${v.accountLabel}|${v.instrumentId}` };
      state.holdings = existing ? state.holdings.map((x) => (x.id === hd.id ? next : x)) : [...state.holdings, next];
      commit('Holding saved');
    },
  });
}

function viewInvestments() {
  const an = C.analyze(state);
  const asOf = C.todayIso();
  const pf = C.portfolio(state, an, asOf);
  const byClass = new Map();
  pf.rows.forEach((r) => byClass.set(r.holding.assetClass, (byClass.get(r.holding.assetClass) || 0) + C.fromPaise(r.value)));
  return h('section', {},
    h('div', { class: 'toolbar' }, h('h1', {}, 'Investments'), h('button', { class: 'btn primary', onclick: () => editHolding() }, '+ Add')),
    h('p', { class: 'muted' }, 'Manual snapshots or imported statements. Prices are not live; update the price date when you refresh them.'),
    h('div', { class: 'cards' },
      card('Market value', inr(C.fromPaise(pf.value))),
      card('Cost', inr(C.fromPaise(pf.cost))),
      card('Unrealised P/L', inr(C.fromPaise(pf.pl)), pf.pl >= 0 ? 'pos' : 'neg', 'Not a taxable gain')),
    pf.stale ? h('p', { class: 'banner warn' }, `${pf.stale} holding(s) have prices older than ${C.STALE_DAYS} days but are still included.`) : null,
    byClass.size ? panel('Allocation', allocation([...byClass.entries()].map(([label, value]) => ({ label, value })))) : null,
    state.holdings.length === 0 ? emptyState('No holdings yet', 'Add positions manually or import a downloaded holdings statement from the Data tab.') : null,
    h('ul', { class: 'rows' }, state.holdings.map((x) => {
      const issues = an.holdingIssues.get(x.id);
      const v = C.holdingValue(x);
      return h('li', { class: `row${issues ? ' bad' : ''}` },
        h('div', { class: 'row-main' }, h('strong', {}, x.name || x.instrumentId), h('small', {}, `${x.provider} · ${x.accountLabel} · ${x.units} units @ ${inr(x.price, 2)} · priced ${x.priceDate}`),
          issues ? h('small', { class: 'issue' }, `Excluded: ${issues.join('; ')}`) : null),
        h('div', { class: 'amt' }, Number.isFinite(v.value) ? inr(C.fromPaise(v.value)) : '—', h('small', { class: v.pl >= 0 ? 'pos' : 'neg' }, Number.isFinite(v.pl) ? `${v.pl >= 0 ? '+' : ''}${inr(C.fromPaise(v.pl))}` : '')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', onclick: () => editHolding(x) }, 'Edit'),
          h('button', { class: 'btn small danger', onclick: () => { if (confirm('Delete this holding?')) { state.holdings = state.holdings.filter((y) => y.id !== x.id); commit('Deleted'); } } }, 'Delete')));
    })));
}

// ---------- budgets ----------
function viewBudgets() {
  const an = C.analyze(state);
  const ym = ui.month;
  const spend = new Map(C.categorySpending(an, ym).map((c) => [c.category, c.amount]));
  const limits = new Map(state.budgets.map((b) => [b.category, b.limit]));
  const inputs = new Map();
  const cats = [...new Set([...C.EXPENSE_CATEGORIES, ...state.budgets.map((b) => b.category)])];
  return h('section', {},
    h('div', { class: 'toolbar' }, h('h1', {}, 'Budgets')),
    monthNav(),
    h('p', { class: 'muted' }, 'Monthly limit per category, compared with spending less refunds. Leave empty for no budget.'),
    h('ul', { class: 'rows' }, cats.map((c) => {
      const input = h('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', 'aria-label': `${c} monthly limit`, value: limits.has(c) ? limits.get(c) : '' });
      inputs.set(c, input);
      const s = spend.get(c) || 0; const l = limits.get(c);
      return h('li', { class: 'row' },
        h('div', { class: 'row-main' }, h('strong', {}, c), h('small', { class: l !== undefined && s > l ? 'issue' : '' }, `Spent ${inr(s)} in ${monthLabel(ym)}${l !== undefined ? (s > l ? ` · over by ${inr(s - l)}` : ` · ${inr(l - s)} left`) : ''}`)),
        input);
    })),
    h('button', { class: 'btn primary', onclick: () => {
      const next = [];
      for (const [c, input] of inputs) {
        if (input.value.trim() === '') continue;
        const n = Number(input.value);
        if (!Number.isFinite(n) || n < 0) { toast(`${c}: limit must be zero or more`); return; }
        next.push({ category: c, limit: n });
      }
      state.budgets = next;
      commit('Budgets saved');
    } }, 'Save budgets'));
}

// ---------- dashboard ----------
function dot(color) {
  const s = h('span', { class: 'dot' });
  s.style.background = color;
  return s;
}
function legend(entries) {
  return h('p', { class: 'legend-inline' }, entries.map(([color, text]) => h('span', { class: 'lg' }, dot(color), text)));
}
function card(label, value, cls = '', note = '', chip = null) {
  return h('div', { class: 'card' }, h('span', { class: 'card-label' }, label), h('strong', { class: `card-value ${cls}` }, value), chip, note ? h('small', {}, note) : null);
}
function panel(title, ...body) {
  return h('div', { class: 'panel' }, h('h2', {}, title), ...body);
}
function emptyState(title, text) {
  return h('div', { class: 'empty' }, h('strong', {}, title), h('p', {}, text));
}
// Percent change chip; `upIsGood` decides whether a rise is green or red.
function delta(cur, prev, upIsGood) {
  const p = C.pctChange(cur, prev);
  if (p === null) return null;
  const up = p >= 0;
  if (Math.abs(p) < 0.5) return h('span', { class: 'chip flat' }, 'No change vs last month');
  return h('span', { class: `chip ${up === upIsGood ? 'good' : 'bad'}` }, `${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs last month`);
}
function allocation(items, centre = 'total') {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, i) => a + i.value, 0);
  return h('div', { class: 'donut-wrap' },
    donut({ items: sorted, centre, label: `${centre}: ${sorted.map((i) => `${i.label} ${inr(i.value)}`).join(', ')}` }),
    h('ul', { class: 'legend' }, sorted.map((i, k) => h('li', {}, dot(COLORS[k % COLORS.length]), h('span', { class: 'lg-text' }, i.label), h('strong', {}, total ? `${((i.value / total) * 100).toFixed(0)}%` : '')))));
}
function monthNav() {
  const set = (ym) => { if (/^\d{4}-\d{2}$/.test(ym)) { ui.month = ym; render(); } };
  return h('div', { class: 'monthnav' },
    h('button', { class: 'btn small', 'aria-label': 'Previous month', onclick: () => set(C.addMonths(ui.month, -1)) }, '‹'),
    h('input', { type: 'month', value: ui.month, 'aria-label': 'Month', onchange: (e) => set(e.target.value) }),
    h('button', { class: 'btn small', 'aria-label': 'Next month', onclick: () => set(C.addMonths(ui.month, 1)) }, '›'));
}

function viewDashboard() {
  const an = C.analyze(state);
  const ym = ui.month; const asOf = C.monthEnd(ym); const year = Number(ym.slice(0, 4));
  const prevYm = C.addMonths(ym, -1);
  const totals = C.monthTotals(an, ym);
  const prevTotals = C.monthTotals(an, prevYm);
  const nw = C.netWorth(state, an, asOf);
  const series = C.yearSeries(state, an, year, asOf);
  const labels = series.map((s) => MONTH_ABBR[Number(s.ym.slice(5)) - 1]);
  const nwSeries = C.netWorthSeries(state, an, year, asOf);
  const rate = C.savingsRateSeries(series);
  const cats = C.categorySpending(an, ym);
  const compare = C.monthCompare(an, ym).slice(0, 7).map((c) => ({ label: c.category, current: c.current, previous: c.previous }));
  const budgets = C.budgetVsActual(state, an, ym);
  const pf = C.portfolio(state, an, asOf);
  const byClass = new Map();
  pf.rows.forEach((r) => byClass.set(r.holding.assetClass, (byClass.get(r.holding.assetClass) || 0) + C.fromPaise(r.value)));
  const empty = !state.accounts.length && !state.transactions.length;
  const saved = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : null;
  const positive = cats.filter((c) => c.amount > 0);
  const top = positive.slice(0, 5);
  const rest = positive.slice(5).reduce((a, c) => a + c.amount, 0);
  const share = [...top.map((c) => ({ label: c.category, value: c.amount })), ...(rest > 0 ? [{ label: 'Everything else', value: rest }] : [])];

  return h('section', {},
    h('div', { class: 'toolbar' }, h('div', {}, h('h1', {}, 'Dashboard'), h('p', { class: 'muted tight' }, `Your money in ${monthLabel(ym)}`)), monthNav()),
    empty ? h('div', { class: 'empty' }, h('strong', {}, "Welcome to BubuDudu's Finance"), h('p', {}, 'Everything stays on this device. Start by adding an account, or explore with fictional sample data.'),
      h('div', { class: 'actions center' }, h('button', { class: 'btn primary', onclick: () => { state = C.sampleState(Number(C.todayIso().slice(0, 4))); ui.month = `${C.todayIso().slice(0, 4)}-03`; commit('Sample data loaded'); } }, 'Load sample data'),
        h('button', { class: 'btn', onclick: () => { ui.view = 'accounts'; render(); } }, 'Add my first account'))) : null,
    an.invalidCount ? h('p', { class: 'banner warn' }, `${an.invalidCount} row(s) have problems and are excluded, so totals are provisional. Look for red rows in Activity, Accounts and Invest.`) : null,
    h('div', { class: 'cards' },
      h('div', { class: 'card hero' },
        h('span', { class: 'card-label' }, 'Net worth'),
        h('strong', { class: 'card-value big' }, inr(nw.netWorth)),
        h('small', {}, `as of ${fmtDate(asOf)}`),
        h('div', { class: 'hero-parts' },
          h('span', {}, h('small', {}, 'Accounts'), h('strong', {}, inr(nw.assets))),
          h('span', {}, h('small', {}, 'Investments'), h('strong', {}, inr(nw.investments))),
          h('span', {}, h('small', {}, 'Debt'), h('strong', {}, `-${inr(nw.liabilities)}`)))),
      card('Income', inr(totals.income), '', monthLabel(ym), delta(totals.income, prevTotals.income, true)),
      card('Expenses', inr(totals.expense), '', 'Net of refunds', delta(totals.expense, prevTotals.expense, false)),
      card('Income less expenses', inr(totals.net), totals.net >= 0 ? 'pos' : 'neg', saved === null ? 'Excludes transfers and investing' : `${saved}% of income kept`, delta(totals.net, prevTotals.net, true))),
    h('div', { class: 'grid' },
      panel(`Income vs expenses, ${year}`,
        groupedBars({
          labels,
          series: [{ name: 'Income', color: C_INCOME, values: series.map((s) => s.income) }, { name: 'Expenses', color: C_EXPENSE, values: series.map((s) => s.expense) }],
          label: `Monthly income and expenses for ${year}`,
        }),
        legend([[C_INCOME, 'Income'], [C_EXPENSE, 'Expenses']]), h('small', { class: 'muted' }, 'Future months are not forecast.')),
      panel(`Net worth trend, ${year}`,
        lineChart({ labels, series: [{ name: 'Net worth', color: C_INCOME, area: true, values: nwSeries.map((s) => s.value) }], label: `Net worth at each month end of ${year}` }),
        h('small', { class: 'muted' }, 'Investments count from their price date, so a first snapshot shows as a step.')),
      panel('Savings rate',
        lineChart({ labels, series: [{ name: 'Savings rate', color: COLORS[5], area: true, values: rate.map((s) => s.value) }], label: `Share of income kept each month of ${year}`, fmt: (v) => `${v}%`, zeroLine: true }),
        h('small', { class: 'muted' }, 'Income less expenses as a share of income. Months without income are skipped.')),
      panel(`${monthLabel(ym)} vs ${monthLabel(prevYm)}`,
        compare.length ? [compareBars({ items: compare, label: 'Category spending this month compared with last month' }),
          legend([[C_PREV, monthLabel(prevYm)], [COLORS[0], monthLabel(ym)]])] : h('p', { class: 'muted' }, 'No spending in either month yet.')),
      panel('Where the money went', share.length ? allocation(share, 'spent') : h('p', { class: 'muted' }, 'No spending this month.')),
      panel('Budget vs actual', budgets.length ? [hBars({ items: budgets.map((b) => ({ label: b.category, value: b.actual, limit: b.limit, over: b.over })), label: 'Budget versus actual spending' }), h('small', { class: 'muted' }, 'The tick marks each limit; red bars are over budget.')] : h('p', { class: 'muted' }, 'Set monthly limits in Budgets.')),
      panel('Investment allocation', byClass.size ? allocation([...byClass.entries()].map(([label, value]) => ({ label, value })), 'invested') : h('p', { class: 'muted' }, 'No investment snapshots as of this date.')),
      panel('Net worth components',
        hBars({ items: [{ label: 'Account assets', value: nw.assets }, { label: 'Investments', value: nw.investments, color: C_EXPENSE }, { label: 'Debt', value: nw.liabilities, over: true }], label: 'Assets, investments and debt' }),
        h('p', { class: 'muted' }, `Net worth = assets + investments − debt = ${inr(nw.netWorth)}`),
        nw.staleHoldings ? h('p', { class: 'banner warn' }, `${nw.staleHoldings} holding price(s) are stale.`) : null)));
}

// ---------- data: import, export, settings ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MAX_FILE = 5 * 1024 * 1024;
async function readFile(file) {
  if (file.size > MAX_FILE) throw new Error('File is larger than 5 MB');
  return file.text();
}

const TX_FIELDS = [['date', 'Date'], ['amount', 'Amount (signed)'], ['debit', 'Debit / withdrawal'], ['credit', 'Credit / deposit'], ['payee', 'Description'], ['type', 'Type (optional)'], ['category', 'Category (optional)'], ['externalId', 'Reference / ID']];
const HOLD_FIELDS = [['instrumentId', 'ISIN / symbol'], ['name', 'Name'], ['units', 'Quantity'], ['costBasis', 'Total invested'], ['avgPrice', 'Average price'], ['price', 'Current price'], ['priceDate', 'Price date'], ['assetClass', 'Asset class']];

function importPanel() {
  const fileInput = h('input', {
    type: 'file', accept: '.csv,text/csv', 'aria-label': 'Choose CSV file',
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const rows = C.parseCSV(await readFile(f));
        if (rows.length < 2) throw new Error('No data rows found');
        const kind = ui.impKind || 'transactions';
        const headers = rows[0];
        ui.imp = { kind, file: f.name, headers, rows: rows.slice(1), map: C.guessMapping(headers, (kind === 'transactions' ? TX_FIELDS : HOLD_FIELDS).map((x) => x[0])), accountId: state.accounts[0]?.id || '', source: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Import', provider: 'Groww', accountLabel: 'Main', preview: null };
        render();
      } catch (err) { toast(`Could not read file: ${err.message}`); }
    },
  });
  const kindSel = h('select', { 'aria-label': 'Import type', onchange: (e) => { ui.imp = null; ui.impKind = e.target.value; render(); } },
    h('option', { value: 'transactions', ...((ui.impKind || 'transactions') === 'transactions' ? { selected: true } : {}) }, 'Bank / card statement (transactions)'),
    h('option', { value: 'holdings', ...(ui.impKind === 'holdings' ? { selected: true } : {}) }, 'Broker holdings (Groww, Angel One, other)'));
  const kind = ui.impKind || 'transactions';
  const parts = [h('div', { class: 'import-pick' }, kindSel, fileInput)];
  const cur = ui.imp;
  if (cur) {
    const fields = kind === 'transactions' ? TX_FIELDS : HOLD_FIELDS;
    parts.push(h('p', { class: 'muted' }, `${cur.file}: ${cur.rows.length} data row(s). Check the column mapping, then preview.`));
    parts.push(h('div', { class: 'mapping' }, fields.map(([f, label]) => h('label', { class: 'field' }, h('span', {}, label),
      h('select', { onchange: (e) => { cur.map[f] = Number(e.target.value); cur.preview = null; } },
        h('option', { value: -1 }, '(none)'), cur.headers.map((hd, i) => h('option', { value: i, ...(cur.map[f] === i ? { selected: true } : {}) }, hd)))))));
    if (kind === 'transactions') {
      parts.push(h('div', { class: 'mapping' },
        h('label', { class: 'field' }, h('span', {}, 'Account this statement belongs to'), h('select', { onchange: (e) => { cur.accountId = e.target.value; cur.preview = null; } }, accountOpts('Select account').map((o) => h('option', { value: o.value, ...(o.value === cur.accountId ? { selected: true } : {}) }, o.label)))),
        h('label', { class: 'field' }, h('span', {}, 'Source label'), h('input', { value: cur.source, oninput: (e) => { cur.source = e.target.value; cur.preview = null; } }))));
      parts.push(h('p', { class: 'muted' }, 'Negative amounts or debit columns become Expenses, positive/credits become Income. Edit afterwards to mark transfers or card repayments.'));
    } else {
      parts.push(h('div', { class: 'mapping' },
        h('label', { class: 'field' }, h('span', {}, 'Provider'), h('input', { value: cur.provider, oninput: (e) => { cur.provider = e.target.value; cur.preview = null; } })),
        h('label', { class: 'field' }, h('span', {}, 'Account label (alias)'), h('input', { value: cur.accountLabel, oninput: (e) => { cur.accountLabel = e.target.value; cur.preview = null; } }))));
    }
    parts.push(h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => { ui.imp = null; render(); } }, 'Clear'),
      h('button', { class: 'btn primary', onclick: () => {
        cur.preview = kind === 'transactions'
          ? C.buildTransactionImport(cur.rows, cur.map, { accountId: cur.accountId, source: cur.source.trim() }, state)
          : C.buildHoldingImport(cur.rows, cur.map, { provider: cur.provider.trim(), accountLabel: cur.accountLabel.trim(), today: C.todayIso() }, state);
        cur.preview.forEach((p) => { p.keep = p.status === 'new' || p.status === 'update'; });
        render();
      } }, 'Preview')));
    if (cur.preview) parts.push(previewTable(cur));
  }
  return panel('Import a downloaded statement', h('p', { class: 'muted' }, 'Files are read on this device only; nothing is uploaded. Download statements from your bank or broker, then map the columns.'), ...parts);
}

function previewTable(cur) {
  const p = cur.preview;
  const isTx = cur.kind === 'transactions';
  const counts = p.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
  const chosen = () => p.filter((i) => i.keep);
  return h('div', {},
    h('p', {}, Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Import'), h('th', {}, 'Status'), isTx ? [h('th', {}, 'Date'), h('th', {}, 'Type'), h('th', {}, 'Description'), h('th', {}, 'Amount')] : [h('th', {}, 'Instrument'), h('th', {}, 'Units'), h('th', {}, 'Cost'), h('th', {}, 'Price')], h('th', {}, 'Notes'))),
      h('tbody', {}, p.slice(0, 200).map((i) => h('tr', { class: i.status === 'invalid' ? 'bad' : '' },
        h('td', {}, h('input', { type: 'checkbox', 'aria-label': `Import line ${i.line}`, checked: i.keep, disabled: i.status === 'invalid', onchange: (e) => { i.keep = e.target.checked; } })),
        h('td', {}, i.status),
        isTx ? [h('td', {}, i.tx.date || '—'), h('td', {}, i.tx.type || '—'), h('td', {}, i.tx.payee), h('td', {}, Number.isFinite(i.tx.amount) ? inr(i.tx.amount) : '—')]
          : [h('td', {}, i.holding.name || i.holding.instrumentId), h('td', {}, String(i.holding.units)), h('td', {}, String(i.holding.costBasis)), h('td', {}, String(i.holding.price))],
        h('td', {}, i.errors.join('; ') || (i.status === 'duplicate' ? 'Looks already imported' : '')))))),
      p.length > 200 ? h('caption', {}, 'Showing first 200 rows; all rows are processed.') : null),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => {
      const sel = chosen();
      if (!sel.length) { toast('Nothing selected'); return; }
      if (isTx) state.transactions = [...state.transactions, ...sel.map((i) => i.tx)];
      else {
        const ids = new Set(sel.map((i) => i.holding.id));
        state.holdings = [...state.holdings.filter((x) => !ids.has(x.id)), ...sel.map((i) => i.holding)];
      }
      ui.imp = null;
      commit(`Imported ${sel.length} row(s)`);
    } }, 'Import selected')));
}

function viewData() {
  const exportBtn = (key, label) => h('button', { class: 'btn', onclick: () => download(C.EXPORTS[key].file, C.toCSV(C.EXPORTS[key].headers, C.EXPORTS[key].rows(state)), 'text/csv') }, label);
  const openingInput = h('input', { type: 'date', value: state.settings.openingDate, 'aria-label': 'Opening date' });
  return h('section', {},
    h('div', { class: 'toolbar' }, h('h1', {}, 'Data & settings')),
    panel('Settings',
      h('div', { class: 'mapping' }, h('label', { class: 'field' }, h('span', {}, 'Opening date'), openingInput, h('small', {}, 'Account opening balances apply just before this date; earlier transactions are excluded.'))),
      h('button', { class: 'btn', onclick: () => {
        if (!C.isIsoDate(openingInput.value)) { toast('Enter a valid date'); return; }
        state.settings.openingDate = openingInput.value; commit('Opening date saved');
      } }, 'Save settings')),
    importPanel(),
    panel('Export for Excel, Power BI and Looker Studio',
      h('p', { class: 'muted' }, 'Open standard CSV files. Load them into Power BI Desktop (Get data > Text/CSV) or Looker Studio (File upload or Google Sheets). cashflow_fact.csv is a ready-made flat table with signed amounts.'),
      h('div', { class: 'actions wrap' }, exportBtn('cashflow_fact', 'cashflow_fact.csv'), exportBtn('transactions', 'Transactions'), exportBtn('accounts', 'Accounts'), exportBtn('holdings', 'Holdings'), exportBtn('budgets', 'Budgets'))),
    panel('Backup and restore',
      h('p', { class: 'muted' }, 'The backup is plain JSON and is not encrypted. Keep it somewhere private.'),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn', onclick: () => download(`finance-backup-${C.todayIso()}.json`, JSON.stringify(state, null, 2), 'application/json') }, 'Download backup'),
        h('label', { class: 'btn' }, 'Restore backup', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const next = C.normalizeState(JSON.parse(await readFile(f)));
            if (confirm('Replace ALL current data with this backup?')) { state = next; commit('Backup restored'); }
          } catch (err) { toast(`Could not restore: ${err.message}`); }
        } })),
        h('button', { class: 'btn', onclick: () => { if (confirm('Load fictional sample data? This replaces your current data.')) { state = C.sampleState(Number(C.todayIso().slice(0, 4))); ui.month = `${C.todayIso().slice(0, 4)}-03`; commit('Sample data loaded'); } } }, 'Load sample data'),
        h('button', { class: 'btn danger', onclick: () => { if (confirm('Erase ALL data on this device? This cannot be undone.')) { store.clear(); state = C.emptyState(); commit('All data erased'); } } }, 'Erase everything'))),
    panel('Connected services',
      h('ul', { class: 'services' },
        h('li', {}, h('strong', {}, 'Groww, Angel One and other brokers'), h('p', { class: 'muted' }, 'Today: import their downloaded holdings and statements above. Live sync needs each provider\'s authorised API access and a server component, which is planned (read-only). This app never asks for broker passwords, OTPs or API keys.')),
        h('li', {}, h('strong', {}, 'Power BI / Looker'), h('p', { class: 'muted' }, 'Use the CSV exports now. For scheduled refresh, a server database with read-only reporting views is the planned path.')))),
    h('p', { class: 'muted' }, 'Privacy: data is stored only in this browser (localStorage), without accounts, analytics or uploads. Clearing site data erases it, so take backups. This is a tracking tool, not investment or tax advice.'));
}

// ---------- shell ----------
const VIEWS = { dashboard: viewDashboard, transactions: viewTransactions, accounts: viewAccounts, investments: viewInvestments, budgets: viewBudgets, data: viewData };

function render() {
  const keep = ui.txFocus ? document.activeElement : null;
  main.replaceChildren(VIEWS[ui.view]());
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'));
  if (keep && ui.view === 'transactions') {
    const s = main.querySelector('input[type=search]');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    ui.txFocus = false;
  }
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  ui.view = b.dataset.view; location.hash = ui.view; render(); window.scrollTo(0, 0);
}));
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== ui.view) { ui.view = v; render(); } });
if (VIEWS[location.hash.slice(1)]) ui.view = location.hash.slice(1);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
// Open on the most recent month with activity so the dashboard is not empty after a quiet month.
const latestTxMonth = state.transactions.map((t) => C.monthOf(t.date || '')).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().pop();
if (latestTxMonth && !state.transactions.some((t) => C.monthOf(t.date || '') === ui.month)) ui.month = latestTxMonth;
render();
