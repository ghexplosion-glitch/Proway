const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const checks=[],ok=(name,value)=>{assert(value,name);checks.push(name);};
function letterPdf(file,pages,labels){
 const text=fs.readFileSync(path.join(out,file)).toString('latin1');
 const boxes=[...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m=>m[1].trim().split(/\s+/).map(Number));
 ok(file+' uses portrait Letter on every page',boxes.length===pages&&boxes.every(b=>Math.abs(b[2]-b[0]-612)<.1&&Math.abs(b[3]-b[1]-792)<.1));
 const n='(-?\\d+(?:\\.\\d+)?)',rects=[...text.matchAll(new RegExp(n+'\\s+'+n+'\\s+'+n+'\\s+'+n+'\\s+re\\b','g'))].map(m=>m.slice(1).map(Number));
 ok(file+' keeps every label inside the printable page',rects.length===labels&&rects.every(([x,y,w,h])=>x>=36&&x+w<=576&&y<=756&&y+h>=36));
 return text;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1100},acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.route('https://labels.proway.test/**',route=>{const u=new URL(route.request().url()),file=path.join(root,'www',u.pathname==='/'?'index.html':u.pathname),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});});
  page.on('pageerror',e=>errors.push(e.message));await page.goto('https://labels.proway.test/');await page.locator('[data-action="new-order"]').waitFor();
  const saved=async()=>{await page.evaluate(()=>ProwayPlatform.flush());return page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('proway-pedidos',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('snapshots').objectStore('snapshots').get('current');q.onsuccess=()=>{resolve(q.result.state);db.close();};};}));};
  async function download(selector,file){const wait=page.waitForEvent('download');await page.locator(selector).click();const d=await wait;await d.saveAs(path.join(out,file));return d;}
  async function book(file){return page.evaluate(async bytes=>{const w=new ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));return w.worksheets.map(s=>({name:s.name,paperSize:s.pageSetup.paperSize,rows:s.getSheetValues()}));},Array.from(fs.readFileSync(path.join(out,file))));}
  const fixture=await saved(),row=(id,qty,product,color,printed,cut='Hombre')=>({id,qty,product,color,printed,cut,size:'M',design:'D de prueba',placement:'',special:''});
  Object.assign(fixture.orders[0],{name:'Sonora ficticio',quoteStatus:'active',rows:[row(1,35,'Butarga','Rojo','LUISA PRUEBA')]});
  Object.assign(fixture.orders[1],{name:'Jaguares ficticio',quoteStatus:'active',rows:[row(2,27,'Playera','Azul','ANA PRUEBA','Mujer')]});
  Object.assign(fixture.orders[2],{name:'Descartado ficticio',quoteStatus:'discarded',rows:[row(3,4,'Short','Negro','NO IMPRIMIR')]});
  Object.assign(fixture.orders[3],{name:'Cancelado ficticio',quoteStatus:'cancelled',cancellation:{date:'2026-10-09',reason:'Cancelación ficticia para prueba'},rows:[row(4,6,'Butarga','Negro','NO IMPRIMIR')]});
  fixture.orders[4].rows=[];fixture.activeOrderId='C1';
  await page.evaluate(state=>ProwayPlatform.validateState(state),fixture);
  await page.locator('[data-screen="dinero"]').click();await page.locator('[data-money="respaldo"]').click();await page.locator('#pia-restore-file').setInputFiles({name:'labels-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.locator('[data-action="restore-data"]').click();
  const originalOrders=structuredClone((await saved()).orders);
  await page.locator('[data-screen="taller"]').click();await page.locator('[data-work="etiquetas"]').click();await page.locator('[data-labels-action="all"]').click();
  ok('All 62 labels are visible in the app before exporting',await page.locator('.pia-label[data-label-index]').count()===62&&await page.locator('.pia-label[data-label-index]').last().isVisible());
  ok('Complete preview is already expanded',await page.locator('details[open]>summary').filter({hasText:'Ver todas las etiquetas'}).count()===1);
  ok('Three numbered Carta pages include both clients',await page.locator('.pia-label-page').count()===3&&(await page.locator('.pia-label').first().innerText()).includes('Sonora ficticio')&&(await page.locator('.pia-label').last().innerText()).includes('Jaguares ficticio')&&(await page.locator('.pia-label').last().innerText()).includes('Pieza 27 de 27'));
  ok('Discarded, cancelled and empty orders are excluded from label selection',await page.locator('[data-labels-order="C3"]').count()===0&&await page.locator('[data-labels-order="C4"]').count()===0&&await page.locator('[data-labels-order="C5"]').isDisabled()&&(await page.locator('#pia-labels-total').innerText())==='62');
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:1100});ok('Complete label view fits '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:1100});await page.locator('.pia-label-page').first().screenshot({path:path.join(out,'labels-letter-mobile.png')});
  await page.locator('#pia-labels-start').selectOption({value:'5'});
  await page.waitForFunction(()=>document.querySelectorAll('.pia-label-used').length===5);
  ok('Used positions do not hide or remove new labels',await page.locator('.pia-label-used').count()===5&&await page.locator('.pia-label[data-label-index]').count()===62&&(await page.locator('.pia-label[data-label-index]').first().innerText()).includes('Posición 6'));
  ok('Last Carta page includes the last label in position 19',await page.locator('.pia-label-page').count()===3&&(await page.locator('.pia-label[data-label-index]').last().innerText()).includes('Posición 19'));
  await page.locator('[data-labels-action="preview"]').click();
  ok('Document preview also shows every label and used position',await page.locator('.pia-label[data-label-index]').count()===62&&await page.locator('.pia-label-used').count()===5&&await page.locator('.pia-label-page').count()===3);
  await page.locator('[data-action="close-document"]').click();
  const downloaded=await download('[data-labels-action="pdf"]','labels-letter.pdf');
  ok('Batch filename identifies both customers',downloaded.suggestedFilename().includes('Sonora-ficticio-Jaguares-ficticio'));
  const batchPdf=letterPdf('labels-letter.pdf',3,62);
  ok('Batch PDF includes each client and the final garment',batchPdf.includes('Sonora ficticio')&&batchPdf.includes('Jaguares ficticio')&&batchPdf.includes('C2')&&batchPdf.includes('27 de 27'));
  await download('[data-labels-action="excel"]','labels-letter.xlsx');const workbook=await book('labels-letter.xlsx'),rows=workbook[0].rows.filter(r=>r?.[2]==='Butarga'||r?.[2]==='Playera');
  ok('Every label workbook sheet is configured for Carta printing',workbook.length===2&&workbook.every(s=>s.paperSize===1));
  ok('Excel preserves all labels, names, colors and individual totals',rows.length===62&&rows[34][1]===35&&rows[34][5]==='Sonora ficticio'&&rows[34][6]==='LUISA PRUEBA'&&rows[34][7]==='Rojo'&&rows[34][10]===35&&rows[61][1]===27&&rows[61][5]==='Jaguares ficticio'&&rows[61][6]==='ANA PRUEBA'&&rows[61][7]==='Azul'&&rows[61][10]===27);
  await page.locator('[data-labels-action="preview"]').click();await page.locator('#pia-doc-source').selectOption('etiquetas');
  ok('Single-order preview includes all 35 labels on two Carta pages',await page.locator('.pia-label[data-label-index]').count()===35&&await page.locator('.pia-label-page').count()===2&&await page.locator('.pia-label-used').count()===0&&(await page.locator('.pia-label').last().innerText()).includes('Pieza 35 de 35'));
  await download('[data-action="run-export"]','labels-single-letter.pdf');const singlePdf=letterPdf('labels-single-letter.pdf',2,35);
  ok('Single-order PDF retains the last piece',singlePdf.includes('35 de 35'));
  await page.locator('[data-action="close-document"]').click();await page.locator('[data-labels-action="none"]').click();
  ok('Clearing the selection clears preview and disables export',await page.locator('.pia-label[data-label-index]').count()===0&&await page.locator('[data-labels-action="pdf"]').isDisabled());
  ok('Previewing and printing do not change orders or payments',JSON.stringify((await saved()).orders)===JSON.stringify(originalOrders));
  await page.reload();await page.locator('[data-action="new-order"]').waitFor();
  ok('Reload preserves all original customer rows and payment records',JSON.stringify((await saved()).orders)===JSON.stringify(originalOrders));
  ok('Complete label preview and export raise no JavaScript errors',errors.length===0);
  fs.writeFileSync(path.join(out,'labels-letter-checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
