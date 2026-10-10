const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const checks=[],ok=(name,value)=>{assert(value,name);checks.push(name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1000},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('https://closing.proway.test/**',route=>{const u=new URL(route.request().url()),file=path.join(root,'www',u.pathname==='/'?'index.html':u.pathname),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});});
  page.on('pageerror',e=>errors.push(e.message));await page.goto('https://closing.proway.test/');await page.locator('[data-action="new-order"]').waitFor();await page.locator('#pia-team').waitFor();
  const saved=async()=>{await page.evaluate(()=>ProwayPlatform.flush());return page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('proway-pedidos',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('snapshots').objectStore('snapshots').get('current');q.onsuccess=()=>{resolve(q.result.state);db.close();};};}));};
  const set=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent('change');};
  const amount=async selector=>Number((await page.locator(selector).innerText()).replace(/[^0-9.-]/g,''));
  const money=async()=>{await page.locator('[data-screen="dinero"]').click();await page.locator('[data-money="resumen"]').click();};
  const closed=async()=>{await page.locator('[data-screen="historial"]').click();await page.locator('[data-history="cerrados"]').click();};
  async function download(selector,file){const wait=page.waitForEvent('download');await page.locator(selector).click();const d=await wait;await d.saveAs(path.join(out,file));return d;}
  async function book(file){return page.evaluate(async bytes=>{const w=new ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));return w.worksheets.map(s=>({name:s.name,rows:s.getSheetValues(),pageSetup:s.pageSetup}));},Array.from(fs.readFileSync(path.join(out,file))));}
  const state=await saved(),row=(id,qty=1)=>({id,qty,product:'Butarga',size:'M',cut:'Hombre',color:'Rojo',printed:'NOMBRE FICTICIO '+id,design:'D de prueba',placement:'Espalda',special:''});
  const pay=(amount,date,vatMode='none')=>({amount,date,retention:0,documented:false,simulated:false,vatMode});
  function approved(o,amount,date){Object.assign(o,{payerType:'PF',dataOk:true,confirmed:true,designOk:true,paymentOk:true,advance:amount,advanceDate:date,advanceRecord:pay(amount,date),address:'Domicilio ficticio',startDate:'2026-09-29',released:true});}
  function delivered(o,date){Object.assign(o,{sewn:true,packed:true,shipped:true,delivered:true,shipment:{carrier:'Paquetería ficticia',guide:'GUIA-PRUEBA-'+o.id,date:'2026-10-07',eta:date,status:'Entregado',events:[{status:'Enviado',date:'2026-10-07'},{status:'Entregado',date}]}});o.quality={counts:Object.fromEntries(o.rows.map(r=>[String(r.id),r.qty])),names:true,design:true,notes:'Prueba',checkedAt:'2026-10-06'};}
  Object.assign(state.orders[0],{name:'NL Jaguares ficticio',rows:[row(1,2)],orderDate:'2026-09-29'});approved(state.orders[0],1000,'2026-09-29');state.orders[0].payments=[{id:'PAY-J',concept:'Liquidación ficticia',...pay(600,'2026-10-08')}];delivered(state.orders[0],'2026-10-09');
  state.orders[0].images.front='data:image/png;base64,'+fs.readFileSync(path.join(root,'www/logo.png')).toString('base64');state.orders[0].additionalDesigns=[{id:'D-EXTRA',name:'Extra ficticio',images:{front:null,back:state.orders[0].images.front}}];
  Object.assign(state.orders[1],{name:'Pagado en producción ficticio',rows:[row(2)]});approved(state.orders[1],800,'2026-09-30');state.orders[1].startDate='2026-08-01';
  Object.assign(state.orders[2],{name:'Entregado por cobrar ficticio',rows:[row(3)],vatMode:'added',showVat:true});approved(state.orders[2],464,'2026-10-05');state.orders[2].advanceRecord.vatMode='added';delivered(state.orders[2],'2026-10-09');
  Object.assign(state.orders[3],{name:'Descartado ficticio',quoteStatus:'discarded',rows:[row(4)],advance:200,advanceDate:'2026-10-05'});
  Object.assign(state.orders[4],{name:'Propuesta ficticia',rows:[row(5)]});
  state.rates=[{product:'Butarga',size:'M',cut:'Hombre',cost:80}];
  const expense=(id,client,date,category,baseAmount,iva=0)=>({id,client,date,category,baseAmount,iva,amount:baseAmount+iva,note:'Gasto ficticio'});
  state.expenses=[expense('E1','C1','2026-09-30','Sublimación y corte',200),expense('E2','C1','2026-10-08','Costura',100,16),expense('E3','','2026-10-06','Hilos',50,8),expense('E4','C2','2026-10-07','Tela',100),expense('E5','C1','2026-10-15','Envío',100)];state.activeOrderId='C1';
  await page.evaluate(s=>ProwayPlatform.validateState(s),state);await page.locator('[data-screen="dinero"]').click();await page.locator('[data-money="respaldo"]').click();await page.locator('#pia-restore-file').setInputFiles({name:'closing-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await page.locator('[data-action="restore-data"]').click();
  await page.waitForFunction(()=>document.querySelector('#pia-pending-work')?.textContent==='3'&&!document.querySelector('#pia-order option[value="0"]'));
  const original=await saved();
  ok('Loading old completed work retains all five complete orders',original.orders.length===5&&JSON.stringify(original.orders)===JSON.stringify(state.orders));
  ok('Paid and delivered Jaguares leaves the active selector automatically',await page.locator('#pia-order option[value="0"]').count()===0&&original.activeOrderId==='C2');
  ok('Home includes exactly three jobs still requiring work or payment',await page.locator('#pia-pending-work').innerText()==='3');
  ok('Paid production is still a visible active job',await page.locator('.pia-pending-job[data-open-job="C2"]').count()===1&&(await page.locator('.pia-pending-job[data-open-job="C2"]').innerText()).includes('Liquidada'));
  await page.locator('[data-pending="collect"]').first().click();
  ok('Por cobrar contains only the delivered customer with unpaid balance',await page.locator('.pia-pending-job').count()===1&&await page.locator('.pia-pending-job[data-open-job="C3"]').count()===1);
  await page.locator('[data-pending="alerts"]').first().click();
  ok('A late job alerts its responsible sewing department without future false alerts',await page.locator('.pia-pending-job.late').count()===1&&(await page.locator('.pia-pending-job.late').innerText()).includes('Costura y armado')&&(await page.locator('.pia-pending-job.late').innerText()).includes('Atrasado'));
  await page.screenshot({path:path.join(out,'closing-pending-mobile.png'),fullPage:true});
  await closed();ok('Jaguares appears in Cerrados with its real closing date',await page.locator('[data-open-job="C1"]').count()===1&&(await page.locator('[data-open-job="C1"]').innerText()).includes('9 oct'));
  await page.locator('[data-open-job="C1"]').click();ok('Closed order opens a preserved read-only customer/design file',await page.locator('[data-action="repeat-order"]').count()===1&&await page.locator('#pia-add-form').count()===0&&(await page.locator('#pia-main').innerText()).includes('NL Jaguares ficticio'));
  await money();await page.locator('[data-finance="orders-all"]').click();
  ok('Closing keeps Jaguares in the financial selection',await page.locator('[data-finance-order="C1"]').isChecked()&&(await page.locator('[data-finance-order="C1"]').locator('..').innerText()).includes('Cerrado'));
  ok('Bookkeeping preserves real receipts including the closed job',await amount('#pia-finance-cash')===2864);
  await page.locator('[data-money="cortes"]').click();await page.locator('#pia-cut-mode').selectOption('week');await set('#pia-cut-anchor','2026-10-07');
  ok('Weekly cut uses Monday 5 through Sunday 11 October',(await page.locator('#pia-cut-range').innerText())==='2026-10-05 a 2026-10-11');
  ok('Weekly cash excludes prior and later receipts and typed discarded advances',await amount('#pia-cut-income')===1064);
  ok('Weekly expenses use dates and count general overhead only once',await amount('#pia-cut-expenses')===274&&await amount('#pia-cut-net')===790);
  ok('Cut keeps prior cash separate from current cash flow',await amount('#pia-cut-opening')===1600&&await amount('#pia-cut-closing')===2390);
  ok('Closed customers remain selectable for the cut',await page.locator('[data-cut-order="C1"]').isChecked()&&await page.locator('[data-cut-order="C4"]').count()===0);
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:1000});ok('Cut controls fit '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(out,'closing-cut-mobile.png'),fullPage:true});
  await page.locator('[data-cuts="preview"]').click();ok('Cut preview identifies the chosen period and completed customer',(await page.locator('.pia-doc-sheet').innerText()).includes('2026-10-05')&&(await page.locator('.pia-doc-sheet').innerText()).includes('NL Jaguares ficticio'));
  const pdf=await download('[data-action="run-export"]','closing-weekly-cut.pdf');ok('Export filename identifies the cut and period',pdf.suggestedFilename().includes('Corte-Semanal-2026-10-05-a-2026-10-11'));
  const issued=structuredClone((await saved()).revisions.at(-1));await page.locator('[data-format="excel"]').click();await download('[data-action="run-export"]','closing-weekly-cut.xlsx');const workbook=await book('closing-weekly-cut.xlsx');
  const summary=label=>workbook[0].rows.find(r=>r?.[1]===label)?.[2],clientTable=workbook.find(s=>s.name==='Totales del período por cliente');
  ok('Cut Excel preserves editable receipts, expenses and reconciled cash',summary('Cobros originales').result===1064&&summary('Egresos registrados').result===274&&summary('Disponible de cobros').result===790&&summary('Saldo acumulado al cierre').result===2390);
  ok('Excel keeps income base and IVA separate without lowering garment prices',summary('Base de ingresos')===1000&&summary('IVA de ingresos')===64);
  ok('Excel includes closed Jaguares with its period cash flow',clientTable.rows.some(r=>r?.[1]==='NL Jaguares ficticio'&&r[3]===600&&r[5]===116&&r[6]===484&&r[7]==='Cerrado'));
  ok('General overhead has its own row to reconcile customer totals',clientTable.rows.some(r=>r?.[1]==='Gastos generales'&&r[5]===58&&r[6]===-58));
  ok('Every cut worksheet is available for correction and Sheets import',workbook.length===3);
  ok('All cut worksheets print on Letter landscape',workbook.every(s=>s.pageSetup.paperSize===1&&s.pageSetup.orientation==='landscape'));
  const pdfText=fs.readFileSync(path.join(out,'closing-weekly-cut.pdf')).toString('latin1');ok('PDF contains the period and closed customer totals',pdfText.includes('2026-10-05')&&pdfText.includes('NL Jaguares ficticio')&&pdfText.includes('Cerrado'));
  ok('Cut PDF prints on Letter landscape',/\/MediaBox\s*\[0 0 792\. 612\.\]/.test(pdfText));
  await page.locator('[data-action="close-document"]').click();await page.locator('[data-cuts="none"]').click();
  ok('Clearing selection clears cash, expenses and general overhead',await amount('#pia-cut-income')===0&&await amount('#pia-cut-expenses')===0&&!await page.locator('#pia-cut-general').isChecked());
  await page.locator('summary').filter({hasText:'Pedidos del corte'}).click();await page.locator('[data-cut-order="C1"]').check();
  ok('Selecting Jaguares alone isolates its weekly cash and expense',await amount('#pia-cut-income')===600&&await amount('#pia-cut-expenses')===116&&await amount('#pia-cut-net')===484);
  await page.locator('#pia-cut-general').check();ok('General cost can be included once with one customer',await amount('#pia-cut-expenses')===174);
  await page.locator('[data-cuts="all"]').click();await page.locator('#pia-cut-mode').selectOption('month');await set('#pia-cut-month','2026-10');
  ok('Monthly cut includes all dated October expenses',await amount('#pia-cut-income')===1064&&await amount('#pia-cut-expenses')===374&&await amount('#pia-cut-closing')===2290);
  await page.locator('#pia-cut-mode').selectOption('custom');await set('#pia-cut-from','2026-10-20');await set('#pia-cut-to','2026-10-01');
  ok('An inverted range shows a helpful error and suppresses cut exports',await page.locator('[data-cuts="pdf"]').count()===0&&(await page.locator('#pia-main').innerText()).includes('Desde debe ser anterior'));
  await page.locator('#pia-cut-mode').selectOption('week');
  await closed();await page.locator('[data-open-job="C1"]').click();await page.locator('[data-action="repeat-order"]').evaluate(b=>{b.click();b.click();});await page.locator('#pia-add-form').waitFor({state:'attached'});const repeated=(await saved()).orders.at(-1);
  ok('Repeat creates a distinct folio and fresh unique row identifiers',repeated.id!=='C1'&&repeated.id.startsWith('P')&&repeated.rows[0].id!==1&&repeated.rows[0].qty===2);
  ok('Repeat carries names, colors and all design views without editing the source',repeated.rows[0].printed==='NOMBRE FICTICIO 1'&&repeated.rows[0].color==='Rojo'&&JSON.stringify(repeated.images)===JSON.stringify(original.orders[0].images)&&JSON.stringify(repeated.additionalDesigns)===JSON.stringify(original.orders[0].additionalDesigns)&&JSON.stringify((await saved()).orders[0])===JSON.stringify(original.orders[0]));
  ok('Repeat starts without old money, approvals or production status',repeated.advance===0&&repeated.advanceRecord===null&&repeated.payments.length===0&&repeated.refunds.length===0&&repeated.dataOk===false&&repeated.confirmed===false&&repeated.designOk===false&&repeated.startDate===''&&repeated.shipment.events.length===0&&!repeated.delivered);
  await money();await page.locator('[data-finance="orders-all"]').click();ok('Repeating a proposal invents no actual cash',await amount('#pia-finance-cash')===2864);
  await page.locator('#pia-order').selectOption({value:'1'});await page.locator('[data-screen="taller"]').click();await page.locator('[data-work="costura"]').click();await page.locator('[data-action="sewn"]').click();await page.locator('[data-action="quality-all"]').click();await page.locator('#pia-quality-names').check();await page.locator('#pia-quality-design').check();await page.locator('[data-action="quality-approve"]').click();await page.locator('[data-action="packed"]').click();await set('#pia-carrier','Paquetería ficticia');await set('#pia-guide','GUIA-C2-PRUEBA');await set('#pia-ship-date','2026-10-10');await page.locator('[data-action="shipped"]').click();await page.locator('#pia-shipment-status').selectOption('Entregado');
  ok('Confirming delivery automatically retires an already paid production job',await page.locator('#pia-order option[value="1"]').count()===0&&(await saved()).orders[1].delivered);
  await closed();ok('Both paid delivered customers appear in Cerrados',await page.locator('[data-open-job="C1"]').count()===1&&await page.locator('[data-open-job="C2"]').count()===1&&await page.locator('[data-open-job="C3"]').count()===0);
  await page.locator('#pia-order').selectOption({value:'2'});await page.locator('[data-screen="cobro"]').click();await page.locator('summary').filter({hasText:'Otros pagos recibidos'}).click();await set('#pia-payment-amount',464);await set('#pia-payment-date','2026-10-10');await page.locator('#pia-payment-form button').click();
  ok('Receiving the final real balance closes a previously delivered job',await page.locator('#pia-order option[value="2"]').count()===0&&(await saved()).orders[2].payments.at(-1).amount===464);
  await closed();ok('All three completed customers are archived and still stored',await page.locator('[data-open-job]').count()===3&&(await saved()).orders.length===6);
  await page.locator('[data-screen="tablas"]').click();await page.locator('[data-table="precios"]').click();await set('#pia-base',1000);
  const priced=await saved();ok('Changing general price preserves completed order prices and payments',priced.orders.slice(0,3).every(o=>o.rows.every(r=>r.special===800))&&JSON.stringify(priced.orders[0].payments)===JSON.stringify(original.orders[0].payments));
  await money();await page.locator('[data-finance="orders-all"]').click();ok('Completed historical receipts remain correct after general price changes',await amount('#pia-finance-cash')===3328);
  ok('Previously issued cut snapshot is immutable after delivery, payments and price edits',JSON.stringify((await saved()).revisions.find(r=>r.id===issued.id).data)===JSON.stringify(issued.data));
  await page.locator('[data-screen="inicio"]').click();ok('Active lists now contain only the two remaining proposals',await page.locator('#pia-pending-work').innerText()==='2');
  const beforeReload=await saved();await page.reload();await page.locator('[data-action="new-order"]').waitFor();const afterReload=await saved();ok('Reload preserves original and repeated orders, cash, expenses and snapshots',JSON.stringify(afterReload.orders)===JSON.stringify(beforeReload.orders)&&JSON.stringify(afterReload.expenses)===JSON.stringify(beforeReload.expenses)&&JSON.stringify(afterReload.revisions)===JSON.stringify(beforeReload.revisions));
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:1000});ok('Pending dashboard fits '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await closed();ok('Completed customer archive fits '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('[data-screen="inicio"]').click();}
  for(const index of ['4','5']){await page.locator('#pia-order').selectOption(index);await page.locator('[data-screen="cobro"]').click();await page.locator('summary').filter({hasText:'Cotización no aprobada'}).click();await page.locator('[data-action="discard-quote"]').click();}
  await closed();await page.locator('[data-open-job="C1"]').click();await page.locator('[data-screen="inicio"]').click();
  ok('When all work is complete the picker is disabled and the home remains usable',await page.locator('#pia-order').isDisabled()&&await page.locator('#pia-pending-work').innerText()==='0'&&await page.locator('[data-action="new-order"]').count()===1);
  await page.locator('[data-action="new-order"]').click();await page.locator('#pia-add-form').waitFor({state:'attached'});
  ok('A clean order can be started after closing all work',!await page.locator('#pia-order').isDisabled()&&(await saved()).orders.length===7&&(await saved()).orders.at(-1).rows.length===0);
  ok('New lifecycle and cuts produce no browser errors',errors.length===0);
  fs.writeFileSync(path.join(out,'closing-cuts-checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
