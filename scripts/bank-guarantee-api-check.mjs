// Explicit integration check: creates and removes only uniquely named test records.
import assert from 'node:assert/strict';
import express from 'express';
import { getPool, sql } from '../backend/src/config/db.js';
import { createBankGuaranteeRouter, ensureBankGuaranteeSchema } from '../backend/src/bankGuarantees.js';

const pool=await getPool();await ensureBankGuaranteeSchema();
const tag=`BG-QA-${Date.now()}`;let projectId,customerId,server;
const ids=[];
try {
  customerId=(await pool.request().input('Name',sql.NVarChar(200),tag).query('INSERT dbo.Customers(CustomerName,CompanyName) OUTPUT INSERTED.CustomerId VALUES(@Name,@Name)')).recordset[0].CustomerId;
  projectId=(await pool.request().input('Name',sql.NVarChar(200),tag).input('Customer',sql.Int,customerId).query('INSERT dbo.Projects(ProjectName,CustomerId,ManagementDataJson) OUTPUT INSERTED.ProjectId VALUES(@Name,@Customer,N\'{"contractNumber":"QA-CONTRACT","contractValue":100000}\')')).recordset[0].ProjectId;
  const app=express();app.use((req,_res,next)=>{req.user={id:1};next();});app.use('/bg',createBankGuaranteeRouter());app.use((e,_req,res,_next)=>res.status(e.statusCode||500).json({error:e.message}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/bg`;
  const bank={name:tag,branch:'QA',accountNumber:'00123456789',ifsc:'ABCD0123456',contactNumber:'0800012345',email:'qa@example.test'};
  const record={projectId,guaranteeNumber:tag,type:'Security',contractNumber:'QA-CONTRACT',contractValue:100000,securityPercentage:5,amountMode:'calculated',amount:5000,issuingBank:{...bank},claimantBank:{...bank,name:'Beneficiary Bank'},issueDate:'2025-01-01',expiryDate:'2025-12-31',claimDeadline:'2026-02-01',remarks:'Integration fixture'};
  const send=async(path,data,method='POST',file=true,expected=200)=>{
    const form=new FormData();form.append('payload',JSON.stringify(data));if(file)form.append('documents',new Blob(['%PDF-1.4\nQA document\n%%EOF'],{type:'application/pdf'}),'qa.pdf');
    const response=await fetch(base+path,{method,body:form});const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return body;
  };
  const options=await (await fetch(base+'/projects')).json();const linked=options.projects.find(p=>p.id===projectId);assert.equal(linked.customer,tag);assert.equal(linked.contractNumber,'QA-CONTRACT');assert.equal(linked.contractValue,100000);
  await send('',{...record,amount:0},'POST',true,400);
  await send('',{...record,projectId:2147483647},'POST',true,400);
  const created=await send('',record,'POST',true,201);ids.push(created.id);
  await send('',{...record,issuingBank:{...bank,name:` ${tag.toLowerCase()} `}},'POST',true,409);
  const other=await send('',{...record,issuingBank:{...bank,name:tag+' SECOND'}},'POST',true,201);ids.push(other.id);
  let current=await (await fetch(`${base}/${created.id}`)).json();assert.equal(current.customer,tag);assert.equal(current.applicant,'Bangalore Electronics');assert.equal(current.status,'Expired');assert.equal(current.closed,false);assert.equal(current.documents.length,1);assert.equal(current.issuingBank.accountNumber,'00123456789');
  await send(`/${created.id}`,{...record,revision:1,reason:'Correct remarks',remarks:'Edited'},'PUT',false);
  await send(`/${created.id}`,{...record,revision:1,reason:'Stale edit'},'PUT',false,409);
  await send(`/${created.id}/amend`,{...record,revision:2,reason:'Bank renewal',expiryDate:'2027-12-31',claimDeadline:'2028-04-01'},'POST');
  current=await (await fetch(`${base}/${created.id}`)).json();assert.equal(current.history.length,3);assert.equal(current.history[0].snapshot.expiryDate,'2025-12-31');assert.equal(current.documents.length,2);assert.equal(current.revision,3);
  const document=await fetch(`${base}/${created.id}/documents/${current.documents[0].id}`);assert.equal(await document.text(),'%PDF-1.4\nQA document\n%%EOF');
  await send(`/${created.id}/close`,{revision:3,closureDate:'2026-01-01',reason:'Release confirmed'},'POST',false,400);
  await send(`/${created.id}/close`,{revision:3,closureDate:'2026-01-01',reason:'Release confirmed'},'POST',true);
  current=await (await fetch(`${base}/${created.id}`)).json();assert.equal(current.status,'Closed');assert.equal(current.history.length,4);assert.equal(current.documents.length,3);assert.equal(current.documents[2].purpose,'Release');
  await send(`/${created.id}`,{...record,revision:4,reason:'Cannot edit closed'},'PUT',false,409);
  const register=await (await fetch(base)).json();assert.equal(register.guarantees.filter(r=>r.projectId===projectId).length,2);
  console.log('PASS: SQL persistence, project/customer/contract linking, duplicate banks, validation, editing, stale-write protection, renewal history, documents, closure and register.');
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(projectId)await pool.request().input('Project',sql.Int,projectId).query('DELETE FROM dbo.BankGuaranteeDocuments WHERE GuaranteeId IN (SELECT Id FROM dbo.BankGuarantees WHERE ProjectId=@Project); DELETE FROM dbo.BankGuaranteeHistory WHERE GuaranteeId IN (SELECT Id FROM dbo.BankGuarantees WHERE ProjectId=@Project); DELETE FROM dbo.BankGuarantees WHERE ProjectId=@Project; DELETE FROM dbo.Projects WHERE ProjectId=@Project;');
  if(customerId)await pool.request().input('Customer',sql.Int,customerId).query('DELETE FROM dbo.Customers WHERE CustomerId=@Customer');
  await pool.close();
}
