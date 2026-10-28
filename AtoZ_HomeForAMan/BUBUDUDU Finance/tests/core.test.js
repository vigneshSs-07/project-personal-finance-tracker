import * as C from '../js/core.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e && e.message || e) }); }
}
function eq(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

const base = () => {
  const s = C.emptyState();
  s.settings.openingDate = '2026-01-01';
  s.accounts = [
    { id: 'bank', name: 'Bank', type: 'Bank', openingBalance: 100000 },
    { id: 'card', name: 'Card', type: 'Credit Card', openingBalance: 0 },
    { id: 'bro', name: 'Broker', type: 'Brokerage Cash', openingBalance: 0 },
  ];
  return s;
};
const tx = (o) => ({ id: `t${Math.random()}`, date: '2026-03-05', type: 'Expense', category: 'Groceries', from: '', to: '', amount: 100, payee: '', source: '', externalId: '', ...o });

test('transfer does not change income or expense but moves balances', () => {
  const s = base();
  s.transactions = [tx({ type: 'Transfer', from: 'bank', to: 'card', amount: 5000, category: '' })];
  const an = C.analyze(s);
  eq(an.invalidCount, 0);
  eq(C.monthTotals(an, '2026-03'), { income: 0, expense: 0, net: 0 });
  const b = C.accountBalances(s, an, '2026-03-31');
  eq(b.get('bank'), 9500000); eq(b.get('card'), 500000);
});

test('card spend then repayment nets debt to zero, expense counted once', () => {
  const s = base();
  s.transactions = [
    tx({ type: 'Expense', from: 'card', amount: 1900.5 }),
    tx({ type: 'Transfer', from: 'bank', to: 'card', amount: 1900.5, category: '' }),
  ];
  const an = C.analyze(s);
  eq(C.monthTotals(an, '2026-03').expense, 1900.5);
  eq(C.accountBalances(s, an, '2026-03-31').get('card'), 0);
});

test('refund reduces expenses and category spending can go negative', () => {
  const s = base();
  s.transactions = [tx({ type: 'Expense', from: 'bank', amount: 100 }), tx({ type: 'Refund', to: 'bank', amount: 150 })];
  const an = C.analyze(s);
  eq(C.monthTotals(an, '2026-03').expense, -50);
  eq(C.categorySpending(an, '2026-03'), [{ category: 'Groceries', amount: -50 }]);
});

test('investment buy reduces cash only', () => {
  const s = base();
  s.transactions = [tx({ type: 'Investment Buy', from: 'bank', amount: 10000, category: '' })];
  const an = C.analyze(s);
  eq(C.monthTotals(an, '2026-03'), { income: 0, expense: 0, net: 0 });
  eq(C.accountBalances(s, an, '2026-12-31').get('bank'), 9000000);
});

test('invalid rows are excluded and flagged', () => {
  const s = base();
  s.transactions = [
    tx({ id: 'a', type: 'Income', to: 'bank', amount: 0, category: 'Salary' }),
    tx({ id: 'b', type: 'Expense', from: 'nope', amount: 10 }),
    tx({ id: 'c', type: 'Income', to: 'bank', from: 'card', amount: 10, category: 'Salary' }),
    tx({ id: 'd', type: 'Transfer', from: 'bank', to: 'bank', amount: 10, category: '' }),
    tx({ id: 'e', date: '2025-12-31', type: 'Expense', from: 'bank' }),
    tx({ id: 'f', date: '2026-02-30', type: 'Expense', from: 'bank' }),
    tx({ id: 'g', type: 'Expense', from: 'bank', category: '' }),
  ];
  const an = C.analyze(s);
  eq(an.validTx.length, 0);
  eq([...an.txIssues.keys()].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  eq(an.invalidCount, 7);
});

test('duplicate source+externalId flags both rows', () => {
  const s = base();
  s.transactions = [
    tx({ id: 'a', from: 'bank', source: 'Bank-1', externalId: 'X1' }),
    tx({ id: 'b', from: 'bank', source: 'Bank-1', externalId: 'X1' }),
    tx({ id: 'c', from: 'bank', source: 'Bank-1', externalId: 'X2' }),
  ];
  const an = C.analyze(s);
  eq(an.validTx.map((t) => t.id), ['c']);
});

test('as-of date excludes later transactions', () => {
  const s = base();
  s.transactions = [tx({ from: 'bank', amount: 100, date: '2026-04-01' })];
  const an = C.analyze(s);
  eq(C.accountBalances(s, an, '2026-03-31').get('bank'), 10000000);
  eq(C.accountBalances(s, an, '2026-04-01').get('bank'), 9990000);
});

test('floating point money stays exact', () => {
  const s = base();
  s.transactions = Array.from({ length: 10 }, () => tx({ from: 'bank', amount: 0.1 }));
  const an = C.analyze(s);
  eq(C.monthTotals(an, '2026-03').expense, 1);
});

test('net worth = assets - debt + investments', () => {
  const s = base();
  s.transactions = [tx({ type: 'Expense', from: 'card', amount: 1900 })];
  s.holdings = [{ id: 'h', provider: 'P', accountLabel: 'A', instrumentId: 'I', name: 'N', assetClass: 'Equity', units: 10, costBasis: 500, price: 60, priceDate: '2026-03-30' }];
  const an = C.analyze(s);
  const nw = C.netWorth(s, an, '2026-03-31');
  eq(nw.assets, 100000); eq(nw.liabilities, 1900); eq(nw.investments, 600); eq(nw.netWorth, 98700);
});

test('holdings: future snapshot excluded, stale flagged but counted, invalid excluded', () => {
  const s = base();
  const h = (o) => ({ id: o.id, provider: 'P', accountLabel: 'A', instrumentId: o.id, name: 'N', assetClass: 'Equity', units: 1, costBasis: 0, price: 100, priceDate: '2026-03-31', ...o });
  s.holdings = [h({ id: 'ok' }), h({ id: 'future', priceDate: '2026-04-01' }), h({ id: 'old', priceDate: '2026-03-01' }), h({ id: 'bad', units: 0 })];
  const an = C.analyze(s);
  const pf = C.portfolio(s, an, '2026-03-31');
  eq(pf.rows.map((r) => r.holding.id), ['ok', 'old']);
  eq(pf.stale, 1); eq(pf.value, 20000);
});

test('year series omits future and pre-opening months', () => {
  const s = base();
  s.settings.openingDate = '2026-02-01';
  s.transactions = [tx({ type: 'Income', to: 'bank', amount: 10, category: 'Salary', date: '2026-02-10' })];
  const an = C.analyze(s);
  const ser = C.yearSeries(s, an, 2026, '2026-03-15');
  eq(ser[0].income, null); eq(ser[1].income, 10); eq(ser[2].income, 0); eq(ser[3].income, null);
});

test('budget vs actual flags overspend', () => {
  const s = base();
  s.budgets = [{ category: 'Groceries', limit: 50 }, { category: 'Travel', limit: -1 }];
  s.transactions = [tx({ from: 'bank', amount: 100 })];
  const an = C.analyze(s);
  eq(C.budgetVsActual(s, an, '2026-03'), [{ category: 'Groceries', limit: 50, actual: 100, over: true }]);
});

test('CSV parse handles quotes, CRLF, BOM, embedded commas/newlines', () => {
  const rows = C.parseCSV('\uFEFFa,b\r\n"x,1","he said ""hi"""\r\n"line\nbreak",z\r\n');
  eq(rows, [['a', 'b'], ['x,1', 'he said "hi"'], ['line\nbreak', 'z']]);
});

test('CSV export neutralises formula injection but keeps numbers', () => {
  eq(C.csvCell('=SUM(A1)'), "'=SUM(A1)");
  eq(C.csvCell('@x'), "'@x");
  eq(C.csvCell(-5), '-5');
  eq(C.csvCell('a,b'), '"a,b"');
});

test('date and amount parsing for statements', () => {
  eq(C.parseDateLoose('05/03/2026'), '2026-03-05');
  eq(C.parseDateLoose('5-Mar-2026'), '2026-03-05');
  eq(C.parseDateLoose('2026-03-05 10:00'), '2026-03-05');
  eq(C.parseDateLoose('31/02/2026'), null);
  eq(C.parseAmountLoose('₹1,23,456.50'), 123456.5);
  eq(C.parseAmountLoose('(200.00)'), -200);
  eq(C.parseAmountLoose('500 Dr'), -500);
  eq(C.parseAmountLoose('500 Cr'), 500);
  eq(C.parseAmountLoose('abc'), null);
});

test('transaction import maps rows, detects invalid and duplicates', () => {
  const s = base();
  s.transactions = [tx({ id: 'old', date: '2026-03-05', type: 'Expense', from: 'bank', amount: 250, payee: 'Cafe', source: '', externalId: '' })];
  const rows = [
    ['05/03/2026', 'Cafe', '250.00', ''],
    ['06/03/2026', 'Salary', '', '50000'],
    ['xx', 'Bad', '10', ''],
    ['07/03/2026', 'Utility', '99', '', ],
  ];
  const map = C.guessMapping(['Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt'], ['date', 'amount', 'debit', 'credit', 'payee', 'type', 'category', 'externalId']);
  const items = C.buildTransactionImport(rows, map, { accountId: 'bank', source: 'Bank-CSV' }, s);
  eq(items.map((i) => i.status), ['duplicate', 'new', 'invalid', 'new']);
  eq(items[1].tx.type, 'Income'); eq(items[1].tx.to, 'bank'); eq(items[3].tx.type, 'Expense'); eq(items[3].tx.from, 'bank');
});

test('holding import derives cost from average price and flags updates', () => {
  const s = base();
  s.holdings = [{ id: 'Groww|Main|INE001', provider: 'Groww', accountLabel: 'Main', instrumentId: 'INE001', name: 'X', assetClass: 'Equity', units: 1, costBasis: 1, price: 1, priceDate: '2026-01-01' }];
  const headers = ['ISIN', 'Stock Name', 'Quantity', 'Average buy price', 'Closing price'];
  const map = C.guessMapping(headers, ['instrumentId', 'name', 'units', 'costBasis', 'avgPrice', 'price', 'priceDate', 'assetClass']);
  const items = C.buildHoldingImport([['INE001', 'X Ltd', '10', '100.5', '120'], ['INE002', 'Y Ltd', '0', '1', '1']], map, { provider: 'Groww', accountLabel: 'Main', today: '2026-03-31' }, s);
  eq(items[0].status, 'update'); eq(items[0].holding.costBasis, 1005); eq(items[1].status, 'invalid');
});

test('month compare, savings rate, net worth trend and pct change', () => {
  const s = base();
  s.transactions = [
    tx({ type: 'Income', to: 'bank', amount: 1000, category: 'Salary', date: '2026-02-01' }),
    tx({ from: 'bank', amount: 200, category: 'Groceries', date: '2026-02-10' }),
    tx({ from: 'bank', amount: 300, category: 'Groceries', date: '2026-03-10' }),
    tx({ from: 'bank', amount: 50, category: 'Travel', date: '2026-03-11' }),
  ];
  const an = C.analyze(s);
  eq(C.monthCompare(an, '2026-03'), [
    { category: 'Groceries', current: 300, previous: 200 }, { category: 'Travel', current: 50, previous: 0 }]);
  const ser = C.yearSeries(s, an, 2026, '2026-03-31');
  eq(C.savingsRateSeries(ser).slice(0, 4).map((x) => x.value), [null, 80, null, null]);
  const nw = C.netWorthSeries(s, an, 2026, '2026-03-31');
  eq(nw.map((x) => x.value).slice(0, 4), [100000, 100800, 100450, null]);
  eq(C.pctChange(150, 100), 50); eq(C.pctChange(5, 0), null);
});

test('sample data is fully valid', () => {
  const s = C.sampleState(2026);
  eq(C.analyze(s).invalidCount, 0);
});

test('cashflow fact: transfer has two legs with zero effect, expense negative', () => {
  const s = base();
  s.transactions = [tx({ id: 'e', type: 'Expense', from: 'bank', amount: 40 }), tx({ id: 'x', type: 'Transfer', from: 'bank', to: 'card', amount: 7, category: '' })];
  const rows = C.EXPORTS.cashflow_fact.rows(s);
  eq(rows.length, 3);
  eq(rows.filter((r) => r[0] === 'x').map((r) => [r[7], r[8], r[9]]), [['Out', -7, 0], ['In', 7, 0]]);
  eq(rows.find((r) => r[0] === 'e').slice(7, 10), ['Out', -40, -40]);
});

const failed = results.filter((r) => !r.ok);
const out = document.getElementById('out');
out.textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + r.err}`).join('\n')
  + `\n\nSUMMARY ${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAILED' : 'PASSED';
