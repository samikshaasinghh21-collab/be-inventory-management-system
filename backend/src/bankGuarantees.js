import express from 'express';
import multer from 'multer';
import { readFile } from 'node:fs/promises';
import { getPool, sql } from './config/db.js';
import { guaranteeSchema, closureSchema, changeSchema, bankIdentity } from './bankGuaranteeValidation.js';
import { bgStatus, todayIndia } from '../../shared/bankGuarantees.js';

let schemaPromise;
export function ensureBankGuaranteeSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    const pool = await getPool();
    const migration = await readFile(new URL('../migrations/013-bank-guarantees.sql', import.meta.url), 'utf8');
    const tx = pool.transaction(); await tx.begin();
    try {
      await new sql.Request(tx).query("DECLARE @r INT; EXEC @r=sp_getapplock @Resource='bank-guarantee-schema',@LockMode='Exclusive',@LockOwner='Transaction'; IF @r<0 THROW 50000,'Could not lock bank guarantee schema',1;");
      await new sql.Request(tx).batch(migration); await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }
  })().catch(e => {schemaPromise=null;throw e;});
  return schemaPromise;
}
const fail = (statusCode, message) => Object.assign(new Error(message), {statusCode});
const parse = (schema, value) => {const result=schema.safeParse(value);if(!result.success) throw fail(400,result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));return result.data;};
const unpack = row => ({...JSON.parse(row.DataJson),id:row.Id,revision:row.Revision,closed:Boolean(row.Closed),createdAt:row.CreatedAt,updatedAt:row.UpdatedAt});
const projectInfo = row => {
  let metadata={};try{metadata=JSON.parse(row.ManagementDataJson || '{}');}catch{/* Legacy metadata may be empty. */}
  return {id:row.ProjectId,name:row.ProjectName ?? row.projectName,customerId:row.CustomerId,customer:row.CustomerCompany || row.CustomerName || row.ClientCompany || row.Client || '',contractNumber:metadata.contractNumber || metadata.contract?.number || '',contractValue:metadata.contractValue || metadata.contract?.value || ''};
};
const projectsQuery = `SELECT p.*, c.CustomerName,c.CompanyName AS CustomerCompany FROM dbo.Projects p LEFT JOIN dbo.Customers c ON c.CustomerId=p.CustomerId`;
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:5,fields:1,fieldSize:100000}}).array('documents',5);
const validateFiles = files => {
  for(const f of files) {
    const b=f.buffer;
    const pdf=b.subarray(0,5).toString()==='%PDF-';
    const png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=b[0]===255 && b[1]===216 && b[2]===255;
    if(!pdf&&!png&&!jpg) throw fail(400,'Upload PDF, PNG or JPEG documents only.');
    f.verifiedType=pdf?'application/pdf':png?'image/png':'image/jpeg';
  }
};
export function createBankGuaranteeRouter() {
  const router=express.Router();
  for(const key of ['id','documentId']) router.param(key,(req,_res,next,value)=>next(/^\d+$/.test(value)&&Number(value)>0&&Number(value)<=2147483647?undefined:fail(400,'Invalid record identifier')));
  router.use(async (_req,_res,next)=>{try{await ensureBankGuaranteeSchema();next();}catch(e){next(e);}});
  router.get('/projects',async (_req,res,next)=>{try{const p=await getPool();res.json({projects:(await p.request().query(`${projectsQuery} ORDER BY p.ProjectId DESC`)).recordset.map(projectInfo)});}catch(e){next(e);}});
  router.get('/',async (_req,res,next)=>{try{const rows=(await (await getPool()).request().query('SELECT * FROM dbo.BankGuarantees ORDER BY Id DESC')).recordset;res.json({guarantees:rows.map(row=>{const data=unpack(row);return {...data,status:bgStatus(data)};})});}catch(e){next(e);}});
  router.get('/:id/documents/:documentId',async(req,res,next)=>{try{
    const row=(await (await getPool()).request().input('Id',sql.Int,Number(req.params.documentId)).input('BG',sql.Int,Number(req.params.id)).query('SELECT * FROM dbo.BankGuaranteeDocuments WHERE Id=@Id AND GuaranteeId=@BG')).recordset[0];
    if(!row) throw fail(404,'Document not found');
    res.set({'Content-Type':row.MimeType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.FileName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(row.Contents);
  }catch(e){next(e);}});
  router.get('/:id',async(req,res,next)=>{try{
    const p=await getPool();const id=Number(req.params.id);
    const row=(await p.request().input('Id',sql.Int,id).query('SELECT * FROM dbo.BankGuarantees WHERE Id=@Id')).recordset[0];if(!row)throw fail(404,'Bank guarantee not found');
    const history=(await p.request().input('Id',sql.Int,id).query('SELECT Revision,Action,Reason,DataJson,ActorId,CreatedAt FROM dbo.BankGuaranteeHistory WHERE GuaranteeId=@Id ORDER BY Revision')).recordset.map(h=>({revision:h.Revision,action:h.Action,reason:h.Reason,snapshot:JSON.parse(h.DataJson),actorId:h.ActorId,createdAt:h.CreatedAt}));
    const documents=(await p.request().input('Id',sql.Int,id).query('SELECT Id,Revision,Purpose,FileName,CreatedAt FROM dbo.BankGuaranteeDocuments WHERE GuaranteeId=@Id ORDER BY Id')).recordset.map(d=>({id:d.Id,revision:d.Revision,purpose:d.Purpose,name:d.FileName,createdAt:d.CreatedAt}));
    const data=unpack(row);res.json({...data,status:bgStatus(data),history,documents});
  }catch(e){next(e);}});
  const mutate = action => async(req,res,next)=>{
    let tx;
    try{
      let body;try{body=JSON.parse(req.body.payload);}catch{throw fail(400,'Invalid guarantee payload');}
      const files=req.files || [];validateFiles(files);
      const creating=action==='Created';const closing=action==='Closed';
      const control=creating?null:parse(closing?closureSchema:changeSchema,body);
      let data=closing?null:parse(guaranteeSchema,body);
      if(closing&&!files.length)throw fail(400,'Upload supporting release confirmation to close the guarantee.');
      if(creating&&!files.length)throw fail(400,'Upload the bank-issued guarantee document.');
      const pool=await getPool();tx=pool.transaction();await tx.begin();
      let id=Number(req.params.id), revision=1,previous;
      if(!creating){
        const row=(await new sql.Request(tx).input('Id',sql.Int,id).query('SELECT * FROM dbo.BankGuarantees WITH (UPDLOCK,HOLDLOCK) WHERE Id=@Id')).recordset[0];
        if(!row)throw fail(404,'Bank guarantee not found');previous=unpack(row);
        if(previous.closed)throw fail(409,'Closed guarantees cannot be changed.');
        if(previous.revision!==control.revision)throw fail(409,'This guarantee changed. Reload it before saving.');
        revision=previous.revision+1;
      }
      if(closing){
        if(control.closureDate<previous.issueDate || control.closureDate>todayIndia())throw fail(400,'Closure date must be between issue date and today.');
        data={...JSON.parse(JSON.stringify(previous)),closed:true,closureDate:control.closureDate,closureReason:control.reason};
        for(const key of ['id','revision','createdAt','updatedAt'])delete data[key];
      }else{
        const project=(await new sql.Request(tx).input('ProjectId',sql.Int,data.projectId).query(`${projectsQuery} WHERE p.ProjectId=@ProjectId`)).recordset[0];
        if(!project)throw fail(400,'Select an existing project');const info=projectInfo(project);
        if(!info.customer)throw fail(400,'Link a customer to this project first.');
        if(!creating&&data.projectId!==previous.projectId)throw fail(400,'The project cannot be changed after creation.');
        data={...data,projectName:info.name,customerId:info.customerId,customer:info.customer,applicant:'Bangalore Electronics',beneficiary:info.customer,closed:false};
      }
      const request=new sql.Request(tx).input('ProjectId',sql.Int,data.projectId).input('BankKey',sql.NVarChar(200),bankIdentity(data.issuingBank.name)).input('GuaranteeKey',sql.NVarChar(120),bankIdentity(data.guaranteeNumber)).input('Json',sql.NVarChar(sql.MAX),JSON.stringify(data)).input('Revision',sql.Int,revision).input('Closed',sql.Bit,closing);
      if(creating){id=(await request.query('INSERT dbo.BankGuarantees(ProjectId,BankKey,GuaranteeKey,DataJson) OUTPUT INSERTED.Id VALUES(@ProjectId,@BankKey,@GuaranteeKey,@Json)')).recordset[0].Id;}
      else{await request.input('Id',sql.Int,id).query('UPDATE dbo.BankGuarantees SET BankKey=@BankKey,GuaranteeKey=@GuaranteeKey,DataJson=@Json,Revision=@Revision,Closed=@Closed,UpdatedAt=SYSUTCDATETIME() WHERE Id=@Id');}
      await new sql.Request(tx).input('Id',sql.Int,id).input('Revision',sql.Int,revision).input('Action',sql.NVarChar(20),action).input('Reason',sql.NVarChar(2000),control?.reason || 'Initial registration').input('Json',sql.NVarChar(sql.MAX),JSON.stringify(data)).input('ActorId',sql.Int,req.user.id).query('INSERT dbo.BankGuaranteeHistory(GuaranteeId,Revision,Action,Reason,DataJson,ActorId) VALUES(@Id,@Revision,@Action,@Reason,@Json,@ActorId)');
      for(const file of files)await new sql.Request(tx).input('Id',sql.Int,id).input('Revision',sql.Int,revision).input('Purpose',sql.NVarChar(20),closing?'Release':'Guarantee').input('Name',sql.NVarChar(255),file.originalname.replace(/[\\/\r\n]/g,'_').slice(0,255)).input('Mime',sql.NVarChar(100),file.verifiedType).input('Data',sql.VarBinary(sql.MAX),file.buffer).query('INSERT dbo.BankGuaranteeDocuments(GuaranteeId,Revision,Purpose,FileName,MimeType,Contents) VALUES(@Id,@Revision,@Purpose,@Name,@Mime,@Data)');
      await tx.commit();tx=null;res.status(creating?201:200).json({id,revision});
    }catch(e){if(tx)await tx.rollback().catch(()=>{});if([2601,2627].includes(e.number))return next(fail(409,'This guarantee number already exists for the same issuing bank.'));next(e);}
  };
  router.post('/',upload,mutate('Created'));
  router.put('/:id',upload,mutate('Edited'));
  router.post('/:id/amend',upload,mutate('Amended'));
  router.post('/:id/close',upload,mutate('Closed'));
  router.use((err,_req,_res,next)=>next(err instanceof multer.MulterError?fail(400,`Upload rejected: ${err.message}. Maximum 5 files, 10 MB each.`):err));
  return router;
}
