import test from 'node:test';
import assert from 'node:assert/strict';
import { manualLopAmount, calculateLop, monthlyProfessionalTax, monthKey } from '../../shared/payroll.js';

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
  assert.equal(monthKey('2026-00'),'');
  assert.equal(monthKey('2026-13'),'');
  assert.throws(()=>monthlyProfessionalTax({annualAmount:2500},'2026-13'));
});
test('invalid LOP inputs are rejected and saved currency keeps paise', () => {
  for (const [gross, working, unpaid] of [[30000,32,1],[30000,25,-0.5],[-1,25,0],[30000,NaN,1]]) {
    assert.throws(() => calculateLop(gross, working, unpaid));
  }
  assert.equal(calculateLop(30000,31,0.5),483.87);
  assert.equal(monthlyProfessionalTax({annualAmount:0},'2026-01'),0);
});


test('manual LOP preserves entered amounts including zero and rejects invalid values', () => {
  assert.equal(manualLopAmount(1250.75), 1250.75);
  assert.equal(manualLopAmount("0"), 0);
  assert.equal(manualLopAmount(undefined), 0);
  assert.equal(manualLopAmount("434.785"), 434.79);
  for (const value of [-1, "invalid", Infinity, NaN]) {
    assert.throws(() => manualLopAmount(value), /LOP must/);
  }
});
