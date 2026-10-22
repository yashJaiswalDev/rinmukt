// Unit tests for the schedule engine. Run with: npm test  (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

const TODAY = '2026-10-22'; // fixed so results never drift with the calendar
const loans = E.DEMO.filter(l => !E.isCard(l));
const byId = id => E.DEMO.find(l => l.id === id);

// independent closed-form balance after n payments of a reducing-balance loan
const closedForm = (P, annual, emi, n) => { const r = annual / 1200; return P * Math.pow(1 + r, n) - emi * (Math.pow(1 + r, n) - 1) / r; };

test('demo loans match the closed-form balance and close at exactly zero', () => {
  for (const l of loans) {
    const c = E.computeLoan(l, TODAY);
    assert.ok(Math.abs(c.outstanding - closedForm(l.principal, l.rate, l.emi, c.paid)) < 5, l.name + ' outstanding');
    assert.equal(c.rows[c.rows.length - 1].bal, 0, l.name + ' final balance');
    assert.equal(c.paid + c.remaining, c.rows.length, l.name + ' row count');
  }
});

test('past EMIs are backfilled as paid up to today', () => {
  assert.equal(E.computeLoan(byId('demo-home'), TODAY).paid, 44);     // Mar 2023 → Oct 2026
  assert.equal(E.computeLoan(byId('demo-car'), TODAY).paid, 27);      // Aug 2024 → Oct 2026
  assert.equal(E.computeLoan(byId('demo-personal'), TODAY).paid, 22); // Jan 2025 → Oct 2026
});

test('due dates clamp to the last day of short months', () => {
  assert.equal(E.dueDate('2024-01-31', 1), '2024-02-29');
  assert.equal(E.dueDate('2025-01-31', 1), '2025-02-28');
  assert.equal(E.dueDate('2025-01-31', 3), '2025-04-30');
  assert.equal(E.dueDate('2025-11-30', 3), '2026-02-28');
});

test('a missed EMI raises the balance and extends the loan; unmarking restores it', () => {
  const car = byId('demo-car');
  const base = E.computeLoan(car, TODAY);
  const missed = E.computeLoan({ ...car, missed: [base.rows[10].date] }, TODAY);
  assert.ok(missed.outstanding > base.outstanding);
  assert.equal(missed.rows.length, base.rows.length + 1);
  assert.equal(missed.paid, base.paid - 1);
  assert.equal(E.computeLoan({ ...car, missed: [] }, TODAY).outstanding, base.outstanding);
  // a future-dated miss is ignored
  assert.equal(E.computeLoan({ ...car, missed: [base.next.date] }, TODAY).outstanding, base.outstanding);
});

test('re-basing on the lender balance re-solves the remaining tenure', () => {
  const car = byId('demo-car');
  const rb = E.computeLoan({ ...car, lenderBal: 500000, asOf: '2026-09-15' }, TODAY);
  assert.ok(rb.rebased);
  assert.equal(rb.remaining, 34);
  assert.ok(E.computeLoan({ ...car, lenderBal: 5000000, asOf: '2026-09-15' }, TODAY).rebaseErr, 'EMI below interest');
});

test('closed, future and due-today loans', () => {
  const old = { id: 'x', name: 'Old', lender: 'L', principal: 100000, rate: 10, tenure: 12, emi: 8792, firstDate: '2023-01-05', missed: [] };
  const oc = E.computeLoan(old, TODAY);
  assert.ok(oc.closed); assert.equal(oc.outstanding, 0);
  const fu = E.computeLoan({ ...old, firstDate: '2027-01-05' }, TODAY);
  assert.equal(fu.outstanding, 100000); assert.equal(fu.paid, 0);
  assert.equal(E.computeLoan({ ...old, firstDate: TODAY }, TODAY).paid, 1);
  assert.equal(E.computeLoan({ ...old, firstDate: '2026-10-23' }, TODAY).paid, 0);
});

test('validation', () => {
  const ok = { id: 'a', name: 'n', lender: 'l', principal: 1000, rate: 10, tenure: 12, emi: 100, firstDate: '2026-01-01' };
  assert.ok(E.validLoan(ok));
  assert.ok(!E.validLoan({ ...ok, firstDate: '2026-02-30' }));
  assert.ok(!E.validLoan({ ...ok, rate: 0 }), '0% only allowed for card EMIs');
  assert.ok(E.validLoan({ ...ok, rate: 0, kind: 'card' }));
  assert.ok(!E.validLoan({ ...ok, last4: '12a4' }));
});

test('no-cost card EMI: zero interest, rounding lands on the last EMI', () => {
  const p = E.computeLoan(byId('demo-card-phone'), TODAY);
  assert.equal(p.rows.length, 12);
  assert.equal(p.totInt, 0);
  assert.equal(p.rows[11].bal, 0);
  assert.ok(Math.abs(p.rows[11].emi - 6658.37) < 0.005);
  assert.equal(p.paid, 7);
  assert.equal(E.nForBalance(30000, 0, 6658.33), 5);
  assert.ok(Math.abs(E.stdEmi(79900, 0, 12) - 6658.333) < 0.001);
});

test('interest-bearing card EMI and GST on interest', () => {
  const lap = byId('demo-card-laptop');
  const c = E.computeLoan(lap, TODAY);
  assert.ok(Math.abs(c.outstanding - closedForm(lap.principal, lap.rate, lap.emi, c.paid)) < 1);
  assert.equal(c.rows.length, 9);
  assert.equal(Math.round(c.totInt * E.GST * 100) / 100, 1372.35);
  const tv = E.computeLoan(byId('demo-card-tv'), TODAY);
  assert.ok(tv.closed); assert.equal(tv.closing, '2026-07-20');
});
