const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),C=require('../www/collaboration-core.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const checks=[],ok=(name,value)=>{assert(value,name);checks.push(name);};
// The real bundled Supabase client speaks HTTP to an isolated model. No real account or order is used.
const uid='00000000-0000-4000-8000-000000000061',workspace='00000000-0000-4000-8000-000000000062';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'two-devices@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-01T00:00:00Z'};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.synthetic-test-only';
const model={orders:[],settings:null,settingsVersion:1,operations:new Map(),calls:0,writes:0};
const jsonb=v=>Array.isArray(v)?v.map(jsonb):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().reverse().map(k=>[k,jsonb(v[k])])):v;
function rpc(args){const {action,payload:p={}}=args;model.calls++;
 if(action==='memberships')return [{id:workspace}];if(action==='members')return [];
 if(action==='sync')return {role:'admin',displayName:'Prueba en dos dispositivos',name:'Equipo sintético',orders:model.orders.filter(o=>(p.versions?.[o.id]||0)<o.version).map(jsonb),settings:(p.settingsVersion||0)<model.settingsVersion?jsonb(model.settings):null,settingsVersion:model.settingsVersion,events:[]};
 if(!['save_order','save_settings'].includes(action))throw Error('Unexpected action '+action);
 if(model.operations.has(p.operationId))return model.operations.get(p.operationId);
 const setting=action==='save_settings';let record=setting?{id:'settings',version:model.settingsVersion,data:model.settings}:model.orders.find(o=>o.id===p.orderId);
 if(!record){
  if(setting||p.baseVersion!==0)throw Error('Invalid creation in the synthetic model');
  record={id:p.orderId,version:1,data:{...structuredClone(p.patch),id:p.orderId}};model.orders.push(record);model.writes++;
  const result={ok:true,id:record.id,version:record.version,data:jsonb(record.data)};model.operations.set(p.operationId,result);return result;
 }
 const conflict=Object.keys(p.patch).some(k=>!C.equal(record.data[k]??null,p.expected[k]??null)&&!C.equal(record.data[k],p.patch[k]))||Object.keys(p.guards||{}).some(k=>!C.equal(record.data[k]??null,p.guards[k]));
 if(conflict)return {conflict:true,id:record.id,version:record.version,data:jsonb(record.data)};
 record.data={...record.data,...structuredClone(p.patch)};record.version++;model.writes++;
 if(setting){model.settings=record.data;model.settingsVersion=record.version;}
 const result={ok:true,id:record.id,version:record.version,data:jsonb(record.data)};model.operations.set(p.operationId,result);return result;
}
(async()=>{const port=4402,server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)}});await new Promise(r=>server.stdout.once('data',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PROWAY_CHROME});const errors=[],unexpected=[];
  async function device(width){const context=await browser.newContext({viewport:{width,height:1000}});await context.route('https://*.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    if(url.pathname==='/auth/v1/token'){await route.fulfill({headers,body:JSON.stringify({access_token:token,refresh_token:'synthetic-test-refresh',token_type:'bearer',expires_in:86400,user})});return;}
    if(url.pathname==='/auth/v1/user'){await route.fulfill({headers,body:JSON.stringify(user)});return;}
    if(url.pathname==='/rest/v1/rpc/proway_api'){try{await route.fulfill({headers,body:JSON.stringify(rpc(req.postDataJSON()))});}catch(e){await route.fulfill({status:400,headers,body:JSON.stringify({code:'P0001',message:e.message})});}return;}
    unexpected.push(url.pathname);await route.abort();
   });const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:'+port);await page.locator('[data-action="new-order"]').waitFor();return {context,page};}
  const a=await device(390),b=await device(1024);
  const saved=async page=>{await page.evaluate(()=>ProwayPlatform.flush());return page.evaluate(()=>ProwayPlatform.readAux('current').then(x=>x.state));};
  const fixture=await saved(a.page);for(let i=0;i<fixture.orders.length;i++){const o=fixture.orders[i];o.name='Cliente sintético '+(i+1);o.rows=[{id:i+1,product:'Butarga',size:'M',cut:i%2?'Mujer':'Hombre',qty:i+1,printed:'PRUEBA '+(i+1),color:'Rojo',design:'Prueba',placement:'',special:''}];o.vatMode='none';}
  model.orders=fixture.orders.map(o=>({id:o.id,data:structuredClone(o),version:1}));model.settings=C.settings(fixture);
  async function login(page){await page.locator('#pia-team').click();await page.locator('#pia-team-auth [name=email]').fill(user.email);await page.locator('#pia-team-auth [name=password]').fill('Synthetic-test-password');await page.locator('#pia-team-auth button').click();await page.waitForFunction(()=>ProwayCollaboration.getRole()==='admin'&&document.getElementById('pia-cloud-status').textContent.includes('Sincronizado'));await page.locator('[data-team="close"]').click();}
  await login(a.page);await login(b.page);await a.page.waitForFunction(()=>!!navigator.serviceWorker.controller);await b.page.waitForFunction(()=>!!navigator.serviceWorker.controller);ok('Cell and computer use the same user and team',await a.page.evaluate(()=>JSON.parse(localStorage.getItem('proway-active-account-v1')).userId)===uid&&await b.page.evaluate(()=>JSON.parse(localStorage.getItem('proway-active-account-v1')).userId)===uid);
  ok('Both devices receive the same complete five orders',JSON.stringify((await saved(a.page)).orders)===JSON.stringify((await saved(b.page)).orders));ok('Connecting does not manufacture cloud writes',model.writes===0);
  const edit=async(page,id,value)=>{await page.locator('[data-screen="pedido"]').click();await page.locator(id).fill(value);await page.locator(id).dispatchEvent('change');await page.locator('[data-screen="inicio"]').click();await page.evaluate(()=>ProwayPlatform.flush());};
  await a.context.setOffline(true);await edit(a.page,'#pia-contact','Contacto capturado sin conexión');
  ok('Offline edit stays in the durable account outbox',await a.page.evaluate(async()=>{const m=await ProwayPlatform.readAux();return m.pending.C1.desired.contact==='Contacto capturado sin conexión';}));ok('An offline edit cannot alter the other device',model.orders[0].data.contact!== 'Contacto capturado sin conexión');
  await a.page.reload();await a.page.waitForFunction(()=>ProwayCollaboration.getRole()==='admin');ok('Offline restart retains account, order and pending edit',(await saved(a.page)).orders[0].contact==='Contacto capturado sin conexión');
  await b.page.locator('#pia-order').selectOption('1');await edit(b.page,'#pia-phone','5551234567');await b.page.evaluate(()=>ProwayCollaboration.sync(true));ok('Computer independently sends its own order edit',model.orders[1].data.phone==='5551234567');
  await a.context.setOffline(false);await a.page.evaluate(()=>ProwayCollaboration.sync(true));await a.page.waitForFunction(()=>document.getElementById('pia-cloud-status').textContent.includes('Sincronizado'));await b.page.evaluate(()=>ProwayCollaboration.sync(true));
  ok('Reconnect combines different orders without losing either change',(await saved(a.page)).orders[0].contact==='Contacto capturado sin conexión'&&(await saved(a.page)).orders[1].phone==='5551234567'&&(await saved(b.page)).orders[0].contact==='Contacto capturado sin conexión');
  ok('Acknowledged changes empty both durable outboxes',await a.page.evaluate(async()=>Object.keys((await ProwayPlatform.readAux()).pending).length===0)&&await b.page.evaluate(async()=>Object.keys((await ProwayPlatform.readAux()).pending).length===0));
  await a.context.setOffline(true);await a.page.locator('#pia-order').selectOption('0');await edit(a.page,'#pia-contact','Cambio del celular en conflicto');await b.page.locator('#pia-order').selectOption('0');await edit(b.page,'#pia-contact','Cambio de computadora validado');await b.page.evaluate(()=>ProwayCollaboration.sync(true));
  await a.context.setOffline(false);await a.page.evaluate(()=>ProwayCollaboration.sync(true));await a.page.waitForFunction(()=>document.getElementById('pia-cloud-status').textContent.includes('conflicto'));
  ok('Concurrent same-field edits require review instead of overwriting',model.orders[0].data.contact==='Cambio de computadora validado'&&(await saved(a.page)).orders[0].contact==='Cambio del celular en conflicto');
  await a.page.reload();await a.page.waitForFunction(()=>ProwayCollaboration.getRole()==='admin'&&document.getElementById('pia-cloud-status').textContent.includes('conflicto'));ok('Conflict and recoverable local edit survive a restart',(await saved(a.page)).orders[0].contact==='Cambio del celular en conflicto');
  await a.page.locator('#pia-team').click();await a.page.locator('[data-team="conflict-cloud"]').click();await a.page.waitForFunction(()=>document.getElementById('pia-cloud-status').textContent.includes('Sincronizado'));await a.page.locator('[data-team="close"]').click();
  const backups=await a.page.evaluate(()=>ProwayPlatform.listCheckpoints()),review=backups.find(x=>x.reason.includes('conflicto'));ok('Resolving a conflict first makes a recoverable checkpoint',!!review);ok('Checkpoint preserves the local version before selecting the team copy',await a.page.evaluate(async id=>(await ProwayPlatform.readCheckpoint(id)).state.orders[0].contact==='Cambio del celular en conflicto',review.id));
  ok('Reviewed team copy reaches both devices',(await saved(a.page)).orders[0].contact==='Cambio de computadora validado'&&(await saved(b.page)).orders[0].contact==='Cambio de computadora validado');
  await a.page.locator('[data-screen="taller"]').click();await a.page.locator('[data-work="diseño"]').click();await a.page.evaluate(()=>{window.__repaints=0;new MutationObserver(()=>__repaints++).observe(document.getElementById('pia-main'),{childList:true});});const writes=model.writes;for(let i=0;i<4;i++)await a.page.evaluate(()=>ProwayCollaboration.sync(true));ok('Repeated genuine SDK pulls do not repaint a department or write unchanged data',await a.page.evaluate(()=>__repaints===0)&&model.writes===writes);
  const completed=model.orders.find(o=>o.id==='C3'),amount=completed.data.rows.reduce((n,r)=>n+r.qty*800,0);
  Object.assign(completed.data,{payerType:'PF',dataOk:true,confirmed:true,designOk:true,paymentOk:true,advance:amount,advanceDate:'2026-10-08',advanceRecord:{amount,date:'2026-10-08',retention:0,documented:false,simulated:false,vatMode:'none'},startDate:'2026-09-11',released:true,sewn:true,packed:true,shipped:true,delivered:true,shipment:{carrier:'Paquetería sintética',guide:'PRUEBA-C3',date:'2026-10-08',eta:'2026-10-09',status:'Entregado',events:[{status:'Entregado',date:'2026-10-09'}]},quality:{counts:Object.fromEntries(completed.data.rows.map(r=>[String(r.id),r.qty])),names:true,design:true,notes:'Prueba',checkedAt:'2026-10-08'}});completed.version++;
  const finished=structuredClone(completed.data);for(const device of [a,b]){await device.page.evaluate(()=>ProwayCollaboration.sync(true));await device.page.locator('[data-screen="inicio"]').click();}
  ok('A paid delivered job closes on both devices after a pull',await a.page.locator('#pia-order option[value="2"]').count()===0&&await b.page.locator('#pia-order option[value="2"]').count()===0&&C.equal((await saved(a.page)).orders.find(o=>o.id==='C3'),finished));
  ok('Derived closure creates no server writes',model.writes===writes);
  await a.context.setOffline(true);await a.page.locator('[data-screen="historial"]').click();await a.page.locator('[data-history="cerrados"]').click();await a.page.locator('[data-open-job="C3"]').click();await a.page.locator('[data-action="repeat-order"]').click();await a.page.locator('#pia-add-form').waitFor({state:'attached'});const repeated=(await saved(a.page)).orders.at(-1);
  ok('Repeating offline creates a new unpaid order with the same names and colors',repeated.id!=='C3'&&repeated.rows[0].printed===finished.rows[0].printed&&repeated.rows[0].color===finished.rows[0].color&&repeated.payments.length===0&&repeated.advance===0&&!repeated.confirmed);
  ok('The repeated order stays durable and pending on the phone until reconnect',await a.page.evaluate(async id=>!!(await ProwayPlatform.readAux()).pending[id],repeated.id)&&!model.orders.some(o=>o.id===repeated.id));
  await a.context.setOffline(false);await a.page.evaluate(()=>ProwayCollaboration.sync(true));await b.page.evaluate(()=>ProwayCollaboration.sync(true));
  ok('Reconnecting sends the repeated order to the computer exactly once',model.orders.filter(o=>o.id===repeated.id).length===1&&(await saved(a.page)).orders.length===6&&(await saved(b.page)).orders.some(o=>o.id===repeated.id&&o.rows[0].printed===finished.rows[0].printed));
  ok('Repeat and synchronization preserve the original closed payments',C.equal(model.orders.find(o=>o.id==='C3').data,finished));
  ok('Cellular and desktop layouts fit',await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  ok('Test contacts only its isolated HTTP model',unexpected.length===0);ok('Two-device workflows raise no JavaScript errors',errors.length===0);fs.writeFileSync(path.join(out,'two-devices-checks.json'),JSON.stringify({passed:checks.length,checks,errors,simulated:true},null,2));console.log(JSON.stringify({passed:checks.length,errors}));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
