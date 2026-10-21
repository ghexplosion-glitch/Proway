/* One editor for new people and existing garment rows; drafts stay on this device. */
(() => {
  'use strict';
  const drafts=new Map(),maxItems=20;let app,serial=0,saving=false;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const newItem=(product='Playera',cut='Hombre')=>({key:'i'+(++serial),product,cut,size:'M',qty:'1',color:'',design:'',notes:'',printed:''});
  const draftKey=(profile,order)=>profile+':'+order;
  const normalize=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function reset(){drafts.clear();}
  function fresh(state){return {profileId:state.profile.id,orderId:state.activeOrderId,name:'',number:'',color:'',design:'',notes:'',search:'',editorOpen:false,items:[newItem('Playera'),newItem('Short')]};}
  function draftFor(state){const key=draftKey(state.profile.id,state.activeOrderId);if(!drafts.has(key))drafts.set(key,fresh(state));return drafts.get(key);}
  function printingText(draft){const name=draft.name.trim(),number=draft.number.trim().replace(/^#+/,'');return name+(number?(name?' · ':'')+'#'+number:'');}
  function splitPrintingText(value){
    const text=String(value||''),at=text.lastIndexOf(' · #');
    return at>=0?{name:text.slice(0,at),number:text.slice(at+4)}:text.startsWith('#')?{name:'',number:text.slice(1)}:{name:text,number:''};
  }
  function groups(order){
    const list=new Map();for(const row of order.rows){const key=row.printed?'name:'+row.printed:'row:'+row.id;if(!list.has(key))list.set(key,{key:String(row.id),printed:row.printed||'',rows:[]});list.get(key).rows.push(row);}return [...list.values()];
  }
  function editDraft(state,group){
    const common=field=>group.rows.every(r=>(r[field]||'')===(group.rows[0][field]||''))?group.rows[0][field]||'':'';
    return {...fresh(state),...splitPrintingText(group.printed),editing:true,editorOpen:true,originalRows:structuredClone(group.rows),color:common('color'),design:common('design'),notes:common('placement'),items:group.rows.map(r=>({...newItem(r.product,r.cut),key:'r'+r.id,rowId:r.id,size:r.size,qty:String(r.qty),color:r.color||'',design:r.design||'',notes:r.placement||''}))};
  }
  function sameSource(draft,order){
    if(!draft.editing)return true;
    const original=draft.originalRows;if(!Array.isArray(original)||!original.length)return false;
    const group=groups(order).find(g=>g.rows.some(r=>r.id===original[0].id));
    return !!group&&window.ProwaySyncCore.equal(group.rows,original);
  }
  function buildRows(draft,choices){
    const limited=(value,max)=>typeof value==='string'&&value.length<=max;
    if(!draft||!limited(draft.name,500)||!limited(draft.number,20)||!limited(draft.color,500)||!limited(draft.design,500)||!limited(draft.notes,500))throw Error('Revisa nombre, número, color, diseño y observaciones.');
    const originalText=draft.editing?draft.originalRows?.[0]?.printed:undefined,originalIdentity=splitPrintingText(originalText);
    const printed=originalText!==undefined&&draft.name===originalIdentity.name&&draft.number===originalIdentity.number?originalText:printingText(draft);if(printed.length>500||draft.number.trim()&&!draft.number.trim().replace(/^#+/,''))throw Error('Escribe un nombre o número válido de hasta 500 caracteres.');
    if(!printed&&!draft.editing)throw Error('Escribe el nombre o un número válido de la persona.');
    const limit=draft.editing?Math.max(maxItems,draft.originalRows?.length||0):maxItems;
    if(!Array.isArray(draft.items)||draft.items.length>limit||(!draft.items.length&&!draft.editing))throw Error('Agrega entre 1 y '+limit+' artículos para la persona.');
    const ids=new Set();return draft.items.map((item,i)=>{
      const qty=Number(item.qty);
      if(!choices.products.includes(item.product)||!choices.sizes.includes(item.size)||!choices.cuts.includes(item.cut)||!Number.isInteger(qty)||qty<1||qty>10000||!limited(item.color,500)||!limited(item.design,500)||!limited(item.notes||'',500)||!limited(item.printed||'',500))throw Error('Revisa producto, talla, corte o cantidad del artículo '+(i+1)+'.');
      if(item.rowId!==undefined&&(!draft.editing||!draft.originalRows.some(r=>r.id===item.rowId)||ids.has(item.rowId)))throw Error('El artículo cambió. Abre de nuevo la persona.');if(item.rowId!==undefined)ids.add(item.rowId);
      return {...(item.rowId!==undefined?{id:item.rowId}:{}),product:item.product,size:item.size,cut:item.cut,qty,printed:item.printed?.trim()||printed,color:draft.editing?item.color:item.color.trim()||draft.color.trim(),design:draft.editing?item.design:item.design.trim()||draft.design.trim(),placement:draft.editing?item.notes:item.notes||draft.notes,special:''};
    });
  }
  const options=(values,value)=>values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('');
  function itemSelect(label,field,item,values){const id='pia-person-'+field+'-'+item.key;return '<label class="pia-field" for="'+id+'">'+label+'<select id="'+id+'" data-person-item-field="'+field+'" data-person-item-key="'+item.key+'">'+options(values,item[field])+'</select></label>';}
  function shared(label,key,draft,extra=''){return '<label class="pia-field" for="pia-person-'+key+'">'+label+'<input id="pia-person-'+key+'" data-person-shared="'+key+'" value="'+esc(draft[key])+'" '+extra+'></label>';}
  function screen(state,choices,tools=''){
    const draft=draftFor(state),key=draftKey(draft.profileId,draft.orderId),order=state.orders.find(o=>o.id===state.activeOrderId),list=groups(order),total=draft.items.reduce((n,i)=>n+(Number(i.qty)||0),0),editing=!!draft.editing,stale=editing&&!sameSource(draft,order),limit=editing?Math.max(maxItems,draft.originalRows.length):maxItems;
    return '<details class="pia-panel pia-person-order" id="pia-person-order" open><summary>Personas y artículos · '+order.rows.reduce((n,r)=>n+r.qty,0)+' prendas</summary><p>Agrega una persona o abre una ya guardada para corregir sus prendas en este mismo formulario.</p><button type="button" class="pia-secondary-button" data-person-action="new">＋ Agregar persona</button><details id="pia-person-editor" '+(draft.editorOpen||!order.rows.length?'open':'')+'><summary>'+(editing?'Editar persona · '+esc(draft.originalRows[0].printed||'Sin nombre'):'Nueva persona')+'</summary>'+(stale?'<div class="pia-notice">Este pedido cambió después de abrir la persona. Tus cambios siguen aquí; vuelve a abrir la persona del listado para revisar la versión actual. No se sobrescribirá el pedido.</div>':'')+'<form id="pia-person-form" data-person-draft="'+esc(key)+'"><div class="pia-fields">'+shared('Nombre a imprimir','name',draft,'maxlength="500" autocomplete="off" placeholder="Ej.: Ana López"')+shared('Número a imprimir · opcional','number',draft,'maxlength="20" inputmode="numeric" autocomplete="off" placeholder="Ej.: 00"')+shared('Color para todos · opcional','color',draft,'maxlength="500" placeholder="Varios colores: revisa cada artículo"')+shared('Diseño para todos · opcional','design',draft,'maxlength="500" placeholder="Ej.: Panteras"')+'</div><p class="pia-help">Nombre y número se aplican a sus artículos: <strong id="pia-person-printing">'+esc(printingText(draft)||'Sin nombre')+'</strong>. '+(editing?'Cambiar color, diseño u observaciones generales los aplica a todos; también puedes corregir cada artículo abajo.':'Cada artículo puede tener su propia talla, corte, cantidad, color y diseño.')+'</p><div class="pia-batch-actions">'+(!editing?'<button type="button" data-person-action="single">Una prenda</button><button type="button" data-person-action="basket">Playera + short</button>':'')+'<button type="button" data-person-action="add" '+(draft.items.length>=limit?'disabled':'')+'>＋ Agregar artículo</button></div><div id="pia-person-items">'+draft.items.map((item,i)=>'<section class="pia-person-item" data-person-item="'+item.key+'"><h4 data-person-title="'+item.key+'">Artículo '+(i+1)+' · '+esc(item.product)+'</h4><div class="pia-fields">'+itemSelect('Producto','product',item,choices.products)+itemSelect('Talla','size',item,choices.sizes)+itemSelect('Corte','cut',item,choices.cuts)+'<label class="pia-field" for="pia-person-qty-'+item.key+'">Cantidad de esta prenda<input id="pia-person-qty-'+item.key+'" type="number" inputmode="numeric" min="1" max="10000" required data-person-item-field="qty" data-person-item-key="'+item.key+'" value="'+esc(item.qty)+'"></label></div><details><summary>Color, diseño y observaciones del artículo</summary><div class="pia-fields"><label class="pia-field">Color<input data-person-item-field="color" data-person-item-key="'+item.key+'" maxlength="500" value="'+esc(item.color)+'" placeholder="'+(editing?'Sin color':'Usar color general')+'"></label><label class="pia-field">Código de diseño<input data-person-item-field="design" data-person-item-key="'+item.key+'" maxlength="500" value="'+esc(item.design)+'" placeholder="'+(editing?'Sin diseño':'Usar diseño general')+'"></label><label class="pia-field pia-full">Observaciones de esta prenda<textarea data-person-item-field="notes" data-person-item-key="'+item.key+'" maxlength="500" rows="2" placeholder="'+(editing?'Sin observaciones':'Usar observaciones generales')+'">'+esc(item.notes)+'</textarea></label>'+(editing?'<label class="pia-field pia-full">Texto impreso distinto · opcional<input data-person-item-field="printed" data-person-item-key="'+item.key+'" maxlength="500" value="'+esc(item.printed)+'" placeholder="Usar nombre y número de la persona"></label>':'')+'</div></details><button type="button" class="pia-secondary-button" data-person-action="remove" data-person-item-key="'+item.key+'" '+(!editing&&draft.items.length===1?'disabled':'')+'>Quitar este artículo</button></section>').join('')+'</div>'+(!draft.items.length?'<div class="pia-notice">Al guardar se quitarán los artículos de esta persona del pedido. Los pagos registrados se conservan.</div>':'')+'<label class="pia-field pia-person-notes" for="pia-person-notes">Observaciones para todos los artículos<textarea id="pia-person-notes" data-person-shared="notes" rows="2" maxlength="500" placeholder="Ej.: nombre en espalda y número al frente.">'+esc(draft.notes)+'</textarea></label><div class="pia-account-line"><span>'+(editing?'Prendas después de guardar':'Prendas que agregarás')+'</span><strong id="pia-person-total">'+total+'</strong></div><small>Una playera y un short cuentan como 2 prendas. Si pides 2 de cada uno, cuentan como 4.</small><div class="pia-batch-actions"><button type="submit" class="pia-primary" '+(stale?'disabled':'')+'>'+(editing?(draft.items.length?'Guardar cambios':'Confirmar quitar esta persona'):'Agregar persona al pedido')+'</button><button type="button" data-person-action="cancel">'+(editing?'Cancelar edición':'Limpiar formulario')+'</button></div><small>'+(editing?'Los artículos conservan sus precios individuales. Las prendas nuevas toman el precio automático de su producto. Guarda para aplicar los cambios.':'Al guardar quedan listos los campos para la siguiente persona; las cantidades vuelven a 1.')+'</small></form></details><details id="pia-person-list" open><summary>Personas guardadas · '+list.length+'</summary><label class="pia-field" for="pia-person-search">Buscar persona o número<input id="pia-person-search" type="search" value="'+esc(draft.search)+'" placeholder="Nombre o número"></label><div class="pia-person-list">'+list.map(g=>'<section class="pia-person-card" data-person-group="'+g.key+'" data-person-search="'+esc(normalize(g.printed))+'" '+(draft.search&&!normalize(g.printed).includes(normalize(draft.search))?'hidden':'')+'><strong>'+esc(g.printed||'Sin nombre impreso')+'</strong><small>'+g.rows.reduce((n,r)=>n+r.qty,0)+' prendas · '+g.rows.length+' artículos</small><p>'+g.rows.map(r=>esc(r.qty+' × '+r.product+' · '+r.size+' · '+r.cut)+(r.color?' · '+esc(r.color):'')).join('<br>')+'</p><button type="button" data-person-edit="'+g.key+'">Editar persona y artículos</button></section>').join('')+(list.length?'':'<p>Aún no hay personas guardadas en este pedido.</p>')+'</div></details>'+tools+'</details>';
  }
  function readForm(form){
    const draft=drafts.get(form?.dataset.personDraft);if(!draft)return null;
    form.querySelectorAll('[data-person-shared]').forEach(x=>{draft[x.dataset.personShared]=x.value;});
    form.querySelectorAll('[data-person-item-field]').forEach(x=>{const item=draft.items.find(i=>i.key===x.dataset.personItemKey);if(item)item[x.dataset.personItemField]=x.value;});
    return draft;
  }
  function focusEditor(root){const editor=root.querySelector('#pia-person-editor');if(editor)editor.open=true;root.querySelector('#pia-person-form')?.scrollIntoView({block:'start'});root.querySelector('#pia-person-name')?.focus({preventScroll:true});}
  function bind(bridge){
    app=bridge;const root=document.getElementById('proway-pedidos-preview');
    const update=e=>{
      if(e.target.id==='pia-person-search'){const draft=draftFor(app.getState());draft.search=e.target.value;root.querySelectorAll('[data-person-group]').forEach(card=>{card.hidden=!card.dataset.personSearch.includes(normalize(draft.search));});return;}
      const form=e.target.closest('#pia-person-form');if(!form||saving)return;const draft=readForm(form);if(!draft)return;
      if(draft.editing&&['color','design','notes'].includes(e.target.dataset.personShared)){const field=e.target.dataset.personShared;draft.items.forEach(i=>{i[field]=draft[field];});form.querySelectorAll('[data-person-item-field="'+field+'"]').forEach(x=>{x.value=draft[field];});}
      form.querySelector('#pia-person-printing').textContent=printingText(draft)||'Sin nombre';form.querySelector('#pia-person-total').textContent=draft.items.reduce((n,i)=>n+(Number(i.qty)||0),0);draft.items.forEach((i,n)=>{form.querySelector('[data-person-title="'+i.key+'"]').textContent='Artículo '+(n+1)+' · '+i.product;});
    };
    root.addEventListener('input',update);root.addEventListener('change',update);
    root.addEventListener('click',e=>{
      const b=e.target.closest('[data-person-action],[data-person-edit]');if(!b||b.disabled||saving)return;
      const state=app.getState(),key=draftKey(state.profile.id,state.activeOrderId),order=state.orders.find(o=>o.id===state.activeOrderId);let draft=readForm(root.querySelector('#pia-person-form'))||draftFor(state);
      if(b.dataset.personEdit){const group=groups(order).find(g=>g.key===b.dataset.personEdit);if(!group)return;draft=editDraft(state,group);drafts.set(key,draft);app.repaint();focusEditor(root);return;}
      const action=b.dataset.personAction;
      if(action==='new'){if(draft.editing){draft=fresh(state);drafts.set(key,draft);}draft.editorOpen=true;app.repaint();focusEditor(root);return;}
      if(action==='cancel'){draft=fresh(state);drafts.set(key,draft);app.repaint();return;}
      const limit=draft.editing?Math.max(maxItems,draft.originalRows.length):maxItems;
      if(action==='add'&&draft.items.length<limit){const item=newItem('Butarga',draft.items[0]?.cut);if(draft.editing)Object.assign(item,{color:draft.color,design:draft.design,notes:draft.notes});draft.items.push(item);}
      else if(action==='remove'&&(draft.editing||draft.items.length>1))draft.items=draft.items.filter(i=>i.key!==b.dataset.personItemKey);
      else if(action==='basket'&&!draft.editing){const cut=draft.items[0]?.cut;draft.items=['Playera','Short'].map(p=>draft.items.find(i=>i.product===p)||newItem(p,cut));}
      else if(action==='single'&&!draft.editing)draft.items=[draft.items.find(i=>i.product==='Butarga')||newItem('Butarga',draft.items[0]?.cut)];
      draft.editorOpen=true;app.repaint();
    });
    root.addEventListener('submit',async e=>{
      if(e.target.id!=='pia-person-form')return;e.preventDefault();if(saving)return;const draft=readForm(e.target);if(!draft)return;
      saving=true;const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;
      try{
        const result=await app.savePersonItems(structuredClone(draft));const key=draftKey(draft.profileId,draft.orderId);
        if(drafts.get(key)===draft){if(draft.editing)drafts.set(key,fresh(app.getState()));else{draft.name='';draft.number='';draft.notes='';draft.items.forEach(i=>{i.qty='1';i.notes='';});}}
        app.repaint();app.announce(result.printed+(result.changed===false?' · sin cambios.':result.editing?' actualizado: '+result.garments+' prendas en '+result.rows+' artículos.':' agregado: '+result.garments+' prendas en '+result.rows+' artículos.'));if(!result.editing)root.querySelector('#pia-person-name')?.focus({preventScroll:true});
      }catch(err){app.announce(err.message);}
      finally{saving=false;if(submit.isConnected)submit.disabled=false;}
    });
  }
  window.ProwayPersonOrder={screen,buildRows,printingText,splitPrintingText,groups,sameSource,bind,reset};
})();

