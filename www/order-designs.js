/* Several named designs in one order. Selection is a local draft, never an order copy. */
(() => {
  'use strict';
  let app;
  const drafts=new Map(),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=s=>(s.profile?.id||'')+':'+s.activeOrderId;
  const code=x=>String(x||'').trim().toLocaleLowerCase('es-MX');
  const primary=x=>!code(x)||code(x)==='diseño principal';
  function draft(s){const k=key(s);if(!drafts.has(k))drafts.set(k,{profileId:s.profile.id,orderId:s.activeOrderId,selected:[],source:null,filter:'*',product:'*',cut:'*',size:'*',search:'',target:'',name:'',open:false});return drafts.get(k);}
  function visible(r,d){return ProwayPresentation.sorted(r.rows.filter(x=>(d.product==='*'||x.product===d.product)&&(d.filter==='*'||(d.filter===''?primary(x.design):code(x.design)===code(d.filter)))&&code([x.printed,x.product,x.size,x.cut,x.color,x.design].join(' ')).includes(code(d.search))&&(d.size==='*'||x.size===d.size)&&(d.cut==='*'||x.cut===d.cut)));}
  function same(d,r){return !d.source||ProwaySyncCore.equal(d.source,{rows:r.rows,images:r.images,additionalDesigns:r.additionalDesigns});}
  function remember(d,r){if(!d.source)d.source=structuredClone({rows:r.rows,images:r.images,additionalDesigns:r.additionalDesigns});}
  function plan(r,d){
    if(!same(d,r))throw Error('El listado o sus diseños cambiaron. Limpia la selección y vuelve a elegir las prendas.');
    const ids=new Set(d.selected),rows=r.rows.filter(x=>ids.has(x.id));
    if(!rows.length||rows.length!==ids.size)throw Error('Selecciona las prendas de este pedido.');
    let designId='',name='',create=false;
    if(d.target==='clear'){designId='clear';name='Sin diseño';}
    else if(d.target==='primary'){designId='primary';name='';}
    else if(d.target.startsWith('id:')){const design=r.additionalDesigns.find(x=>x.id===d.target.slice(3));if(!design)throw Error('El diseño ya no está disponible.');designId=design.id;name=design.name;}
    else {
      name=(d.target==='new'?d.name:d.target.startsWith('code:')?d.target.slice(5):'').trim();
      if(!name||name.length>100||primary(name)||ProwayDesignEditor.unassigned(name))throw Error('Escribe un nombre de diseño de 1 a 100 caracteres, distinto de Diseño principal.');
      const matches=r.additionalDesigns.filter(x=>code(x.name)===code(name));
      if(matches.length>1)throw Error('Hay dos diseños con ese nombre. Corrige sus nombres antes de asignarlos.');
      if(matches.length){designId=matches[0].id;name=matches[0].name;}
      else {if(r.additionalDesigns.length>=8)throw Error('Puedes incluir hasta 9 diseños en el mismo pedido.');create=true;}
    }
    return {ids:rows.map(x=>x.id),quantity:rows.reduce((n,x)=>n+x.qty,0),name,designId,create,changed:create||rows.some(x=>x.design!==name)};
  }
  function screen(s){
    const r=s.orders.find(x=>x.id===s.activeOrderId);if(!r.rows.length)return '<p class="pia-help">Agrega prendas para asignarles sus diseños.</p>';
    const d=draft(s),list=visible(r,d),ids=new Set(d.selected),chosen=r.rows.filter(x=>ids.has(x.id)),quantity=chosen.reduce((n,x)=>n+x.qty,0),stale=!same(d,r);
    const codes=[...new Set(r.rows.map(x=>x.design.trim()).filter(x=>!primary(x)))],unlinked=codes.filter(x=>!ProwayDesignEditor.unassigned(x)&&!r.additionalDesigns.some(a=>code(a.name)===code(x))),option=(value,label)=>'<option value="'+esc(value)+'" '+(d.target===value?'selected':'')+'>'+esc(label)+'</option>';
    const target=d.target==='primary'?{name:'Diseño principal',images:r.images}:r.additionalDesigns.find(x=>'id:'+x.id===d.target);
    const artwork=target?'<section class="pia-chosen-design"><strong>Diseño elegido: '+esc(target.name)+'</strong><div class="pia-art-grid">'+['front','back'].map(side=>'<div class="pia-art-box"><div class="pia-art">'+(target.images[side]?'<img src="'+esc(target.images[side])+'" alt="'+esc(target.name)+' · '+(side==='front'?'Frente':'Espalda')+'">':'<span class="pia-art-empty">Imagen pendiente</span>')+'</div><small>'+(side==='front'?'Frente':'Espalda')+'</small></div>').join('')+'</div><button type="button" data-order-design-action="edit" class="pia-secondary-button">Editar este diseño</button></section>':'';
    let ready=false,readyVisible=false;try{ready=!!plan(r,d);}catch{}try{readyVisible=!!plan(r,{...d,selected:list.map(x=>x.id)});}catch{}
    const targetField='<button type="button" id="pia-choose-batch-design" data-order-tools-pick="1" data-design-input-id="pia-design-target">Elegir diseño con imágenes</button><label class="pia-field">Diseño para aplicar<select id="pia-design-target">'+option('','Elegir diseño…')+option('primary','Diseño principal')+r.additionalDesigns.map(x=>option('id:'+x.id,x.name)).join('')+unlinked.map(x=>option('code:'+x,x+' · cargar imágenes')).join('')+option('new','＋ Crear otro diseño')+option('clear','Sin diseño · quitar asignación')+'</select></label>'+(d.target==='new'?'<label class="pia-field">Nombre del nuevo diseño<input id="pia-design-new-name" maxlength="100" value="'+esc(d.name)+'" placeholder="Ej. ASIS-PREPA"></label>':'');
    return '<details id="pia-design-selection" class="pia-design-selection" '+(d.open?'open':'')+'><summary>Seleccionar prendas y asignar diseño</summary><p class="pia-help">Elige un diseño, filtra y aplica a las visibles o marca solo las prendas que necesitas. Puedes editar nombres e imágenes en la biblioteca.</p>'+
      '<div class="pia-assignment-toolbar">'+targetField+'<p class="pia-meta" id="pia-design-selected">'+quantity+' prendas seleccionadas · '+chosen.length+' renglones'+(chosen.length>list.filter(x=>ids.has(x.id)).length?' · incluye prendas fuera del filtro':'')+'</p><div class="pia-design-edit-actions"><button type="button" class="pia-primary" data-order-design-action="apply" '+(!ready?'disabled':'')+'>Asignar a seleccionadas</button><button type="button" data-order-design-action="clear" '+(!chosen.length||stale?'disabled':'')+'>Quitar diseño de seleccionadas</button><button type="button" data-order-design-action="apply-visible" '+(!readyVisible?'disabled':'')+'>Aplicar a visibles · '+list.reduce((n,x)=>n+x.qty,0)+' prendas</button></div></div>'+artwork+
      '<div class="pia-fields"><label class="pia-field">Producto<select id="pia-design-product"><option value="*">Todos los productos</option>'+[...new Set(r.rows.map(x=>x.product))].map(x=>'<option '+(d.product===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label class="pia-field">Corte<select id="pia-design-cut"><option value="*">Hombre y Mujer</option>'+['Hombre','Mujer'].map(x=>'<option '+(d.cut===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label class="pia-field">Talla<select id="pia-design-size"><option value="*">Todas las tallas</option>'+[...new Set(ProwayPresentation.sorted(r.rows).map(x=>x.size))].map(x=>'<option value="'+esc(x)+'" '+(d.size===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label class="pia-field">Diseño actual<select id="pia-design-filter"><option value="*" '+(d.filter==='*'?'selected':'')+'>Todos los diseños</option><option value="" '+(d.filter===''?'selected':'')+'>Principal / sin código</option>'+codes.map(x=>'<option value="'+esc(x)+'" '+(d.filter===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label></div>'+
      '<label class="pia-field">Buscar persona, número o color<input id="pia-design-search" value="'+esc(d.search)+'" placeholder="Nombre, número o color…"></label><div class="pia-batch-actions"><button type="button" data-order-design-action="all">Seleccionar las visibles</button><button type="button" data-order-design-action="none">Limpiar selección</button></div>'+
      '<div class="pia-design-rows" data-scroll-key="design-rows">'+list.map((x,i)=>'<label class="pia-check"><input id="pia-design-row-'+x.id+'" type="checkbox" data-order-design-row="'+x.id+'" '+(ids.has(x.id)?'checked':'')+'><span><strong>'+(i+1)+'. '+esc(x.printed||'Sin nombre impreso')+'</strong><small>'+esc(x.product+' · '+x.size+' · '+x.cut)+' · '+x.qty+' '+(x.qty===1?'prenda':'prendas')+'<br>'+esc(x.color||'Sin color')+' · '+esc(x.design||'Diseño principal')+'</small></span></label>').join('')+(list.length?'':'<p>No hay prendas con estos filtros.</p>')+'</div>'+
      (stale?'<p class="pia-notice">El pedido cambió. Limpia la selección para trabajar con sus datos actuales.</p>':'')+'<small>Cada renglón incluye todas sus piezas. Quitar diseño deja la prenda marcada Sin diseño y no modifica precios ni pagos.</small></details>';
  }

  function focusImages(id){const main=document.getElementById('pia-main'),section=id==='primary'?main.querySelector('.pia-primary-design'):main.querySelector('[data-order-design="'+CSS.escape(id)+'"]');if(!section)return;for(let p=section.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;section.scrollIntoView({block:'start'});section.querySelector('input[data-design-name],input[data-primary-design-name]')?.focus({preventScroll:true});}
  function bind(bridge){app=bridge;const root=document.getElementById('proway-pedidos-preview');
    root.addEventListener('toggle',e=>{if(e.target.id==='pia-design-selection'&&e.target.isConnected)draft(app.getState()).open=e.target.open;},true);
    const update=x=>{const s=app.getState(),r=s.orders.find(x=>x.id===s.activeOrderId),d=draft(s);d.open=true;
      if(x.dataset.orderDesignRow){remember(d,r);const id=Number(x.dataset.orderDesignRow);d.selected=x.checked?[...new Set([...d.selected,id])]:d.selected.filter(a=>a!==id);}
      else if(x.id==='pia-design-filter')d.filter=x.value;
      else if(x.id==='pia-design-size')d.size=x.value;
      else if(x.id==='pia-design-cut')d.cut=x.value;
      else if(x.id==='pia-design-product')d.product=x.value;
      else if(x.id==='pia-design-search')d.search=x.value;
      else if(x.id==='pia-design-target')d.target=x.value;
      else if(x.id==='pia-design-new-name')d.name=x.value;
      else return;
      app.repaint();
    };
    root.addEventListener('change',e=>{if(!['pia-design-search','pia-design-new-name'].includes(e.target.id))update(e.target);});
    root.addEventListener('input',e=>{if(['pia-design-search','pia-design-new-name'].includes(e.target.id))update(e.target);});
    root.addEventListener('click',e=>{const b=e.target.closest('[data-order-design-pick]');if(!b||b.disabled)return;const s=app.getState(),d=draft(s);d.target=b.dataset.orderDesignPick==='primary'?'primary':'id:'+b.dataset.orderDesignPick;d.open=true;app.repaint();document.getElementById('pia-design-selection')?.scrollIntoView({block:'start'});app.announce('Diseño elegido. Marca las prendas y guarda la asignación.');});
    root.addEventListener('click',async e=>{const b=e.target.closest('[data-order-design-action]');if(!b||b.disabled)return;const s=app.getState(),r=s.orders.find(x=>x.id===s.activeOrderId),d=draft(s),action=b.dataset.orderDesignAction;d.open=true;
      try{
        if(action==='edit'){focusImages(d.target==='primary'?'primary':d.target.slice(3));return;}
        if(action==='none'){d.selected=[];d.source=null;}
        if(action==='all'){remember(d,r);d.selected=[...new Set([...d.selected,...visible(r,d).map(x=>x.id)])];}
        if(action==='apply-visible'){remember(d,r);d.selected=visible(r,d).map(x=>x.id);}
        if(action==='apply'||action==='apply-visible'||action==='clear'){
          if(app.isBusy())throw Error('Espera a que termine la tarea actual.');
          const request=structuredClone(d);if(action==='clear')request.target='clear';b.disabled=true;const result=await app.assignOrderDesign(request);
          d.selected=[];d.source=null;d.target=['primary','clear'].includes(result.designId)?result.designId:'id:'+result.designId;d.name='';const live=app.getState().orders.find(x=>x.id===d.orderId);if(d.filter!=='*'&&!live.rows.some(x=>d.filter===''?primary(x.design):code(x.design)===code(d.filter)))d.filter='*';app.repaint();
          app.announce(result.designId==='clear'?'Diseño quitado de '+result.quantity+' prendas. Quedaron Sin diseño.':result.changed?'Diseño '+(result.name||'principal')+' guardado en '+result.quantity+' prendas de '+r.name+'. Puedes continuar con otro grupo.':'Las prendas ya tienen ese diseño. Se conservaron sus validaciones.');return;
        }
        app.repaint();
      }catch(err){app.repaint();app.announce(err.message);}
    });
  }
  function refresh(s){const d=draft(s);Object.assign(d,{selected:[],source:null,target:'',filter:'*',cut:'*',product:'*',size:'*',search:'',name:'',open:true});}
  window.ProwayOrderDesigns={refresh,screen,bind,plan,same,code,primary,reset:()=>drafts.clear()};
})();
