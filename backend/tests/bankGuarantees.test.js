import test from 'node:test';
import assert from 'node:assert/strict';
import { guaranteeSchema, closureSchema, bankIdentity } from '../src/bankGuaranteeValidation.js';
import { bgStatus, bgAlerts, displayBgDate, calculatedBgAmount } from '../../shared/bankGuarantees.js';
import { permissionsForApiRequest } from '../src/apiAccess.js';

const bank={name:'Test Bank',branch:'Main',accountNumber:'001234567890',ifsc:'ABCD0123456',contactNumber:'+91 0800012345',email:'bank@example.test'};
const fixture=()=>({projectId:1,guaranteeNumber:'BG-001',type:'Security',contractNumber:'C001',contractValue:100000,securityPercentage:5,amountMode:'calculated',amount:1,issuingBank:{...bank},claimantBank:{...bank},issueDate:'2026-01-01',expiryDate:'2026-12-31',claimDeadline:'2027-02-14',remarks:''});
test('BG calculation is authoritative; direct entry and text bank identifiers survive',()=>{
  const data=guaranteeSchema.parse(fixture());assert.equal(data.amount,5000);assert.equal(data.issuingBank.accountNumber,'001234567890');assert.equal(data.claimantBank.contactNumber,'+91 0800012345');
  assert.equal(guaranteeSchema.parse({...fixture(),amountMode:'direct',amount:123.45}).amount,123.45);
  assert.equal(calculatedBgAmount(123456.78,2.5),3086.42);
  assert.equal(bankIdentity('  Test   Bank '),'TEST BANK');
});
test('BG rejects missing fields, invalid dates, nonpositive amounts, invalid banks and percentages',()=>{
  for(const change of [{projectId:0},{guaranteeNumber:''},{amount:0},{amount:-1},{securityPercentage:101},{expiryDate:'2026-02-30'},{expiryDate:'2025-12-31'},{claimDeadline:'2025-12-31'},{contractValue:''},{issuingBank:{...bank,name:''}},{claimantBank:{...bank,email:'invalid'}},{issuingBank:{...bank,accountNumber:123}}]) assert.equal(guaranteeSchema.safeParse({...fixture(),...change}).success,false,JSON.stringify(change));
  assert.equal(closureSchema.safeParse({closureDate:'2026-10-01',reason:'',revision:1}).success,false);
});
test('claim period is independently entered and expired guarantees never auto-close',()=>{
  assert.equal(guaranteeSchema.parse({...fixture(),claimDeadline:'2026-10-01'}).claimDeadline,'2026-10-01');
  assert.equal(bgStatus({...fixture(),expiryDate:'2026-10-01'},'2026-11-11'),'Expired');
  assert.equal(bgStatus({...fixture(),closed:true},'2028-01-01'),'Closed');
  assert.equal(bgStatus({...fixture(),issueDate:'2026-12-01'},'2026-11-11'),'Not yet effective');
  assert.equal(bgStatus({...fixture(),expiryDate:'2026-11-11'},'2026-11-11'),'Active');
  assert.deepEqual(bgAlerts({...fixture(),expiryDate:'2026-11-12',claimDeadline:'2026-11-10'},7,'2026-11-11'),['Expiry: in 1 days','Claim deadline: 1 days overdue']);
  assert.deepEqual(bgAlerts({...fixture(),closed:true},30,'2027-01-01'),[]);
  assert.equal(displayBgDate('2026-11-03'),'03/11/2026');
});
test('finance permissions protect reads and mutations',()=>{
  assert.deepEqual(permissionsForApiRequest('GET','/finance/bank-guarantees'),['finance.view']);
  assert.deepEqual(permissionsForApiRequest('POST','/finance/bank-guarantees/1/close'),['finance.manage']);
});
