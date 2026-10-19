/* A read-only design queue. Selection never combines or advances the orders. */
(() => {
  'use strict';
  const selected=new Set(),heads=['Producto','Talla','Corte','Cantidad','Nombre','Color','Diseño','Indicaciones'];
  let scope=null,app;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quantity=o=>o.rows.reduce((n,r)=>n+r.qty,0);
  const available=o=>(o.quoteStatus||'active')==='active'&&!o.delivered&&quantity(o)>0;
  function reset(){scope=null;selected.clear();}
  function selection(state){
    const eligible=state.orders.filter(available);
    if(scope!==state.profile.id){scope=state.profile.id;selected.clear();if(eligible.some(o=>o.id===state.activeOrderId))selected.add(state.activeOrderId);}
    const ids=new Set(eligible.map(o=>o.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
    return eligible.filter(o=>selected.has(o.id));
  }
  function status(o){
    if(o.released)return 'Diseño liberado a costura';
    if(o.startDate)return 'Producción iniciada · impresión por validar';
    const pending=[['Pedido por revisar',o.dataOk],['Cotización por aprobar',o.confirmed],['Diseño por aprobar',o.designOk],['Anticipo por validar',o.paymentOk]].filter(([,ready])=>!ready).map(([name])=>name);
    return pending.length?pending.join(' · '):'Listo para validar inicio';
  }
  function snapshot(state){return selection(state).map(o=>({
    id:o.id,name:o.name,status:status(o),images:{...o.images},
    additionalDesigns:structuredClone(o.additionalDesigns||[]),
    data:{heads:[...heads],rows:o.rows.map(r=>[r.product,r.size,r.cut,r.qty,r.printed||'',r.color||'',r.design||'',r.placement||'']),money:[]}
  }));}
  function batchName(state){const list=selection(state);return list.length?list.map(o=>o.name).join(' + ').slice(0,200):'Seleccionar pedidos';}
  function documentData(state){
    const list=selection(state),groups=new Map();
    for(const o of list)for(const r of o.rows){const key=JSON.stringify([r.product,r.size,r.cut]);if(!groups.has(key))groups.set(key,[r.product,r.size,r.cut,0]);groups.get(key)[3]+=r.qty;}
    return {heads:['Folio','Cliente',...heads,'Validación'],rows:list.flatMap(o=>o.rows.map(r=>[o.id,o.name,r.product,r.size,r.cut,r.qty,r.printed||'',r.color||'',r.design||'',r.placement||'',status(o)])),money:[],paperSize:'letter',
      summary:[['Pedidos seleccionados',String(list.length)],['Prendas',String(list.reduce((n,o)=>n+quantity(o),0))]],
      extraTables:[{title:'Pedidos incluidos',heads:['Folio','Cliente','Prendas','Validación'],rows:list.map(o=>[o.id,o.name,quantity(o),status(o)]),money:[]},{title:'Conteo por talla y corte',heads:['Producto','Talla','Corte','Cantidad'],rows:[...groups.values()],money:[]}]
    };
  }
  function preview(list,renderTable,renderArt){return list.map(o=>'<details class="pia-design-batch-order" open data-design-batch-preview="'+esc(o.id)+'"><summary>'+esc(o.name)+' · '+o.data.rows.reduce((n,r)=>n+r[3],0)+' prendas</summary><p class="pia-help">'+esc(o.id)+'<br>'+esc(o.status)+'</p>'+renderArt(o)+renderTable(o.data,10000)+'</details>').join('');}
  function screen(state,renderTable,renderArt){
    const list=selection(state),total=list.reduce((n,o)=>n+quantity(o),0),eligible=state.orders.filter(available),disabled=list.length?'':'disabled';
    return '<section class="pia-panel pia-design-batch"><h3>Diseño de varios pedidos</h3><p>1. Selecciona los pedidos. 2. Revisa prendas e imágenes. 3. Descarga un solo archivo para Diseño.</p><small>La impresión se libera en cada pedido después de sus validaciones. Los entregados, cerrados, cancelados y descartados salen de este listado.</small><div class="pia-batch-actions"><button type="button" data-design-batch-action="all">Seleccionar todos</button><button type="button" data-design-batch-action="pending">Solo diseño pendiente</button><button type="button" data-design-batch-action="none">Quitar selección</button></div><details open><summary>Pedidos disponibles · '+eligible.length+'</summary>'+
      eligible.map(o=>'<label class="pia-check pia-batch-check"><input type="checkbox" data-design-batch-order="'+esc(o.id)+'" '+(selected.has(o.id)?'checked':'')+'><span><strong>'+esc(o.name)+'</strong><small>'+esc(o.id)+' · '+quantity(o)+' prendas<br>'+esc(status(o))+'</small></span></label>').join('')+(eligible.length?'':'<p>No hay pedidos activos con prendas. Agrega o importa un pedido para comenzar.</p>')+'</details><div class="pia-account-line"><span>Pedidos seleccionados</span><strong id="pia-design-batch-count">'+list.length+'</strong></div><div class="pia-account-line"><span>Total de prendas</span><strong id="pia-design-batch-total">'+total+'</strong></div><button type="button" class="pia-primary" data-design-batch-action="preview" '+disabled+'>Revisar listado conjunto</button><div class="pia-doc-actions"><button type="button" class="pia-secondary-button" data-design-batch-action="pdf" '+disabled+'>PDF Carta para Diseño</button><button type="button" class="pia-secondary-button" data-design-batch-action="excel" '+disabled+'>Excel con nombres y diseños</button></div><small>Excel incluye una hoja de nombres para copiar y una hoja con las imágenes identificadas por cliente. También puedes importarlo en Google Sheets.</small></section>'+
      (list.length?'<section class="pia-panel"><h3>Conteo de la selección</h3>'+renderTable(documentData(state).extraTables[1],10000)+'</section><section class="pia-panel"><h3>Revisar por cliente</h3>'+preview(snapshot(state),renderTable,renderArt)+'</section>':'');
  }
  function bind(bridge){
    app=bridge;const root=document.getElementById('proway-pedidos-preview');
    root.addEventListener('change',e=>{const x=e.target;if(!x.dataset.designBatchOrder)return;selection(app.getState());if(x.checked)selected.add(x.dataset.designBatchOrder);else selected.delete(x.dataset.designBatchOrder);app.repaint();});
    root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled||!b.dataset.designBatchAction)return;const action=b.dataset.designBatchAction;
      try{if(['all','pending','none'].includes(action)){const state=app.getState();selection(state);selected.clear();if(action!=='none')for(const o of state.orders)if(available(o)&&(action==='all'||!o.released))selected.add(o.id);app.repaint();}else if(action==='preview')app.openDocument('diseno_lote');else await app.exportDocument('diseno_lote',action);}catch(err){app.announce(err.message);}
    });
  }
  window.ProwayDesignBatch={selection,snapshot,document:documentData,batchName,preview,screen,bind,reset};
})();
