const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');
fs.mkdirSync(out,{recursive:true});
const checks=[],ok=(name,value)=>{assert(value,name);checks.push(name);};
async function routeApp(context){await context.route('https://app.proway.test/**',route=>{
 const u=new URL(route.request().url()),file=path.join(root,'www',u.pathname==='/'?'index.html':u.pathname);
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
 return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});
});}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1100},acceptDownloads:true,serviceWorkers:'block'});
  await routeApp(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://app.proway.test/');await page.locator('[data-action="new-order"]').waitFor();
  const saved=async()=>{await page.evaluate(()=>ProwayPlatform.flush());return page.evaluate(()=>new Promise(resolve=>{
   const request=indexedDB.open('proway-pedidos',1);request.onsuccess=()=>{const db=request.result,q=db.transaction('snapshots').objectStore('snapshots').get('current');q.onsuccess=()=>{resolve(q.result.state);db.close();};};
  }));};
  async function restore(state){await page.locator('[data-screen="dinero"]').click();await page.locator('[data-money="respaldo"]').click();await page.locator('#pia-restore-file').setInputFiles({name:'review-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});await page.locator('[data-action="restore-data"]').click();}
  async function download(file){const wait=page.waitForEvent('download');await page.locator('[data-action="run-export"]').click();const d=await wait;await d.saveAs(path.join(out,file));return d;}
  async function book(file){return page.evaluate(async bytes=>{const w=new ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));return w.worksheets.map(s=>({name:s.name,rows:s.getSheetValues()}));},Array.from(fs.readFileSync(path.join(out,file))));}
  async function review(container){return container.locator('.pia-quote-review-item').evaluateAll(items=>items.map(item=>({prenda:item.querySelector('strong').textContent,color:item.querySelectorAll('dd')[0].textContent,nombre:item.querySelectorAll('dd')[1].textContent,cantidad:item.querySelector('.pia-quote-review-header>span').textContent})));}
  const fixture=await saved(),row=(id,qty,color,printed,product='Butarga',cut='Hombre')=>({id,qty,color,printed,product,cut,size:'M',design:'Cliente revisará',placement:'',special:''});
  Object.assign(fixture.orders[0],{name:'Cliente ficticio revisión',contact:'Prueba',dataOk:true,confirmed:true,payerType:'PF',shippingQuote:{amount:150,description:'Entrega de prueba'},rows:[row(1,1,'Rojo','ANA LÓPEZ'),row(2,2,'Azul','ANA LÓPEZ'),row(3,1,'Rojo','LUISA <MX> & PÉREZ'),row(4,1,'','','Playera','Mujer')]});
  await restore(fixture);await page.locator('[data-screen="cobro"]').click();
  ok('Adding customer detail leaves base quotation total unchanged',(await page.locator('#pia-sale-total').innerText()).includes('4,150.00'));
  await page.locator('[data-action="preview-document"]').click();let visible=await review(page);
  ok('All captured rows appear in customer review, even with identical size and price',visible.length===4&&visible.slice(0,3).every(r=>r.prenda==='Butarga · M · Hombre'));
  ok('Same printed name retains its separate red and blue quantities',visible[0].nombre==='ANA LÓPEZ'&&visible[0].color==='Rojo'&&visible[0].cantidad==='1 prenda'&&visible[1].nombre==='ANA LÓPEZ'&&visible[1].color==='Azul'&&visible[1].cantidad==='2 prendas');
  ok('Different names in the same color stay separately reviewable',visible[2].color==='Rojo'&&visible[2].nombre==='LUISA <MX> & PÉREZ');
  ok('Printed text is displayed literally without creating markup',await page.locator('mx').count()===0);
  ok('Missing values remain visible for the client to verify',visible[3].color==='Por confirmar'&&visible[3].nombre==='Sin nombre indicado');
  ok('Quotation keeps its grouped prices and unchanged total',await page.locator('.pia-doc-quote tbody tr').count()===3&&(await page.locator('.pia-quote-modern').innerText()).includes('$4,150.00'));
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:1100});ok('Review fits at '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:1100});await page.screenshot({path:path.join(out,'quote-review-mobile.png'),fullPage:true});
  await download('quote-review.pdf');let state=await saved(),first=structuredClone(state.revisions.at(-1));
  const projected=fixture.orders[0].rows.map(({product,size,cut,qty,color,printed})=>({product,size,cut,qty,color,printed}));
  ok('Issued quote snapshots exact customer details without internal costs',JSON.stringify(first.quote.reviewRows)===JSON.stringify(projected)&&!JSON.stringify(first.quote.reviewRows).includes('special')&&!JSON.stringify(first.quote.reviewRows).includes('plannedCosts'));
  const pdf=fs.readFileSync(path.join(out,'quote-review.pdf')).toString('latin1');
  ok('PDF contains the review table and both color/name variations',pdf.includes('Nombre impreso')&&pdf.includes('Rojo')&&pdf.includes('Azul')&&pdf.includes('ANA')&&pdf.includes('LUISA'));
  await page.locator('[data-format="excel"]').click();await download('quote-review.xlsx');const workbook=await book('quote-review.xlsx'),detail=workbook.find(s=>s.name==='Prendas para revisión'),detailRows=detail?.rows.filter(r=>r?.[1]==='Butarga'||r?.[1]==='Playera');
  ok('Excel includes a separate complete customer review sheet',detailRows?.length===4&&detail.rows.some(r=>r?.[5]==='Color'&&r?.[6]==='Nombre impreso'));
  ok('Excel pairs each exact name with its own color and quantity',detailRows[0][4]===1&&detailRows[0][5]==='Rojo'&&detailRows[0][6]==='ANA LÓPEZ'&&detailRows[1][4]===2&&detailRows[1][5]==='Azul'&&detailRows[1][6]==='ANA LÓPEZ'&&detailRows[2][6]==='LUISA <MX> & PÉREZ');
  ok('Editable Excel monetary totals remain unchanged',workbook[0].rows.some(r=>r?.[1]==='Total de la cotización'&&r?.[2].result===4150));
  await page.locator('[data-action="close-document"]').click();await page.locator('[data-action="share-quote"]').click();await page.locator('[data-action="queue-link"]').click();const link=await page.locator('#pia-quote-url').inputValue();
  const shared=await browser.newContext({viewport:{width:390,height:1100},serviceWorkers:'block'});await routeApp(shared);const client=await shared.newPage();client.on('pageerror',e=>errors.push(e.message));await client.goto(link);await client.locator('.pia-quote-review').waitFor();
  ok('Client link retains exact colors, names, quantities and amount',JSON.stringify(await review(client))===JSON.stringify(visible)&&(await client.locator('.pia-quote-modern').innerText()).includes('$4,150.00'));
  await page.locator('[data-action="close-document"]').click();await page.locator('[data-screen="pedido"]').click();await page.locator('summary').filter({hasText:'Prendas ·'}).click();await page.locator('[data-row-key="1"] summary').click();await page.locator('#pia-row-name-1').fill('ANA CORREGIDA');await page.locator('#pia-row-name-1').dispatchEvent('change');
  await client.reload();await client.locator('.pia-quote-review').waitFor();ok('Previously sent client link preserves its original reviewed names',(await review(client))[0].nombre==='ANA LÓPEZ');
  await page.locator('[data-screen="cobro"]').click();await page.locator('#pia-add-vat').check();await page.locator('[data-action="preview-document"]').click();visible=await review(page);
  ok('Current quote updates the name from Pedido without repeated capture',visible[0].nombre==='ANA CORREGIDA'&&visible[1].nombre==='ANA LÓPEZ'&&visible[1].color==='Azul');
  ok('Optional extra IVA preserves the review list and adds 16 percent',visible.length===4&&(await page.locator('.pia-quote-modern').innerText()).includes('$4,814.00'));
  await download('quote-review-iva.pdf');await page.locator('[data-format="excel"]').click();await download('quote-review-iva.xlsx');const taxed=await book('quote-review-iva.xlsx');
  ok('IVA Excel retains names, colors and correct tax totals',taxed.find(s=>s.name==='Prendas para revisión').rows.some(r=>r?.[5]==='Rojo'&&r?.[6]==='ANA CORREGIDA')&&taxed[0].rows.some(r=>r?.[1]==='IVA 16%'&&r?.[2].result===664)&&taxed[0].rows.some(r=>r?.[1]==='Total antes de retenciones'&&r?.[2].result===4814));
  state=await saved();ok('Old quotation snapshot stays unchanged after updating names and IVA',JSON.stringify(state.revisions.find(r=>r.id===first.id).quote)===JSON.stringify(first.quote));
  const beforeReload=structuredClone(state.orders);await page.locator('[data-action="close-document"]').click();await page.reload();await page.locator('[data-action="new-order"]').waitFor();ok('Restart preserves every saved order and customer detail',JSON.stringify((await saved()).orders)===JSON.stringify(beforeReload));
  const long=await saved();long.orders[0].rows=Array.from({length:90},(_,i)=>row(i+10,1,i%2?'Azul':'Rojo',i===89?'ULTIMA PRENDA 90':'CLIENTE DE PRUEBA '+String(i+1).padStart(3,'0')));
  await restore(long);await page.locator('[data-screen="cobro"]').click();await page.locator('[data-action="preview-document"]').click();ok('Long quotations show every name including the final garment',await page.locator('.pia-quote-review-item').count()===90&&(await review(page)).at(-1).nombre==='ULTIMA PRENDA 90');await download('quote-review-long.pdf');
  const longPdf=fs.readFileSync(path.join(out,'quote-review-long.pdf')).toString('latin1');ok('Multipage PDF includes the final garment without truncating the list',(longPdf.match(/\/Type \/Page\b/g)||[]).length>2&&longPdf.includes('ULTIMA PRENDA 90'));
  const tooLarge=await page.evaluate(async quote=>{quote.reviewRows=Array.from({length:210},(_,i)=>({product:'Butarga',size:'M',cut:'Hombre',qty:1,color:'Rojo',printed:'A'.repeat(980)+i}));try{await ProwayPlatform.quoteLink(quote);return '';}catch(e){return e.message;}},first.quote);
  ok('Oversized details offer PDF or Excel instead of producing an unreadable link',tooLarge.includes('PDF o Excel'));
  ok('Customer review raises no JavaScript errors',errors.length===0);await shared.close();
  fs.writeFileSync(path.join(out,'quote-review-checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
