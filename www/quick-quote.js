/* Product estimates are saved as documents, before a personalized order exists. */
(() => {
  'use strict';
  const source='cotizacion_rapida', pending='Nombres, números, tallas y cortes por confirmar al levantar el pedido.';
  const products=['Butarga','Playera','Short','Sudadera','Pants','Conjunto'];
  const sports=['Lucha olímpica','Básquetbol','Fútbol','Voleibol','Atletismo','Multideporte'];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
  let app,draft,dialog,busy=false;
  const item=()=>({product:'',sport:'',qty:'1',price:''});
  const allowed=()=>app.canQuickQuote()&&draft?.profileId===app.getState().profile.id;
  function fresh(){const s=app.getState();return {profileId:s.profile.id,id:'COT-'+ProwayLifecycle.today().slice(0,4)+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),name:'',notes:'',vat:false,items:[item()]};}
  function documentData(){
    if(!draft.items.length||draft.items.length>100)throw Error('Agrega entre 1 y 100 productos.');
    let quantity=0;
    const rows=draft.items.map((r,i)=>{
      const product=r.product.trim(),sport=r.sport.trim(),qty=Number(r.qty),price=Number(r.price);
      if(!product||product.length>100||!sport||sport.length>100)throw Error('Indica producto y deporte en la prenda '+(i+1)+'.');
      if(r.qty===''||!Number.isInteger(qty)||qty<1||qty>10000)throw Error('Revisa la cantidad de la prenda '+(i+1)+'.');
      if(r.price===''||!Number.isFinite(price)||price<0||price>1000000000)throw Error('Falta un precio válido en la prenda '+(i+1)+'.');
      quantity+=qty;return [product,sport,qty,round(price),round(qty*round(price))];
    });
    if(quantity>10000)throw Error('Usa hasta 10,000 prendas por cotización.');
    const subtotal=round(rows.reduce((n,r)=>n+r[4],0)),iva=draft.vat?round(subtotal*.16):0,total=round(subtotal+iva);
    if(total>1000000000)throw Error('El total no puede superar 1,000,000,000 MXN.');
    return {heads:['Producto','Deporte','Cantidad','Precio unitario · MXN','Importe · MXN'],rows,money:[3,4],summary:[['Subtotal',subtotal],...(draft.vat?[['IVA 16%',iva]]:[]),['Total de la cotización',total],['Detalle pendiente',pending],...(draft.notes.trim()?[['Observaciones',draft.notes.trim()]]:[])]};
  }
  function read(rev){
    if(rev.source!==source||!rev.data?.rows?.length)throw Error('Esta no es una cotización rápida.');
    const summary=new Map(rev.data.summary||[]);
    draft={profileId:app.getState().profile.id,id:rev.client,name:rev.name==='Cotización rápida'?'':rev.name,notes:summary.get('Observaciones')||'',vat:summary.has('IVA 16%'),items:rev.data.rows.map(r=>({product:r[0],sport:r[1],qty:String(r[2]),price:String(r[3])}))};
  }
  function recent(){const seen=new Set();return app.getState().revisions.filter(r=>r.source===source).slice().reverse().filter(r=>{if(seen.has(r.client))return false;seen.add(r.client);return true;}).slice(0,20);}
  function field(label,id,value,extra=''){return '<label class="pia-field" for="'+id+'">'+label+'<input id="'+id+'" value="'+esc(value)+'" '+extra+'></label>';}
  const action=(label,name,primary=false)=>'<button type="button" class="'+(primary?'pia-primary':'pia-secondary-button')+'" data-quick-action="'+name+'">'+label+'</button>';
  function paint(){
    dialog.innerHTML='<form id="pia-quick-form"><div class="pia-quick-head"><div><h2>Cotización rápida</h2><small>'+esc(draft.id)+'</small></div>'+action('Cerrar ×','close')+'</div><p class="pia-caption">Cotiza por producto y deporte. Los nombres, números y tallas se agregan al levantar el pedido.</p>'+field('Equipo o referencia · opcional','pia-quick-name',draft.name,'type="text" maxlength="200" placeholder="Ej. Uniformes Jalisco" data-quick-field="name"')+
      '<datalist id="pia-quick-products">'+products.map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist><datalist id="pia-quick-sports">'+sports.map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist><div class="pia-quick-items">'+draft.items.map((r,i)=>'<section class="pia-quick-item" data-quick-row="'+i+'"><div class="pia-quick-head"><strong>Prenda '+(i+1)+'</strong><button type="button" data-quick-remove="'+i+'" '+(draft.items.length===1?'disabled':'')+'>Quitar</button></div><div class="pia-fields">'+field('Producto','pia-quick-product-'+i,r.product,'type="text" required maxlength="100" list="pia-quick-products" placeholder="Elige o escribe una prenda" data-quick-item="product"')+field('Deporte','pia-quick-sport-'+i,r.sport,'type="text" required maxlength="100" list="pia-quick-sports" placeholder="Elige o escribe un deporte" data-quick-item="sport"')+field('Cantidad','pia-quick-qty-'+i,r.qty,'type="number" required min="1" max="10000" step="1" inputmode="numeric" data-quick-item="qty"')+field('Precio unitario · MXN','pia-quick-price-'+i,r.price,'type="number" required min="0" max="1000000000" step="0.01" inputmode="decimal" placeholder="Captura el precio" data-quick-item="price"')+'</div><div class="pia-account-line"><span>Importe</span><strong data-quick-amount="'+i+'"></strong></div></section>').join('')+'</div>'+action('+ Agregar producto','add')+
      '<p class="pia-help">Puedes escribir otro producto o deporte. Los productos con tarifa toman su precio de venta; puedes cambiarlo aquí.</p><label class="pia-check"><input id="pia-quick-vat" type="checkbox" data-quick-field="vat" '+(draft.vat?'checked':'')+'><span>Agregar IVA · 16% sobre el precio base</span></label><label class="pia-field" for="pia-quick-notes">Descripción u observaciones · opcional<textarea id="pia-quick-notes" data-quick-field="notes" maxlength="500" placeholder="Ej. tela, manga o acabado">'+esc(draft.notes)+'</textarea></label><div id="pia-quick-totals" aria-live="polite"></div><p class="pia-help">Cotización / proforma sin timbrar. '+pending+'</p><p id="pia-quick-status" role="status"></p><div class="pia-quick-actions">'+action('Guardar cotización','save',true)+action('Descargar PDF','pdf')+action('Copiar para WhatsApp','copy')+'</div><details class="pia-quick-message"><summary>Ver resumen para enviar</summary><label class="pia-field" for="pia-quick-text">Resumen de la cotización<textarea id="pia-quick-text" readonly rows="10"></textarea></label></details><details class="pia-quick-saved"><summary>Cotizaciones rápidas guardadas en este equipo</summary>'+recent().map(r=>'<button type="button" class="pia-secondary-button" data-quick-saved="'+esc(r.id)+'">'+esc(r.name)+' · '+esc(r.client)+' · v'+r.version+'</button>').join('')+'</details>'+action('Nueva cotización','new')+'</form>';
    totals();
  }
  function textFor(rev){
    const summary=new Map(rev.data.summary),total=summary.get('Total de la cotización');
    return ['PROWAY · Cotización rápida',rev.client+' · v'+rev.version,'Fecha: '+new Date(rev.issuedAt).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'}),...(rev.name!=='Cotización rápida'?[rev.name]:[]),'',...rev.data.rows.map(r=>r[2]+' × '+r[0]+' · '+r[1]+' · '+money(r[3])+' c/u = '+money(r[4])),...(summary.has('IVA 16%')?['','Subtotal: '+money(summary.get('Subtotal')),'IVA 16%: '+money(summary.get('IVA 16%'))]:[]),'','TOTAL: '+money(total)+' MXN',...(summary.has('Observaciones')?['',summary.get('Observaciones')]:[]),'',pending,'Cotización / proforma sin timbrar.','proway.com.mx · WhatsApp 33 1007 9695'].join('\n');
  }
  function preview(){const data=documentData(),name=draft.name.trim()||'Cotización rápida',fingerprint=JSON.stringify({name,data}),last=app.getState().revisions.filter(r=>r.source===source&&r.client===draft.id).at(-1);return {source,client:draft.id,name,version:last?(last.fingerprint===fingerprint?last.version:last.version+1):1,issuedAt:new Date().toISOString(),data};}
  function totals(){
    for(const [i,r] of draft.items.entries())dialog.querySelector('[data-quick-amount="'+i+'"]').textContent=r.price!==''&&r.qty!==''&&Number.isFinite(Number(r.price))&&Number(r.price)>=0&&Number.isInteger(Number(r.qty))&&Number(r.qty)>0?money(round(Number(r.qty)*round(Number(r.price)))):'Pendiente';
    const box=dialog.querySelector('#pia-quick-totals'),text=dialog.querySelector('#pia-quick-text');
    try{const rev=preview();box.innerHTML=rev.data.summary.filter(r=>typeof r[1]==='number').map(r=>'<div class="pia-account-line"><span>'+esc(r[0])+'</span><strong>'+money(r[1])+'</strong></div>').join('');text.value=textFor(rev);}
    catch(err){box.textContent=err.message;text.value='Completa los productos, deportes, cantidades y precios para preparar el resumen.';}
  }
  function status(message,error=false){const el=dialog?.querySelector('#pia-quick-status');if(el){el.textContent=message;el.classList.toggle('pia-quick-error',error);}}
  async function save(){
    if(!allowed())throw Error('Entra como administración para cotizar.');
    if(!dialog.querySelector('form').reportValidity())throw Error('Completa producto, deporte, cantidad y precio.');
    const rev=preview(),fingerprint=JSON.stringify({name:rev.name,data:rev.data}),last=app.getState().revisions.filter(r=>r.source===source&&r.client===draft.id).at(-1);
    if(last?.fingerprint===fingerprint)return last;
    Object.assign(rev,{id:'REV-'+crypto.randomUUID(),version:last?last.version+1:1,time:new Date().toLocaleTimeString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}),fingerprint});
    await app.saveQuickQuote(rev,draft.profileId);return rev;
  }
  function reset(){const current=dialog;dialog=null;draft=null;if(current){current.close();current.remove();}}
  function open(rev){
    if(!app.canQuickQuote()||app.isBusy())throw Error('Entra como administración y espera a que termine la tarea actual.');
    if(dialog?.open)return;
    if(rev)read(rev);else if(!draft||draft.profileId!==app.getState().profile.id)draft=fresh();
    dialog=document.createElement('dialog');dialog.className='pia-quick-dialog';dialog.setAttribute('aria-label','Cotización rápida');
    const current=dialog;dialog.addEventListener('close',()=>{current.remove();if(dialog===current)dialog=null;});
    document.getElementById('proway-pedidos-preview').append(dialog);paint();
    dialog.addEventListener('input',e=>{
      const x=e.target;if(!allowed())return reset();
      if(x.dataset.quickField){draft[x.dataset.quickField]=x.type==='checkbox'?x.checked:x.value;}
      else if(x.dataset.quickItem){const i=Number(x.closest('[data-quick-row]').dataset.quickRow),r=draft.items[i];r[x.dataset.quickItem]=x.value;if(x.dataset.quickItem==='product'){const prices=app.getState().productPrices||{},key=Object.keys(prices).find(p=>p.toLocaleLowerCase('es-MX')===x.value.trim().toLocaleLowerCase('es-MX'));r.price=key&&prices[key]!==null?String(prices[key]):'';dialog.querySelector('#pia-quick-price-'+i).value=r.price;}}
      else return;
      status('Cambios sin guardar.');totals();
    });
    dialog.addEventListener('change',e=>e.stopPropagation());
    dialog.addEventListener('submit',e=>e.preventDefault());
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b)return;e.stopPropagation();if(busy||b.disabled)return;
      if(!allowed())return reset();
      const action=b.dataset.quickAction;
      if(action==='close'){dialog.close();return;}
      if(action==='new'){draft=fresh();paint();return;}
      if(action==='add'){if(draft.items.length>=100){status('Usa hasta 100 productos por cotización.',true);return;}const sport=draft.items.at(-1)?.sport||'';draft.items.push({...item(),sport});paint();dialog.querySelector('#pia-quick-product-'+(draft.items.length-1)).focus();return;}
      if(b.dataset.quickRemove!==undefined){draft.items.splice(Number(b.dataset.quickRemove),1);paint();status('Cambios sin guardar.');return;}
      if(b.dataset.quickSaved){const rev=app.getState().revisions.find(r=>r.id===b.dataset.quickSaved);if(rev){read(rev);paint();status('Versión '+rev.version+' guardada. Edita para preparar una nueva versión.');}return;}
      if(!['save','pdf','copy'].includes(action))return;
      busy=true;dialog.querySelectorAll('button').forEach(x=>x.disabled=true);
      try{
        const rev=await save();if(!dialog||!allowed())return;
        const text=textFor(rev);dialog.querySelector('#pia-quick-text').value=text;
        if(action==='pdf'){await app.exportQuickQuote(rev);status('PDF descargado · '+rev.client+' · v'+rev.version);}
        else if(action==='copy'){try{await navigator.clipboard.writeText(text);status('Resumen copiado. Pégalo en WhatsApp para enviarlo.');}catch{const el=dialog.querySelector('#pia-quick-text');el.closest('details').open=true;el.focus();el.select();status('Selecciona y copia el resumen para enviarlo por WhatsApp.');}}
        else status('Cotización guardada en este equipo · '+rev.client+' · v'+rev.version);
      }catch(err){status(err.message,true);}
      finally{busy=false;if(dialog){dialog.querySelectorAll('button').forEach(x=>x.disabled=false);if(draft.items.length===1)dialog.querySelector('[data-quick-remove]').disabled=true;}}
    });
    dialog.showModal();
  }
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('click',e=>{const b=e.target.closest('[data-action="quick-quote"]');if(!b||b.disabled)return;try{open();}catch(err){app.announce(err.message);}});}
  window.ProwayQuickQuote={bind,open,reset};
})();
