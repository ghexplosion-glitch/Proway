/* Product estimates are saved as documents, before a personalized order exists. */
(() => {
  'use strict';
  const source='cotizacion_rapida', pending='Nombres, números, tallas y cortes por confirmar al levantar el pedido.';
  const products=['Butarga','Playera','Short','Sudadera','Pants','Conjunto'];
  const payerTypes={pending:'Pendiente de confirmar',PF:'Persona física',PM:'Persona moral'};
  const P=ProwayQuotePresentation;
  const currentBrand=()=>P.normalizeBrand(app.getState().quoteBrand||{...P.defaults,rfc:app.getState().issuer?.rfc||''});
  const sports=['Lucha olímpica','Básquetbol','Fútbol','Voleibol','Atletismo','Multideporte'];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
  let app,draft,dialog,busy=false;
  const item=()=>({product:'',sport:'',qty:'1',price:''});
  const allowed=()=>app.canQuickQuote()&&draft?.profileId===app.getState().profile.id;
  function fresh(){const s=app.getState();return {profileId:s.profile.id,id:'COT-'+ProwayLifecycle.today().slice(0,4)+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),name:'',clientName:'',quoteDate:ProwayLifecycle.today(),brand:currentBrand(),designName:'',images:{front:null,back:null},notes:'',vat:false,payerType:'pending',shippingAmount:'0',shippingDescription:'',items:[item()]};}
  function documentData(){
    if(!P.dayValid(draft.quoteDate))throw Error('Revisa la fecha de cotización.');
    if(!P.validBrand(P.normalizeBrand(draft.brand)))throw Error('Revisa los datos de Proway.');
    if(draft.name.length>200||draft.clientName.length>200||draft.designName.length>100)throw Error('Revisa equipo, cliente y nombre del diseño.');
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
    const t=ProwayQuickQuoteTotals.calculate(round(rows.reduce((n,r)=>n+r[4],0)),Number(draft.shippingAmount||0),draft.payerType,draft.vat);
    const shippingDescription=draft.shippingDescription.trim(),corporate=draft.payerType==='PM';
    if(shippingDescription.length>200)throw Error('Usa hasta 200 caracteres en el detalle del envío.');
    return {heads:['Producto','Deporte','Cantidad','Precio unitario · MXN','Importe · MXN'],rows,money:[3,4],summary:[...P.brandRows(P.normalizeBrand(draft.brand)),['Fecha de cotización',draft.quoteDate],['Equipo',draft.name.trim()||'Por confirmar'],['Cliente',draft.clientName.trim()||'Por confirmar'],['Tipo de cliente',payerTypes[draft.payerType]],...(draft.images.front||draft.images.back?[['Diseño previo',draft.designName.trim()||'Imagen de referencia']]:[]),...(t.shipping>0||shippingDescription?[['Importe de prendas',t.goods],['Envío cobrado al cliente',t.shipping]]:[]),...(shippingDescription?[['Detalle del envío',shippingDescription]]:[]),['Subtotal',t.subtotal],...(draft.vat?[['IVA 16%',t.iva]]:[]),[corporate?'Total antes de retenciones':'Total de la cotización',t.total],...(corporate?[['Retención ISR 1.25%',t.retention?-t.retention:0],['Neto a depositar',t.net]]:[]),...(draft.payerType==='pending'?[['Confirmación pendiente','Tipo de cliente por confirmar para determinar retención y neto a depositar.']]:[]),['Detalle pendiente',pending],...(draft.notes.trim()?[['Observaciones',draft.notes.trim()]]:[])]};
  }
  function read(rev){
    if(rev.source!==source||!rev.data?.rows?.length)throw Error('Esta no es una cotización rápida.');
    const summary=new Map(rev.data.summary||[]);
    draft={profileId:app.getState().profile.id,id:rev.client,name:summary.get('Equipo')==='Por confirmar'?'':summary.get('Equipo')||(['Cotización rápida','Cotización'].includes(rev.name)?'':rev.name),clientName:summary.get('Cliente')==='Por confirmar'?'':summary.get('Cliente')||'',quoteDate:P.revisionDay(rev,ProwayLifecycle.today()),brand:P.brandFromRevision(rev,currentBrand()),designName:summary.get('Diseño previo')||rev.additionalDesigns?.[0]?.name||'',images:structuredClone(rev.additionalDesigns?.[0]?.images||rev.images||{front:null,back:null}),notes:summary.get('Observaciones')||'',vat:summary.has('IVA 16%'),payerType:Object.keys(payerTypes).find(k=>payerTypes[k]===summary.get('Tipo de cliente'))||'pending',shippingAmount:String(summary.get('Envío cobrado al cliente')||0),shippingDescription:summary.get('Detalle del envío')||'',items:rev.data.rows.map(r=>({product:r[0],sport:r[1],qty:String(r[2]),price:String(r[3])}))};
  }
  function recent(){const seen=new Set();return app.getState().revisions.filter(r=>r.source===source).slice().reverse().filter(r=>{if(seen.has(r.client))return false;seen.add(r.client);return true;}).slice(0,20);}
  function field(label,id,value,extra=''){return '<label class="pia-field" for="'+id+'">'+label+'<input id="'+id+'" value="'+esc(value)+'" '+extra+'></label>';}
  const action=(label,name,primary=false)=>'<button type="button" class="'+(primary?'pia-primary':'pia-secondary-button')+'" data-quick-action="'+name+'">'+label+'</button>';
  function fiscalHelp(){return draft.payerType==='PM'?'Venta de prendas: el cliente retiene 1.25% de ISR sobre el subtotal sin IVA, incluido el envío cobrado.':draft.payerType==='pending'?'Confirma el tipo de cliente para determinar retención y neto a depositar.':'Precios base en MXN. El IVA se suma cuando lo activas.';}
  function catalog(){
    const state=app.getState(),presets=['rojo','azul'].map(id=>({id:'preset:'+id,name:'Proway '+(id==='rojo'?'Rojo':'Azul'),images:{front:'designs/'+id+'-front.png',back:'designs/'+id+'-back.png'}}));
    const saved=(state.designs||[]).map(d=>({...d,id:'saved:'+d.id}));
    const order=state.orders.find(o=>o.id===state.activeOrderId),local=order?[{id:'order:primary',name:order.name+' · diseño principal',images:order.images},...(order.additionalDesigns||[]).map(d=>({...d,id:'order:'+d.id}))].filter(d=>d.images?.front||d.images?.back):[];
    return [...presets,...saved,...local].slice(0,30);
  }
  function brandScreen(){return '<details class="pia-quick-brand"><summary>Datos de Proway</summary><div class="pia-fields">'+Object.entries({name:'Nombre comercial',rfc:'RFC',phone:'Teléfono',website:'Página web'}).map(([key,label])=>field(label,'pia-quick-brand-'+key,draft.brand[key],'type="text" maxlength="'+({name:200,rfc:20,phone:30,website:300}[key])+'" data-quick-brand="'+key+'"')).join('')+'</div><label class="pia-field">Domicilio<textarea id="pia-quick-brand-address" data-quick-brand="address" maxlength="500">'+esc(draft.brand.address)+'</textarea></label>'+action('Guardar datos de Proway','brand-save')+'</details>';}
  function designScreen(){return '<details class="pia-quick-designs"><summary>Diseño previo de Proway o imagen · opcional</summary><div class="pia-quick-design-catalog">'+catalog().map(d=>'<button type="button" data-quick-design="'+esc(d.id)+'"><strong>'+esc(d.name)+'</strong><span>'+['front','back'].map(side=>d.images[side]?'<img src="'+esc(d.images[side])+'" alt="'+esc(d.name+' '+side)+'" loading="lazy">':'').join('')+'</span></button>').join('')+'</div>'+field('Nombre del diseño · opcional','pia-quick-design-name',draft.designName,'type="text" maxlength="100" data-quick-field="designName"')+'<div class="pia-fields">'+['front','back'].map(side=>'<label class="pia-field">'+(side==='front'?'Imagen o frente':'Espalda · opcional')+'<input type="file" id="pia-quick-image-'+side+'" data-quick-image="'+side+'" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"></label>').join('')+'</div><div class="pia-quick-art">'+['front','back'].map(side=>draft.images[side]?'<figure><img src="'+esc(draft.images[side])+'" alt="Diseño previo '+side+'"><figcaption>'+(side==='front'?'Frente / imagen':'Espalda')+'</figcaption><button type="button" data-quick-image-remove="'+side+'">Quitar imagen</button></figure>':'').join('')+'</div><p class="pia-help">Las imágenes se incluyen en el PDF como referencia para la cotización.</p></details>';}
  function paint(){
    dialog.innerHTML='<form id="pia-quick-form"><div class="pia-quick-head"><div><h2>Cotización</h2><small>'+esc(draft.id)+'</small></div>'+action('Cerrar ×','close')+'</div><div class="pia-quick-business" id="pia-quick-business"></div>'+brandScreen()+'<div class="pia-fields">'+field('Fecha de cotización','pia-quick-date',draft.quoteDate,'type="date" required data-quick-field="quoteDate"')+field('Equipo · opcional','pia-quick-name',draft.name,'type="text" maxlength="200" data-quick-field="name"')+field('Nombre del cliente · opcional','pia-quick-client-name',draft.clientName,'type="text" maxlength="200" data-quick-field="clientName"')+'<label class="pia-field" for="pia-quick-payer-type">Tipo de cliente<select id="pia-quick-payer-type" data-quick-field="payerType">'+Object.entries(payerTypes).map(([key,label])=>'<option value="'+key+'" '+(draft.payerType===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div><p id="pia-quick-fiscal-help" class="pia-help">'+esc(fiscalHelp())+'</p>'+
      '<datalist id="pia-quick-products">'+products.map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist><datalist id="pia-quick-sports">'+sports.map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist><div class="pia-quick-items">'+draft.items.map((r,i)=>'<section class="pia-quick-item" data-quick-row="'+i+'"><div class="pia-quick-head"><strong>Prenda '+(i+1)+'</strong><button type="button" data-quick-remove="'+i+'" '+(draft.items.length===1?'disabled':'')+'>Quitar</button></div><div class="pia-fields">'+field('Producto','pia-quick-product-'+i,r.product,'type="text" required maxlength="100" list="pia-quick-products" placeholder="Elige o escribe una prenda" data-quick-item="product"')+field('Deporte','pia-quick-sport-'+i,r.sport,'type="text" required maxlength="100" list="pia-quick-sports" placeholder="Elige o escribe un deporte" data-quick-item="sport"')+field('Cantidad','pia-quick-qty-'+i,r.qty,'type="number" required min="1" max="10000" step="1" inputmode="numeric" data-quick-item="qty"')+field('Precio unitario · MXN','pia-quick-price-'+i,r.price,'type="number" required min="0" max="1000000000" step="0.01" inputmode="decimal" placeholder="Captura el precio" data-quick-item="price"')+'</div><div class="pia-account-line"><span>Importe</span><strong data-quick-amount="'+i+'"></strong></div></section>').join('')+'</div>'+action('+ Agregar producto','add')+
      '<p class="pia-help">Puedes cotizar por producto y deporte y completar después nombres, números y tallas.</p><div class="pia-fields">'+field('Envío cobrado al cliente · MXN','pia-quick-shipping-amount',draft.shippingAmount,'type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" data-quick-field="shippingAmount"')+field('Detalle del envío · opcional','pia-quick-shipping-description',draft.shippingDescription,'type="text" maxlength="200" data-quick-field="shippingDescription"')+'</div><label class="pia-check"><input id="pia-quick-vat" type="checkbox" data-quick-field="vat" '+(draft.vat?'checked':'')+'><span>Agregar IVA · 16% sobre el precio base</span></label>'+designScreen()+'<label class="pia-field" for="pia-quick-notes">Descripción u observaciones · opcional<textarea id="pia-quick-notes" data-quick-field="notes" maxlength="500">'+esc(draft.notes)+'</textarea></label><div id="pia-quick-totals" aria-live="polite"></div><p class="pia-help">'+pending+'</p><p id="pia-quick-status" role="status"></p><div class="pia-quick-actions">'+action('Guardar cotización','save',true)+action('Descargar PDF','pdf')+action('Copiar para WhatsApp','copy')+'</div><details class="pia-quick-message"><summary>Ver resumen para enviar</summary><label class="pia-field" for="pia-quick-text">Resumen de la cotización<textarea id="pia-quick-text" readonly rows="10"></textarea></label></details><details class="pia-quick-saved"><summary>Cotizaciones guardadas en este equipo</summary>'+recent().map(r=>'<button type="button" class="pia-secondary-button" data-quick-saved="'+esc(r.id)+'">'+esc(r.name)+' · '+esc(r.client)+' · v'+r.version+'</button>').join('')+'</details>'+action('Nueva cotización','new')+'</form>';
    totals();
  }
  function textFor(rev){
    const summary=new Map(rev.data.summary),corporate=summary.get('Tipo de cliente')==='Persona moral',total=summary.get('Total antes de retenciones')??summary.get('Total de la cotización');
    return ['COTIZACIÓN',summary.get('Emisor')||'Proway',rev.client+' · v'+rev.version,'Fecha de cotización: '+P.dateText(summary.get('Fecha de cotización')),...['RFC','Domicilio','Teléfono','Página web','Equipo','Cliente','Tipo de cliente'].filter(k=>summary.has(k)).map(k=>k+': '+summary.get(k)),'',...rev.data.rows.map(r=>r[2]+' × '+r[0]+' · '+r[1]+' · '+money(r[3])+' c/u = '+money(r[4])),...(summary.has('Envío cobrado al cliente')?['Envío cobrado al cliente: '+money(summary.get('Envío cobrado al cliente'))]:[]),...(summary.has('Detalle del envío')?['Detalle del envío: '+summary.get('Detalle del envío')]:[]),...(summary.has('IVA 16%')||corporate||summary.has('Envío cobrado al cliente')?['','Subtotal: '+money(summary.get('Subtotal'))]:[]),...(summary.has('IVA 16%')?['IVA 16%: '+money(summary.get('IVA 16%'))]:[]),'',...(corporate?['TOTAL ANTES DE RETENCIONES: '+money(total)+' MXN','Retención ISR 1.25%: '+money(summary.get('Retención ISR 1.25%')),'NETO A DEPOSITAR: '+money(summary.get('Neto a depositar'))+' MXN']:['TOTAL: '+money(total)+' MXN']),...(summary.has('Diseño previo')?['','Diseño previo: '+summary.get('Diseño previo')+' · imagen de referencia en el PDF']:[]),...(summary.has('Confirmación pendiente')?[summary.get('Confirmación pendiente')]:[]),...(summary.has('Observaciones')?['',summary.get('Observaciones')]:[]),'',pending].join('\n');
  }
  function preview(){const data=documentData(),name=draft.name.trim()||draft.clientName.trim()||'Cotización',additionalDesigns=draft.images.front||draft.images.back?[{id:'COT-DESIGN',name:draft.designName.trim()||'Imagen de referencia',images:structuredClone(draft.images)}]:[],rev={source,client:draft.id,name,issuedAt:new Date().toISOString(),data,images:null,additionalDesigns},fingerprint=P.fingerprint(rev),last=app.getState().revisions.filter(r=>r.source===source&&r.client===draft.id).at(-1);rev.version=last?(last.fingerprint===fingerprint?last.version:last.version+1):1;return rev;}
  function totals(){
    for(const [i,r] of draft.items.entries())dialog.querySelector('[data-quick-amount="'+i+'"]').textContent=r.price!==''&&r.qty!==''&&Number.isFinite(Number(r.price))&&Number(r.price)>=0&&Number.isInteger(Number(r.qty))&&Number(r.qty)>0?money(round(Number(r.qty)*round(Number(r.price)))):'Pendiente';
    const box=dialog.querySelector('#pia-quick-totals'),text=dialog.querySelector('#pia-quick-text');
    dialog.querySelector('#pia-quick-business').textContent=P.brandRows(draft.brand).map(([label,value])=>label+': '+value).join(' · ');
    try{const rev=preview();box.innerHTML=rev.data.summary.filter(r=>typeof r[1]==='number').map(r=>'<div class="pia-account-line"><span>'+esc(r[0])+'</span><strong>'+money(r[1])+'</strong></div>').join('');text.value=textFor(rev);}
    catch(err){box.textContent=err.message;text.value='Completa los productos, deportes, cantidades y precios para preparar el resumen.';}
  }
  function status(message,error=false){const el=dialog?.querySelector('#pia-quick-status');if(el){el.textContent=message;el.classList.toggle('pia-quick-error',error);}}
  async function save(){
    if(!allowed())throw Error('Entra como administración para cotizar.');
    if(!dialog.querySelector('form').reportValidity())throw Error('Completa producto, deporte, cantidad y precio.');
    const rev=preview(),fingerprint=P.fingerprint(rev),last=app.getState().revisions.filter(r=>r.source===source&&r.client===draft.id).at(-1);
    if(last?.fingerprint===fingerprint)return last;
    Object.assign(rev,{id:'REV-'+crypto.randomUUID(),version:last?last.version+1:1,time:new Date().toLocaleTimeString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}),fingerprint});
    await app.saveQuickQuote(rev,draft.profileId);return rev;
  }
  function close(){const current=dialog;dialog=null;if(current){current.close();current.remove();}}
  function reset(){close();draft=null;}
  function open(rev){
    if(!app.canQuickQuote()||app.isBusy())throw Error('Entra como administración y espera a que termine la tarea actual.');
    if(dialog?.open)return;
    dialog?.remove();dialog=null;
    if(rev)read(rev);else if(!draft||draft.profileId!==app.getState().profile.id)draft=fresh();
    dialog=document.createElement('dialog');dialog.className='pia-quick-dialog';dialog.setAttribute('aria-label','Cotización');
    const current=dialog;dialog.addEventListener('close',()=>{current.remove();if(dialog===current)dialog=null;});
    document.getElementById('proway-pedidos-preview').append(dialog);paint();
    dialog.addEventListener('input',e=>{
      const x=e.target;if(!allowed())return reset();
      if(x.dataset.quickBrand){draft.brand[x.dataset.quickBrand]=x.value;status('Cambios sin guardar.');totals();return;}
      if(x.dataset.quickImage)return;
      if(x.dataset.quickField){draft[x.dataset.quickField]=x.type==='checkbox'?x.checked:x.value;if(x.dataset.quickField==='payerType'){if(draft.payerType==='PM'){draft.vat=true;dialog.querySelector('#pia-quick-vat').checked=true;}dialog.querySelector('#pia-quick-fiscal-help').textContent=fiscalHelp();}}
      else if(x.dataset.quickItem){const i=Number(x.closest('[data-quick-row]').dataset.quickRow),r=draft.items[i];r[x.dataset.quickItem]=x.value;if(x.dataset.quickItem==='product'){const prices=app.getState().productPrices||{},key=Object.keys(prices).find(p=>p.toLocaleLowerCase('es-MX')===x.value.trim().toLocaleLowerCase('es-MX'));r.price=key&&prices[key]!==null?String(prices[key]):'';dialog.querySelector('#pia-quick-price-'+i).value=r.price;}}
      else return;
      status('Cambios sin guardar.');totals();
    });
    dialog.addEventListener('change',async e=>{e.stopPropagation();const x=e.target;if(!x.dataset.quickImage||!x.files?.[0]||busy)return;await runBusy(async()=>{const file=x.files[0];if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(file.type)||file.size>12000000)throw Error('Elige una imagen PNG, JPG, WebP o GIF de hasta 12 MB.');const target=draft,data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('No se pudo abrir la imagen.'));r.readAsDataURL(file);}),image=await ProwayPlatform.optimizeImage(data);if(draft!==target||!allowed())return;draft.images[x.dataset.quickImage]=image;draft.designName='Imagen de referencia';paint();status('Imagen agregada. Guarda o descarga la cotización.');});});
    dialog.addEventListener('submit',e=>e.preventDefault());
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b)return;e.stopPropagation();if(busy||b.disabled)return;
      if(!allowed())return reset();
      const action=b.dataset.quickAction;
      if(b.dataset.quickImageRemove){draft.images[b.dataset.quickImageRemove]=null;paint();status('Cambios sin guardar.');return;}
      if(b.dataset.quickDesign){const design=catalog().find(d=>d.id===b.dataset.quickDesign);if(design)await runBusy(async()=>{const target=draft,images={front:null,back:null};for(const side of ['front','back'])if(design.images[side]){let data=design.images[side];if(!data.startsWith('data:')){const response=await fetch(data);if(!response.ok)throw Error('No se pudo abrir el diseño.');const blob=await response.blob();data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}images[side]=await ProwayPlatform.optimizeImage(data);}if(draft!==target||!allowed())return;draft.images=images;draft.designName=design.name;paint();status('Diseño previo agregado.');});return;}
      if(action==='brand-save'){await runBusy(async()=>{draft.brand=P.normalizeBrand(draft.brand);await app.updateQuoteBrand(draft.brand,draft.profileId);paint();status('Datos de Proway guardados para las próximas cotizaciones.');});return;}
      if(action==='close'){close();return;}
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
  async function runBusy(fn){if(busy)return;busy=true;dialog?.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(err){status(err.message,true);}finally{busy=false;if(dialog){dialog.querySelectorAll('button').forEach(b=>b.disabled=false);if(draft.items.length===1)dialog.querySelector('[data-quick-remove]').disabled=true;}}}
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('click',e=>{const b=e.target.closest('[data-action="quick-quote"]');if(!b||b.disabled)return;try{open();}catch(err){app.announce(err.message);}});}
  window.ProwayQuickQuote={bind,open,reset};
})();
