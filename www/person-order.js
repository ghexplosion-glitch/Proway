/* Capture a person's printing text once, then create ordinary garment rows. */
(() => {
  'use strict';
  const drafts=new Map(),maxItems=20;let app,serial=0;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const newItem=(product='Playera',cut='Hombre')=>({key:'i'+(++serial),product,cut,size:'M',qty:'1',color:'',design:''});
  const draftKey=(profile,order)=>profile+':'+order;
  function reset(){drafts.clear();}
  function draftFor(state){
    const key=draftKey(state.profile.id,state.activeOrderId);
    if(!drafts.has(key))drafts.set(key,{profileId:state.profile.id,orderId:state.activeOrderId,name:'',number:'',color:'',design:'',notes:'',items:[newItem('Playera'),newItem('Short')]});
    return drafts.get(key);
  }
  function printingText(draft){const name=draft.name.trim(),number=draft.number.trim().replace(/^#+/,'');return name+(number?(name?' · ':'')+'#'+number:'');}
  function splitPrintingText(value){
    const text=String(value||''),at=text.lastIndexOf(' · #');
    return at>=0?{name:text.slice(0,at),number:text.slice(at+4)}:text.startsWith('#')?{name:'',number:text.slice(1)}:{name:text,number:''};
  }
  function buildRows(draft,options){
    const limited=(value,max)=>typeof value==='string'&&value.length<=max;
    if(!draft||!limited(draft.name,450)||!limited(draft.number,20)||!limited(draft.color,80)||!limited(draft.design,500)||!limited(draft.notes,500))throw Error('Revisa nombre, número, color, diseño y observaciones.');
    const printed=printingText(draft);if(!printed||draft.number.trim()&&!draft.number.trim().replace(/^#+/,''))throw Error('Escribe el nombre o un número válido de la persona.');
    if(!Array.isArray(draft.items)||!draft.items.length||draft.items.length>maxItems)throw Error('Agrega entre 1 y 20 artículos para la persona.');
    return draft.items.map((item,i)=>{
      const qty=Number(item.qty);
      if(!options.products.includes(item.product)||!options.sizes.includes(item.size)||!options.cuts.includes(item.cut)||!Number.isInteger(qty)||qty<1||qty>10000||!limited(item.color,80)||!limited(item.design,500))throw Error('Revisa producto, talla, corte o cantidad del artículo '+(i+1)+'.');
      return {product:item.product,size:item.size,cut:item.cut,qty,printed,color:(item.color.trim()||draft.color.trim()),design:(item.design.trim()||draft.design.trim()),placement:draft.notes,special:''};
    });
  }
  const options=(values,value)=>values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('');
  function itemSelect(label,field,item,values){const id='pia-person-'+field+'-'+item.key;return '<label class="pia-field" for="'+id+'">'+label+'<select id="'+id+'" data-person-item-field="'+field+'" data-person-item-key="'+item.key+'">'+options(values,item[field])+'</select></label>';}
  function shared(label,key,draft,extra=''){return '<label class="pia-field" for="pia-person-'+key+'">'+label+'<input id="pia-person-'+key+'" data-person-shared="'+key+'" value="'+esc(draft[key])+'" '+extra+'></label>';}
  function screen(state,choices){
    const draft=draftFor(state),key=draftKey(draft.profileId,draft.orderId),order=state.orders.find(o=>o.id===state.activeOrderId),total=draft.items.reduce((n,i)=>n+(Number(i.qty)||0),0);
    return '<details class="pia-panel pia-person-order" id="pia-person-order" '+(!order.rows.length?'open':'')+'><summary>Agregar persona y varios artículos</summary><p>Escribe una sola vez el nombre y número. Agrega los artículos que llevará esa persona.</p><form id="pia-person-form" data-person-draft="'+esc(key)+'"><div class="pia-fields">'+shared('Nombre a imprimir','name',draft,'maxlength="450" autocomplete="off" placeholder="Ej.: Ana López"')+shared('Número a imprimir · opcional','number',draft,'maxlength="20" inputmode="numeric" autocomplete="off" placeholder="Ej.: 00"')+shared('Color general · opcional','color',draft,'maxlength="80" placeholder="Ej.: Azul"')+shared('Código de diseño general · opcional','design',draft,'maxlength="500" placeholder="Ej.: Panteras"')+'</div><p class="pia-help">Nombre y número se copiarán a todos los artículos. Se guardarán como <strong id="pia-person-printing">'+esc(printingText(draft)||'Ana López · #00')+'</strong>.</p><div class="pia-batch-actions"><button type="button" data-person-action="basket">Playera + short</button><button type="button" data-person-action="add" '+(draft.items.length>=maxItems?'disabled':'')+'>＋ Agregar artículo</button></div><div id="pia-person-items">'+draft.items.map((item,i)=>'<section class="pia-person-item" data-person-item="'+item.key+'"><h4 data-person-title="'+item.key+'">Artículo '+(i+1)+' · '+esc(item.product)+'</h4><div class="pia-fields">'+itemSelect('Producto','product',item,choices.products)+itemSelect('Talla','size',item,choices.sizes)+itemSelect('Corte','cut',item,choices.cuts)+'<label class="pia-field" for="pia-person-qty-'+item.key+'">Cantidad de esta prenda<input id="pia-person-qty-'+item.key+'" type="number" inputmode="numeric" min="1" max="10000" required data-person-item-field="qty" data-person-item-key="'+item.key+'" value="'+esc(item.qty)+'"></label></div><details><summary>Color y diseño de este artículo · opcional</summary><div class="pia-fields"><label class="pia-field">Color<input data-person-item-field="color" data-person-item-key="'+item.key+'" maxlength="80" value="'+esc(item.color)+'" placeholder="Usar color general"></label><label class="pia-field">Código de diseño<input data-person-item-field="design" data-person-item-key="'+item.key+'" maxlength="500" value="'+esc(item.design)+'" placeholder="Usar diseño general"></label></div></details><button type="button" class="pia-secondary-button" data-person-action="remove" data-person-item-key="'+item.key+'" '+(draft.items.length===1?'disabled':'')+'>Quitar este artículo</button></section>').join('')+'</div><label class="pia-field pia-person-notes" for="pia-person-notes">Observaciones para estos artículos<textarea id="pia-person-notes" data-person-shared="notes" rows="2" maxlength="500" placeholder="Ej.: nombre en espalda y número al frente.">'+esc(draft.notes)+'</textarea></label><div class="pia-account-line"><span>Prendas que agregarás</span><strong id="pia-person-total">'+total+'</strong></div><small>Una playera y un short cuentan como 2 prendas. Si pides 2 de cada uno, cuentan como 4.</small><button type="submit" class="pia-primary">Agregar persona al pedido</button><small>Al guardar se limpian el nombre, número y observaciones para la siguiente persona; las cantidades vuelven a 1. Cada artículo toma su precio automático en Cotización.</small></form></details>';
  }
  function readForm(form){
    const draft=drafts.get(form.dataset.personDraft);if(!draft)return null;
    form.querySelectorAll('[data-person-shared]').forEach(x=>{draft[x.dataset.personShared]=x.value;});
    form.querySelectorAll('[data-person-item-field]').forEach(x=>{const item=draft.items.find(i=>i.key===x.dataset.personItemKey);if(item)item[x.dataset.personItemField]=x.value;});
    return draft;
  }
  function bind(bridge){
    app=bridge;const root=document.getElementById('proway-pedidos-preview');
    const update=e=>{const form=e.target.closest('#pia-person-form');if(!form)return;const draft=readForm(form);if(!draft)return;form.querySelector('#pia-person-printing').textContent=printingText(draft)||'Ana López · #00';form.querySelector('#pia-person-total').textContent=draft.items.reduce((n,i)=>n+(Number(i.qty)||0),0);draft.items.forEach((i,n)=>{form.querySelector('[data-person-title="'+i.key+'"]').textContent='Artículo '+(n+1)+' · '+i.product;});};
    root.addEventListener('input',update);root.addEventListener('change',update);
    root.addEventListener('click',e=>{
      const b=e.target.closest('[data-person-action]');if(!b||b.disabled)return;const form=b.closest('#pia-person-form'),draft=readForm(form);if(!draft)return;
      const action=b.dataset.personAction;
      if(action==='add'&&draft.items.length<maxItems)draft.items.push(newItem('Butarga',draft.items[0]?.cut));
      else if(action==='remove'&&draft.items.length>1)draft.items=draft.items.filter(i=>i.key!==b.dataset.personItemKey);
      else if(action==='basket'){const cut=draft.items[0]?.cut;draft.items=['Playera','Short'].map(p=>draft.items.find(i=>i.product===p)||newItem(p,cut));}
      app.repaint();
    });
    root.addEventListener('submit',e=>{
      if(e.target.id!=='pia-person-form')return;e.preventDefault();const draft=readForm(e.target);if(!draft)return;
      try{const result=app.addPersonItems(structuredClone(draft));draft.name='';draft.number='';draft.notes='';draft.items.forEach(i=>{i.qty='1';});app.repaint();app.announce(result.printed+' agregado: '+result.garments+' prendas en '+result.rows+' artículos.');root.querySelector('#pia-person-name')?.focus({preventScroll:true});}
      catch(err){app.announce(err.message);}
    });
  }
  window.ProwayPersonOrder={screen,buildRows,printingText,splitPrintingText,bind,reset};
})();
