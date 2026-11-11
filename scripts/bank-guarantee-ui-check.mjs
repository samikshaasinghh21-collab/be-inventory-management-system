import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { getPool, sql } from '../backend/src/config/db.js';
import { todayIndia, displayBgDate } from '../shared/bankGuarantees.js';

const pool=await getPool();const tag=`BG-UI-${Date.now()}`;let customerId,projectId,browser,page;
pool.on('error',error=>console.error('Test database pool:',error.message));
const future=days=>{const date=new Date(todayIndia());date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
try {
  customerId=(await pool.request().input('Name',sql.NVarChar(200),tag).query('INSERT dbo.Customers(CustomerName,CompanyName) OUTPUT INSERTED.CustomerId VALUES(@Name,@Name)')).recordset[0].CustomerId;
  projectId=(await pool.request().input('Name',sql.NVarChar(200),tag).input('Customer',sql.Int,customerId).query('INSERT dbo.Projects(ProjectName,CustomerId,ManagementDataJson) OUTPUT INSERTED.ProjectId VALUES(@Name,@Customer,N\'{"contractNumber":"UI-CONTRACT","contractValue":100000}\')')).recordset[0].ProjectId;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  // Keep finance and authentication live; isolate unrelated shell background feeds.
  await context.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/api/finance/')||path.startsWith('/api/auth/'))return route.continue();
    return route.fulfill({status:200,json:path.includes('/settings/')?{}:[]});
  });
  await context.addInitScript(()=>{window.print=()=>{window.__printCalled=true;};});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5173/finance/bank-guarantees',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'New Bank Guarantee',exact:true}).click();
  await page.getByLabel('Project *',{exact:true}).selectOption(String(projectId));
  assert.equal(await page.getByLabel('Customer / Beneficiary',{exact:true}).inputValue(),tag);
  assert.equal(await page.getByLabel('Contract Number',{exact:true}).inputValue(),'UI-CONTRACT');
  assert.equal(await page.getByLabel('Contract Value (INR)',{exact:true}).inputValue(),'100000');
  await page.getByLabel('Guarantee Number *',{exact:true}).fill(tag);
  await page.getByLabel('Security Percentage',{exact:true}).fill('5');
  assert.equal(await page.getByLabel('BG Amount (INR) *',{exact:true}).inputValue(),'5000');
  for(const side of ['Issuing','Claimant']){
    await page.getByLabel(`${side} Bank Name *`,{exact:true}).fill(`${tag} ${side}`);
    await page.getByLabel(`${side} Branch`,{exact:true}).fill('Main');
    await page.getByLabel(`${side} Account Number`,{exact:true}).fill('00123456789');
    await page.getByLabel(`${side} IFSC Code`,{exact:true}).fill('ABCD0123456');
    await page.getByLabel(`${side} Contact Number`,{exact:true}).fill('0800012345');
    await page.getByLabel(`${side} Email ID`,{exact:true}).fill('qa@example.test');
  }
  await page.getByLabel('Issue Date *',{exact:true}).fill(displayBgDate(future(-30)));
  await page.getByLabel('Validity / Expiry Date *',{exact:true}).fill(displayBgDate(future(20)));
  await page.getByLabel('Claim Deadline *',{exact:true}).fill(displayBgDate(future(45)));
  const upload=name=>({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA ONLY\n%%EOF')});
  await page.getByLabel('Guarantee Documents (bank-issued)',{exact:true}).setInputFiles(upload('original.pdf'));
  await page.getByRole('button',{name:'Save Guarantee',exact:true}).click();
  await page.getByRole('heading',{name:'Guarantee details',exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.getByLabel('Search',{exact:true}).fill(tag);
  await page.getByRole('button',{name:'View',exact:true}).click();
  await page.getByRole('heading',{name:'Guarantee details',exact:true}).waitFor();
  assert.ok((await page.locator('#bg-record-print').innerText()).includes('00123456789'));
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Remarks',{exact:true}).fill('Verified edit');
  await page.getByLabel('Amendment / Edit Reason *',{exact:true}).fill('Correct remarks');
  await page.getByRole('button',{name:'Save Guarantee',exact:true}).click();
  await page.getByRole('heading',{name:'Guarantee details',exact:true}).waitFor();
  await page.getByRole('button',{name:'Renew / Amend',exact:true}).click();
  await page.getByLabel('Validity / Expiry Date *',{exact:true}).fill(displayBgDate(future(365)));
  await page.getByLabel('Claim Deadline *',{exact:true}).fill(displayBgDate(future(400)));
  await page.getByLabel('Amendment / Edit Reason *',{exact:true}).fill('Bank extension received');
  await page.getByLabel('Guarantee Documents (bank-issued)',{exact:true}).setInputFiles(upload('amendment.pdf'));
  await page.getByRole('button',{name:'Save Guarantee',exact:true}).click();
  await page.getByRole('heading',{name:'Guarantee details',exact:true}).waitFor();
  const text=await page.locator('#bg-record-print').innerText();assert.ok(text.includes('original.pdf'));assert.ok(text.includes('amendment.pdf'));assert.ok(text.includes(displayBgDate(future(20))));
  const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Print',exact:true}).click()]);
  await popup.waitForLoadState();const printText=await popup.locator('body').innerText();assert.ok(printText.includes('For Bangalore Electronics'));assert.ok(printText.includes('not the bank'));assert.ok(await popup.locator('img').count()>0);await popup.close();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Excel Export',exact:true}).click()]);
  const wb=XLSX.readFile(await download.path());const rows=XLSX.utils.sheet_to_json(wb.Sheets['Bank Guarantees']);assert.equal(rows.length,1);assert.equal(rows[0]['Issuing Account Number'],'00123456789');assert.equal(rows[0]['Amount (INR)'],5000);assert.equal(rows[0]['Expiry Date'],displayBgDate(future(365)));
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByLabel('Closure Reason / Remarks *',{exact:true}).fill('Customer release received');
  await page.getByLabel('Supporting Release Confirmation *',{exact:true}).setInputFiles(upload('release.pdf'));
  await page.getByRole('button',{name:'Confirm Closure',exact:true}).click();
  await page.getByRole('heading',{name:'Guarantee details',exact:true}).waitFor();
  assert.ok((await page.locator('#bg-record-print').innerText()).includes('release.pdf'));
  await page.getByRole('button',{name:'Back to Register',exact:true}).click();
  await page.getByLabel('Status',{exact:true}).selectOption('Closed');
  assert.equal(await page.getByRole('button',{name:'View',exact:true}).count(),1);
  await mkdir('artifacts/ui-review',{recursive:true});await page.screenshot({path:'artifacts/ui-review/bank-guarantees-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  await page.screenshot({path:'artifacts/ui-review/bank-guarantees-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: browser creation, customer/contract autofill, calculation, reload, editing, renewal/document retention, branded internal print, Excel text identifiers, closure, filters and mobile layout.');
} catch(error) {
  if(page){console.error('UI failure:',(await page.locator('body').innerText()).slice(-5000));await mkdir('artifacts/ui-review',{recursive:true});await page.screenshot({path:'artifacts/ui-review/bg-failure.png',fullPage:true});}
  throw error;
} finally {
  if(browser)await browser.close();
  if(projectId)await pool.request().input('Project',sql.Int,projectId).query('DELETE FROM dbo.BankGuaranteeDocuments WHERE GuaranteeId IN (SELECT Id FROM dbo.BankGuarantees WHERE ProjectId=@Project); DELETE FROM dbo.BankGuaranteeHistory WHERE GuaranteeId IN (SELECT Id FROM dbo.BankGuarantees WHERE ProjectId=@Project); DELETE FROM dbo.BankGuarantees WHERE ProjectId=@Project; DELETE FROM dbo.Projects WHERE ProjectId=@Project;');
  if(customerId)await pool.request().input('Customer',sql.Int,customerId).query('DELETE FROM dbo.Customers WHERE CustomerId=@Customer');
  await pool.close();
}
