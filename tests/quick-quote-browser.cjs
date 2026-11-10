const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');
fs.mkdirSync(out,{recursive:true});
const checks=[],ok=(name,value)=>{assert(value,name);checks.push(name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:390,height:1000},acceptDownloads:true,permissions:['clipboard-read','clipboard-write'],serviceWorkers:'block'});
  await context.route('https://quick.proway.test/**',route=>{
   const u=new URL(route.request().url()),file=path.join(root,'www',u.pathname==='/'?'index.html':u.pathname);
   if(u.pathname==='/collaboration.js')return route.fulfill({contentType:'application/javascript',body:'window.ProwayCollaboration={start:async b=>{window.quickTestBridge=b;}};'});
   const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
   return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://quick.proway.test/');await page.waitForFunction(()=>!!window.quickTestBridge);
  const saved=async()=>{await page.evaluate(()=>ProwayPlatform.flush());return page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('proway-pedidos',1);q.onsuccess=()=>{const db=q.result,r=db.transaction('snapshots').objectStore('snapshots').get('current');r.onsuccess=()=>{resolve(r.result.state);db.close();};};}));};
  const initial=await saved(),before=JSON.stringify(initial.orders),expenses=JSON.stringify(initial.expenses),prices=JSON.stringify(initial.productPrices);
  await page.locator('[data-action="quick-quote"]').click();const d=page.locator('.pia-quick-dialog');await d.waitFor();
  ok('Quick quote has no athlete, size or cut fields',await d.locator('[data-quick-item="size"],[data-quick-item="cut"],[data-quick-item="printed"]').count()===0);
  await page.locator('#pia-quick-product-0').fill('Butarga');await page.locator('#pia-quick-sport-0').fill('Lucha olímpica');await page.locator('#pia-quick-qty-0').fill('10');
  ok('Known product takes its current catalog sale price',await page.locator('#pia-quick-price-0').inputValue()==='800');
  await d.locator('[data-quick-action="add"]').click();await page.locator('#pia-quick-product-1').fill('Playera');await page.locator('#pia-quick-sport-1').fill('Básquetbol');await page.locator('#pia-quick-qty-1').fill('20');
  ok('Missing product price remains pending instead of inventing a cost',await page.locator('#pia-quick-price-1').inputValue()===''&&(await page.locator('#pia-quick-totals').innerText()).includes('Falta un precio'));
  await d.locator('[data-quick-action="save"]').click();ok('Cannot save an incomplete estimate',(await saved()).revisions.length===0);
  await page.locator('#pia-quick-price-1').fill('300');await d.locator('[data-quick-action="add"]').click();await page.locator('#pia-quick-product-2').fill('Playera');await page.locator('#pia-quick-sport-2').fill('Fútbol');await page.locator('#pia-quick-qty-2').fill('5');await page.locator('#pia-quick-price-2').fill('250');
  ok('Totals aggregate independent product and sport lines',(await page.locator('#pia-quick-totals').innerText()).includes('15,250.00'));
  await d.locator('[data-quick-action="copy"]').click();await page.waitForFunction(()=>document.getElementById('pia-quick-status').textContent.includes('Resumen copiado'));
  const message=await page.evaluate(()=>navigator.clipboard.readText()),state=await saved(),first=structuredClone(state.revisions.at(-1));
  ok('Sends costs without needing a client name',first.name==='Cotización rápida'&&/^COT-\d{4}-[A-F0-9]{12}$/.test(first.client));
  ok('Copy preserves every sport, quantity, unit price and total',message.includes('10 × Butarga · Lucha olímpica')&&message.includes('20 × Playera · Básquetbol')&&message.includes('5 × Playera · Fútbol')&&message.includes('$15,250.00'));
  ok('Copied text contains no private order or costing data',!message.includes('plannedCosts')&&!message.includes('sourceNote')&&!message.includes('ISR'));
  ok('Same product for different sports keeps separate lines',first.data.rows.length===3&&first.data.rows[1][1]==='Básquetbol'&&first.data.rows[2][1]==='Fútbol');
  await d.locator('[data-quick-action="save"]').click();await page.waitForFunction(()=>document.getElementById('pia-quick-status').textContent.includes('Cotización guardada'));
  ok('Saving an unchanged quote does not duplicate its version',(await saved()).revisions.length===1);
  await page.locator('#pia-quick-vat').check();ok('Optional IVA is added on top of base prices',(await page.locator('#pia-quick-totals').innerText()).includes('17,690.00'));
  await page.locator('#pia-quick-name').fill('Equipo de prueba <MX>');await page.locator('#pia-quick-notes').fill('Tela y acabado por confirmar. '.repeat(16));
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:1000});ok('Quick quote fits at '+width+'px',await d.evaluate(el=>el.scrollWidth<=el.clientWidth)&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(out,'quick-quote-mobile.png'),fullPage:true});
  const waiting=page.waitForEvent('download');await d.locator('[data-quick-action="pdf"]').click();const download=await waiting;await download.saveAs(path.join(out,'quick-quote.pdf'));await page.waitForFunction(()=>document.getElementById('pia-quick-status').textContent.includes('PDF descargado'));
  const pdf=fs.readFileSync(path.join(out,'quick-quote.pdf')).toString('latin1');
  ok('Customer PDF includes sports, cost total and pending personalization',pdf.includes('Butarga')&&pdf.includes('Lucha')&&pdf.includes('F\u00fatbol')&&pdf.includes('17,690.00')&&pdf.includes('Nombres')&&pdf.includes('proway.com.mx'));
  let current=await saved();ok('New version preserves the previously sent quotation',current.revisions.length===2&&current.revisions.at(-1).version===2&&JSON.stringify(current.revisions[0])===JSON.stringify(first));
  ok('Quotes never alter existing orders, payments, prices or expenses',JSON.stringify(current.orders)===before&&JSON.stringify(current.expenses)===expenses&&JSON.stringify(current.productPrices)===prices);
  await page.locator('#pia-quick-qty-0').fill('1.5');await d.locator('[data-quick-action="save"]').click();ok('Fractional garment quantities are blocked',(await saved()).revisions.length===2);
  await page.locator('#pia-quick-qty-0').fill('10');await page.locator('#pia-quick-price-0').fill('-1');await d.locator('[data-quick-action="save"]').click();ok('Negative prices are blocked',(await saved()).revisions.length===2);
  await page.locator('#pia-quick-price-0').fill('800');await d.locator('[data-quick-action="close"]').click();await page.reload();await page.waitForFunction(()=>!!window.quickTestBridge);
  ok('Reload preserves all saved quote versions and previous orders',(await saved()).revisions.length===2&&JSON.stringify((await saved()).orders)===before);
  await page.locator('[data-screen="cobro"]').click();await page.locator('[data-action="quick-quote"]').click();await d.locator('.pia-quick-saved summary').click();await d.locator('[data-quick-saved]').first().click();
  ok('Saved quote restores sport lines, IVA and optional reference',await page.locator('#pia-quick-sport-2').inputValue()==='Fútbol'&&await page.locator('#pia-quick-vat').isChecked()&&await page.locator('#pia-quick-name').inputValue()==='Equipo de prueba <MX>');
  await context.setOffline(true);await page.locator('#pia-quick-price-2').fill('0');await d.locator('[data-quick-action="save"]').click();await page.waitForFunction(()=>document.getElementById('pia-quick-status').textContent.includes('Cotización guardada'));
  current=await saved();ok('Offline save accepts an explicit zero price',current.revisions.at(-1).data.rows[2][3]===0&&current.revisions.at(-1).version===3);
  await page.evaluate(()=>quickTestBridge.setRole('costura'));ok('Department accounts cannot access quick quotation prices',await d.count()===0&&await page.evaluate(()=>{try{ProwayQuickQuote.open();return false;}catch{return true;}}));
  await page.evaluate(()=>quickTestBridge.setRole('admin'));await page.locator('[data-screen="inicio"]').click();await page.locator('[data-action="quick-quote"]').click();await page.evaluate(()=>quickTestBridge.lock(true));ok('Locking the account closes the estimate and blocks reopening',await d.count()===0&&await page.evaluate(()=>{try{ProwayQuickQuote.open();return false;}catch{return true;}}));
  ok('Quick quote raises no JavaScript errors',errors.length===0);
  fs.writeFileSync(path.join(out,'quick-quote-checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
