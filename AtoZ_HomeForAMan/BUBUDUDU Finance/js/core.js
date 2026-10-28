// Pure financial logic: no DOM, no storage. Money is computed in integer paise.
// Semantics follow deliverables/Requirements_and_Architecture.md section 4.

export const TX_TYPES = ['Income', 'Expense', 'Refund', 'Transfer', 'Investment Buy', 'Investment Sell'];
export const ACCOUNT_TYPES = ['Bank', 'Cash', 'Credit Card', 'Loan', 'Wallet', 'Brokerage Cash', 'Other'];
export const ASSET_CLASSES = ['Equity', 'Mutual Fund', 'ETF', 'Bond', 'Gold', 'Crypto', 'Other'];
export const EXPENSE_CATEGORIES = [
  'Housing', 'Groceries', 'Food & Dining', 'Transport', 'Utilities', 'Health', 'Insurance',
  'Education', 'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Fees & Charges',
  'Gifts & Donations', 'Taxes', 'Other',
];
export const INCOME_CATEGORIES = ['Salary', 'Business', 'Interest', 'Dividends', 'Rental', 'Gift', 'Other Income'];
export const STALE_DAYS = 7;

// [fromRequired, toRequired, categoryRequired]
const LEGS = {
  'Income': [false, true, true],
  'Expense': [true, false, true],
  'Refund': [false, true, true],
  'Transfer': [true, true, false],
  'Investment Buy': [true, false, false],
  'Investment Sell': [false, true, false],
};

export const toPaise = (n) => Math.round(Number(n) * 100);
export const fromPaise = (p) => p / 100;

export function emptyState() {
  return {
    version: 1,
    settings: { openingDate: `${new Date().getFullYear()}-01-01`, currency: 'INR' },
    accounts: [],
    transactions: [],
    holdings: [],
    budgets: [],
  };
}

export function newId(prefix) {
  const rnd = (globalThis.crypto && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return `${prefix}-${rnd}`;
}

// ---------- dates ----------
export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const monthOf = (iso) => iso.slice(0, 7);
export function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- validation ----------
function pushIssue(map, id, msg) {
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(msg);
}

export function validateAccount(a) {
  const errs = [];
  if (!a.name || !String(a.name).trim()) errs.push('Name is required');
  if (!ACCOUNT_TYPES.includes(a.type)) errs.push('Unknown account type');
  if (!Number.isFinite(a.openingBalance)) errs.push('Opening balance must be a number');
  return errs;
}

export function validateTransactionFields(tx, validAccountIds, openingDate) {
  const errs = [];
  if (!isIsoDate(tx.date)) errs.push('Date must be a real date');
  else if (openingDate && tx.date < openingDate) errs.push(`Dated before the opening date ${openingDate}`);
  const leg = LEGS[tx.type];
  if (!leg) { errs.push('Unknown type'); return errs; }
  if (!Number.isFinite(tx.amount) || tx.amount <= 0) errs.push('Amount must be greater than zero');
  const [fromReq, toReq, catReq] = leg;
  if (fromReq && !tx.from) errs.push('From account is required');
  if (!fromReq && tx.from) errs.push(`${tx.type} must not have a From account`);
  if (toReq && !tx.to) errs.push('To account is required');
  if (!toReq && tx.to) errs.push(`${tx.type} must not have a To account`);
  if (tx.from && !validAccountIds.has(tx.from)) errs.push('From account not found');
  if (tx.to && !validAccountIds.has(tx.to)) errs.push('To account not found');
  if (tx.type === 'Transfer' && tx.from && tx.from === tx.to) errs.push('Transfer needs two different accounts');
  if (catReq && !(tx.category && String(tx.category).trim())) errs.push('Category is required');
  return errs;
}

export function validateHoldingFields(h, asOf) {
  const errs = [];
  if (!h.instrumentId || !String(h.instrumentId).trim()) errs.push('Instrument is required');
  if (!Number.isFinite(h.units) || h.units <= 0) errs.push('Units must be greater than zero');
  if (!Number.isFinite(h.costBasis) || h.costBasis < 0) errs.push('Cost basis must be zero or more');
  if (!Number.isFinite(h.price) || h.price < 0) errs.push('Price must be zero or more');
  if (!isIsoDate(h.priceDate)) errs.push('Price date must be a real date');
  else if (asOf && h.priceDate > asOf) errs.push('Price date is after the as-of date');
  return errs;
}

// Invalid rows are excluded from every total, never silently corrected.
export function analyze(state) {
  const accountIssues = new Map();
  const txIssues = new Map();
  const holdingIssues = new Map();
  const seenAcc = new Map();
  for (const a of state.accounts) seenAcc.set(a.id, (seenAcc.get(a.id) || 0) + 1);
  const validAccounts = [];
  for (const a of state.accounts) {
    const errs = validateAccount(a);
    if (seenAcc.get(a.id) > 1) errs.push('Duplicate account ID');
    errs.forEach((e) => pushIssue(accountIssues, a.id, e));
    if (!errs.length) validAccounts.push(a);
  }
  const validIds = new Set(validAccounts.map((a) => a.id));

  const idCount = new Map();
  const extCount = new Map();
  const extKey = (t) => (t.source && t.externalId ? `${t.source}\u0000${t.externalId}` : null);
  for (const t of state.transactions) {
    idCount.set(t.id, (idCount.get(t.id) || 0) + 1);
    const k = extKey(t);
    if (k) extCount.set(k, (extCount.get(k) || 0) + 1);
  }
  const validTx = [];
  for (const t of state.transactions) {
    const errs = validateTransactionFields(t, validIds, state.settings.openingDate);
    if (idCount.get(t.id) > 1) errs.push('Duplicate transaction ID');
    const k = extKey(t);
    if (k && extCount.get(k) > 1) errs.push('Duplicate Source + External ID');
    errs.forEach((e) => pushIssue(txIssues, t.id, e));
    if (!errs.length) validTx.push(t);
  }

  const posCount = new Map();
  for (const h of state.holdings) posCount.set(h.id, (posCount.get(h.id) || 0) + 1);
  for (const h of state.holdings) {
    const errs = validateHoldingFields(h, null);
    if (posCount.get(h.id) > 1) errs.push('Duplicate position');
    errs.forEach((e) => pushIssue(holdingIssues, h.id, e));
  }

  const budgetIssues = new Map();
  const bCount = new Map();
  for (const b of state.budgets) bCount.set(b.category, (bCount.get(b.category) || 0) + 1);
  for (const b of state.budgets) {
    if (!b.category) pushIssue(budgetIssues, b.category, 'Category is required');
    if (!Number.isFinite(b.limit) || b.limit < 0) pushIssue(budgetIssues, b.category, 'Limit must be zero or more');
    if (bCount.get(b.category) > 1) pushIssue(budgetIssues, b.category, 'Duplicate category');
  }

  const invalidCount = accountIssues.size + txIssues.size + holdingIssues.size + budgetIssues.size;
  return { validAccounts, validIds, validTx, accountIssues, txIssues, holdingIssues, budgetIssues, invalidCount };
}

// ---------- balances and net worth ----------
export function accountBalances(state, an, asOf) {
  const bal = new Map(an.validAccounts.map((a) => [a.id, toPaise(a.openingBalance)]));
  for (const t of an.validTx) {
    if (t.date > asOf) continue;
    const p = toPaise(t.amount);
    if (t.from) bal.set(t.from, bal.get(t.from) - p);
    if (t.to) bal.set(t.to, bal.get(t.to) + p);
  }
  return bal;
}

export function holdingValue(h) {
  const value = Math.round(h.units * h.price * 100);
  const cost = toPaise(h.costBasis);
  return { value, cost, pl: value - cost };
}

export function portfolio(state, an, asOf) {
  const rows = [];
  let value = 0; let cost = 0; let stale = 0;
  for (const h of state.holdings) {
    if (an.holdingIssues.has(h.id) || h.priceDate > asOf) continue;
    const v = holdingValue(h);
    const isStale = daysBetween(h.priceDate, asOf) > STALE_DAYS;
    if (isStale) stale += 1;
    rows.push({ holding: h, ...v, stale: isStale });
    value += v.value; cost += v.cost;
  }
  return { rows, value, cost, pl: value - cost, stale };
}

export function netWorth(state, an, asOf) {
  const bal = accountBalances(state, an, asOf);
  let assets = 0; let liabilities = 0;
  for (const v of bal.values()) { if (v >= 0) assets += v; else liabilities += -v; }
  const pf = portfolio(state, an, asOf);
  return {
    assets: fromPaise(assets),
    liabilities: fromPaise(liabilities),
    investments: fromPaise(pf.value),
    netWorth: fromPaise(assets - liabilities + pf.value),
    staleHoldings: pf.stale,
  };
}

// ---------- income and spending ----------
export function monthTotals(an, ym) {
  let income = 0; let expense = 0;
  for (const t of an.validTx) {
    if (monthOf(t.date) !== ym) continue;
    const p = toPaise(t.amount);
    if (t.type === 'Income') income += p;
    else if (t.type === 'Expense') expense += p;
    else if (t.type === 'Refund') expense -= p;
  }
  return { income: fromPaise(income), expense: fromPaise(expense), net: fromPaise(income - expense) };
}

// Months before the opening date or after asOf are null (omitted, not zero).
export function yearSeries(state, an, year, asOf) {
  const open = state.settings.openingDate;
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    if (ym > monthOf(asOf) || monthEnd(ym) < open) out.push({ ym, income: null, expense: null, net: null });
    else out.push({ ym, ...monthTotals(an, ym) });
  }
  return out;
}

export function categorySpending(an, ym) {
  const m = new Map();
  for (const t of an.validTx) {
    if (monthOf(t.date) !== ym) continue;
    const p = toPaise(t.amount);
    if (t.type === 'Expense') m.set(t.category, (m.get(t.category) || 0) + p);
    else if (t.type === 'Refund') m.set(t.category, (m.get(t.category) || 0) - p);
  }
  return [...m.entries()].map(([category, p]) => ({ category, amount: fromPaise(p) }))
    .sort((a, b) => b.amount - a.amount);
}

export function budgetVsActual(state, an, ym) {
  const spend = new Map(categorySpending(an, ym).map((c) => [c.category, c.amount]));
  return state.budgets
    .filter((b) => !an.budgetIssues.has(b.category))
    .map((b) => {
      const actual = spend.get(b.category) || 0;
      return { category: b.category, limit: b.limit, actual, over: actual > b.limit };
    })
    .sort((a, b) => b.actual - a.actual);
}

// Net worth at each month end. Holdings count only from their price date, so a first
// snapshot appears as a step in the line; months outside the period are null.
export function netWorthSeries(state, an, year, asOf) {
  const open = state.settings.openingDate;
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    if (ym > monthOf(asOf) || monthEnd(ym) < open) return { ym, value: null };
    return { ym, value: netWorth(state, an, monthEnd(ym)).netWorth };
  });
}

// Share of income kept, in percent; null when there is no income to divide by.
export function savingsRateSeries(series) {
  return series.map((s) => ({
    ym: s.ym,
    value: s.income !== null && s.income > 0 ? Math.round(((s.income - s.expense) / s.income) * 1000) / 10 : null,
  }));
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// Spending per category for a month next to the month before, largest first.
export function monthCompare(an, ym) {
  const cur = new Map(categorySpending(an, ym).map((c) => [c.category, c.amount]));
  const prev = new Map(categorySpending(an, addMonths(ym, -1)).map((c) => [c.category, c.amount]));
  return [...new Set([...cur.keys(), ...prev.keys()])]
    .map((category) => ({ category, current: cur.get(category) || 0, previous: prev.get(category) || 0 }))
    .sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous));
}

// ---------- CSV ----------
export function parseCSV(text) {
  const s = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// Text cells that start with = + - @ could run as formulas in Excel; numbers are untouched.
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(headers, rows) {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export const EXPORTS = {
  accounts: {
    file: 'accounts.csv', headers: ['AccountID', 'Name', 'Type', 'OpeningBalance'],
    rows: (s) => s.accounts.map((a) => [a.id, a.name, a.type, a.openingBalance]),
  },
  transactions: {
    file: 'transactions.csv',
    headers: ['TransactionID', 'Date', 'Type', 'Category', 'FromAccountID', 'ToAccountID', 'Amount', 'Payee', 'Source', 'ExternalID'],
    rows: (s) => s.transactions.map((t) => [t.id, t.date, t.type, t.category, t.from, t.to, t.amount, t.payee, t.source, t.externalId]),
  },
  holdings: {
    file: 'holdings.csv',
    headers: ['PositionID', 'Provider', 'AccountLabel', 'InstrumentID', 'Name', 'AssetClass', 'Units', 'CostBasis', 'Price', 'PriceDate'],
    rows: (s) => s.holdings.map((h) => [h.id, h.provider, h.accountLabel, h.instrumentId, h.name, h.assetClass, h.units, h.costBasis, h.price, h.priceDate]),
  },
  budgets: {
    file: 'budgets.csv', headers: ['Category', 'MonthlyLimit'],
    rows: (s) => s.budgets.map((b) => [b.category, b.limit]),
  },
  // Flat, signed fact table for Power BI / Looker Studio: one row per valid cash movement leg.
  cashflow_fact: {
    file: 'cashflow_fact.csv',
    headers: ['TransactionID', 'Date', 'Year', 'Month', 'Type', 'Category', 'Account', 'Direction', 'SignedAmount', 'IncomeExpenseEffect', 'Payee', 'Source'],
    rows: (s) => {
      const an = analyze(s);
      const name = new Map(s.accounts.map((a) => [a.id, a.name]));
      const out = [];
      for (const t of an.validTx) {
        const effect = t.type === 'Income' ? t.amount : t.type === 'Expense' ? -t.amount : t.type === 'Refund' ? t.amount : 0;
        const base = [t.id, t.date, t.date.slice(0, 4), t.date.slice(5, 7), t.type, t.category];
        const tail = [t.payee, t.source];
        if (t.from) out.push([...base, name.get(t.from), 'Out', -t.amount, effect, ...tail]);
        if (t.to) out.push([...base, name.get(t.to), 'In', t.amount, t.from ? 0 : effect, ...tail]);
      }
      return out;
    },
  },
};

// ---------- statement import ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Day-first for ambiguous numeric dates (Indian statements).
export function parseDateLoose(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const mk = (y, m, d) => {
    if (y < 100) y += 2000;
    const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : null;
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) return mk(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

// Returns a signed number; "Dr"/parentheses/leading minus are negative. null if unparseable.
export function parseAmountLoose(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\bdr\.?$/i.test(s)) { neg = true; s = s.replace(/\s*dr\.?$/i, ''); }
  s = s.replace(/\s*cr\.?$/i, '').replace(/(\u20B9|rs\.?|inr)/gi, '').replace(/[,\s]/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

const SYNONYMS = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'trade date', 'order execution time'],
  amount: ['amount', 'txn amount', 'transaction amount', 'value'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'dr', 'paid out'],
  credit: ['credit', 'deposit', 'deposit amt', 'cr', 'paid in'],
  payee: ['payee', 'description', 'narration', 'particulars', 'details', 'remarks'],
  type: ['type', 'transaction type', 'txn type'],
  category: ['category'],
  externalId: ['reference', 'ref no', 'ref', 'chq/ref no', 'transaction id', 'txn id', 'utr', 'externalid', 'order id'],
  instrumentId: ['isin', 'instrument', 'symbol', 'instrumentid', 'scrip', 'trading symbol'],
  name: ['name', 'stock name', 'scheme name', 'company', 'security name'],
  units: ['units', 'quantity', 'qty', 'quantity available', 'balance units'],
  costBasis: ['costbasis', 'invested value', 'total cost', 'invested amount', 'buy value', 'cost'],
  avgPrice: ['average price', 'avg price', 'average buy price', 'avg. buy price', 'average buying price', 'avg cost'],
  price: ['price', 'ltp', 'closing price', 'current price', 'nav', 'last price'],
  priceDate: ['pricedate', 'price date', 'as on', 'as of'],
  assetClass: ['assetclass', 'asset class', 'asset type'],
};

export function guessMapping(headers, fields) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map = {};
  for (const f of fields) {
    const idx = norm.findIndex((h) => SYNONYMS[f].includes(h));
    map[f] = idx;
  }
  return map;
}

const cell = (row, i) => (i >= 0 && i < row.length ? row[i].trim() : '');

const fingerprint = (t) => [t.date, toPaise(t.amount), t.type, (t.payee || '').trim().toLowerCase(), t.from || t.to].join('|');

// Builds import candidates; never mutates state. status: new | duplicate | invalid.
export function buildTransactionImport(rows, map, opts, state) {
  const { accountId, source } = opts;
  const validIds = new Set(state.accounts.map((a) => a.id));
  const existingExt = new Set(state.transactions.filter((t) => t.source && t.externalId).map((t) => `${t.source}\u0000${t.externalId}`));
  const existingFp = new Map();
  for (const t of state.transactions) existingFp.set(fingerprint(t), (existingFp.get(fingerprint(t)) || 0) + 1);
  const items = [];
  rows.forEach((row, i) => {
    const errors = [];
    const date = parseDateLoose(cell(row, map.date));
    let signed = null;
    if (map.debit >= 0 || map.credit >= 0) {
      const d = parseAmountLoose(cell(row, map.debit));
      const c = parseAmountLoose(cell(row, map.credit));
      if (d) signed = -Math.abs(d); else if (c) signed = Math.abs(c);
    } else signed = parseAmountLoose(cell(row, map.amount));
    const typeText = cell(row, map.type).toLowerCase();
    let type = TX_TYPES.find((t) => t.toLowerCase() === typeText);
    if (!type && signed !== null && signed !== 0) type = signed < 0 ? 'Expense' : 'Income';
    if (/^(dr|debit)$/.test(typeText) && !type) type = 'Expense';
    if (/^(cr|credit)$/.test(typeText) && !type) type = 'Income';
    const amount = signed === null ? NaN : Math.abs(signed);
    const tx = {
      id: newId('t'), date, type, amount,
      category: cell(row, map.category) || (type === 'Income' ? 'Other Income' : type === 'Expense' || type === 'Refund' ? 'Other' : ''),
      from: ['Expense', 'Transfer', 'Investment Buy'].includes(type) ? accountId : '',
      to: ['Income', 'Refund', 'Investment Sell'].includes(type) ? accountId : '',
      payee: cell(row, map.payee), source, externalId: cell(row, map.externalId),
    };
    if (!date) errors.push('Unreadable date');
    errors.push(...validateTransactionFields({ ...tx, date: date || '' }, validIds, state.settings.openingDate)
      .filter((e) => !(e === 'Date must be a real date' && !date)));
    let status = errors.length ? 'invalid' : 'new';
    if (status === 'new') {
      const k = tx.source && tx.externalId ? `${tx.source}\u0000${tx.externalId}` : null;
      const fp = fingerprint(tx);
      if (k && existingExt.has(k)) status = 'duplicate';
      else if (!k && existingFp.get(fp) > 0) { status = 'duplicate'; existingFp.set(fp, existingFp.get(fp) - 1); }
      if (k) existingExt.add(k);
    }
    items.push({ line: i + 2, tx, status, errors });
  });
  return items;
}

export function buildHoldingImport(rows, map, opts, state) {
  const { provider, accountLabel, today } = opts;
  const existing = new Set(state.holdings.map((h) => h.id));
  return rows.map((row, i) => {
    const units = parseAmountLoose(cell(row, map.units));
    const price = parseAmountLoose(cell(row, map.price));
    let cost = parseAmountLoose(cell(row, map.costBasis));
    if (cost === null) {
      const avg = parseAmountLoose(cell(row, map.avgPrice));
      if (avg !== null && units !== null) cost = Math.round(avg * units * 100) / 100;
    }
    const instrumentId = cell(row, map.instrumentId);
    const h = {
      id: `${provider}|${accountLabel}|${instrumentId}`, provider, accountLabel, instrumentId,
      name: cell(row, map.name), assetClass: ASSET_CLASSES.find((a) => a.toLowerCase() === cell(row, map.assetClass).toLowerCase()) || 'Equity',
      units: units ?? NaN, costBasis: cost ?? NaN, price: price ?? NaN,
      priceDate: parseDateLoose(cell(row, map.priceDate)) || today,
    };
    const errors = validateHoldingFields(h, null);
    return { line: i + 2, holding: h, status: errors.length ? 'invalid' : existing.has(h.id) ? 'update' : 'new', errors };
  });
}

// ---------- sample data (fictional) ----------
export function sampleState(year = new Date().getFullYear()) {
  const s = emptyState();
  s.settings.openingDate = `${year}-01-01`;
  s.accounts = [
    { id: 'acc-bank', name: 'Demo Bank', type: 'Bank', openingBalance: 100000 },
    { id: 'acc-cash', name: 'Wallet Cash', type: 'Cash', openingBalance: 5000 },
    { id: 'acc-card', name: 'Demo Credit Card', type: 'Credit Card', openingBalance: 0 },
  ];
  let n = 0;
  const add = (date, type, category, from, to, amount, payee) => s.transactions.push({
    id: `demo-${++n}`, date, type, category, from, to, amount, payee, source: 'Sample', externalId: '',
  });
  for (let m = 1; m <= 3; m++) {
    const d = (day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    add(d(1), 'Income', 'Salary', '', 'acc-bank', 60000, 'Demo Employer');
    add(d(2), 'Expense', 'Housing', 'acc-bank', '', 18000, 'Demo Landlord');
    add(d(5), 'Expense', 'Groceries', 'acc-card', '', 4000 + m * 300, 'Demo Grocer');
    add(d(9), 'Expense', 'Food & Dining', 'acc-cash', '', 1500, 'Demo Cafe');
    add(d(12), 'Expense', 'Transport', 'acc-card', '', 1800, 'Demo Metro');
    add(d(15), 'Expense', 'Shopping', 'acc-card', '', 2500 + (m === 3 ? 3000 : 0), 'Demo Mall');
    add(d(20), 'Expense', 'Utilities', 'acc-bank', '', 2200, 'Demo Power');
    add(d(25), 'Transfer', '', 'acc-bank', 'acc-card', 8000, 'Card repayment');
    add(d(26), 'Investment Buy', '', 'acc-bank', '', 10000, 'Demo Fund SIP');
  }
  s.holdings = [
    { id: 'Sample|Demo|DEMO-EQ1', provider: 'Sample', accountLabel: 'Demo', instrumentId: 'DEMO-EQ1', name: 'Demo Equity Fund', assetClass: 'Mutual Fund', units: 100, costBasis: 25000, price: 262.5, priceDate: `${year}-03-31` },
    { id: 'Sample|Demo|DEMO-GLD', provider: 'Sample', accountLabel: 'Demo', instrumentId: 'DEMO-GLD', name: 'Demo Gold ETF', assetClass: 'Gold', units: 50, costBasis: 3000, price: 64, priceDate: `${year}-03-31` },
  ];
  s.budgets = [
    { category: 'Groceries', limit: 5000 }, { category: 'Food & Dining', limit: 2000 },
    { category: 'Shopping', limit: 4000 }, { category: 'Transport', limit: 2000 },
  ];
  return s;
}

export function normalizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  s.settings = { ...s.settings, ...(raw.settings || {}) };
  const arr = (x) => (Array.isArray(x) ? x : []);
  s.accounts = arr(raw.accounts).map((a) => ({ id: String(a.id), name: String(a.name ?? ''), type: a.type, openingBalance: Number(a.openingBalance) }));
  s.transactions = arr(raw.transactions).map((t) => ({
    id: String(t.id), date: t.date, type: t.type, category: t.category || '', from: t.from || '', to: t.to || '',
    amount: Number(t.amount), payee: t.payee || '', source: t.source || '', externalId: t.externalId || '',
  }));
  s.holdings = arr(raw.holdings).map((h) => ({
    id: String(h.id), provider: h.provider || '', accountLabel: h.accountLabel || '', instrumentId: h.instrumentId || '',
    name: h.name || '', assetClass: h.assetClass || 'Other', units: Number(h.units), costBasis: Number(h.costBasis),
    price: Number(h.price), priceDate: h.priceDate,
  }));
  s.budgets = arr(raw.budgets).map((b) => ({ category: String(b.category ?? ''), limit: Number(b.limit) }));
  return s;
}
