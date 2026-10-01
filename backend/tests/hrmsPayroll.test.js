import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLop, monthlyProfessionalTax, monthKey } from '../../shared/payroll.js';

test('LOP uses applicable working days and supports partial unpaid days',()=>{
  assert.equal(calculateLop(30000,25,2.5),3000);
  assert.equal(calculateLop(30000,25,0),0);
  assert.equal(calculateLop(30000,25,25),30000);
  assert.equal(calculateLop(10000,23,1),434.78);
  assert.throws(()=>calculateLop(30000,0,1));
  assert.throws(()=>calculateLop(30000,25,26));
  assert.throws(()=>calculateLop(30000,25,-1));
});
test('annual PT schedule totals exactly the configured amount',()=>{
  const rule={annualAmount:2500};
  const deductions=Array.from({length:12},(_,i)=>monthlyProfessionalTax(rule,`2026-${String(i+1).padStart(2,'0')}`));
  assert.equal(Math.round(deductions.reduce((a,b)=>a+b,0)*100),250000);
  assert.equal(deductions[2],208.37);
  const monthlyAmounts=Array.from({length:12},()=>200);monthlyAmounts[1]=300;
  assert.equal(monthlyProfessionalTax({annualAmount:2500,monthlyAmounts},'February 2026'),300);
  assert.throws(()=>monthlyProfessionalTax({annualAmount:2500,monthlyAmounts:[200]},'2026-01'));
  assert.equal(monthlyProfessionalTax(null,'2026-01',200),200);
});
test('report and payroll months agree across stored and input formats',()=>{
  assert.equal(monthKey('September 2026'),'2026-09');
  assert.equal(monthKey('2026-09'),'2026-09');
  assert.equal(monthKey('invalid'),'');
});
