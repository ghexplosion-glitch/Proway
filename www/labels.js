/* Continuous label sheets for several orders. Print selections never edit orders. */
(() => {
  'use strict';
  const pageSize=24,selected=new Set();let scope='',offset=0,app;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quantity=o=>o.rows.reduce((n,r)=>n+r.qty,0);
  function selection(state){
    if(scope!==state.profile.id){scope=state.profile.id;selected.clear();selected.add(state.activeOrderId);offset=0;}
    const ids=new Set(state.orders.map(o=>o.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
    return state.orders.filter(o=>(o.quoteStatus||'active')==='active'&&!o.delivered&&selected.has(o.id)&&quantity(o)>0);
  }
  function batchName(state){const orders=selection(state);return orders.length?orders.map(o=>o.name).join(' + ').slice(0,200):'Seleccionar pedidos';}
  function labelDocument(state){
    const orders=selection(state),rows=[];let total=orders.reduce((n,o)=>n+quantity(o),0);
    // Large orders remain available; one download contains at most 10,000 labels.
    if(total<=10000)for(const o of orders){let piece=0;const count=quantity(o);for(const r of o.rows)for(let i=0;i<r.qty;i++)rows.push([++piece,r.product,r.size,r.cut,o.name,r.printed||'',r.color||'',r.design||'',o.id,count]);}
    return {heads:['Pieza','Producto','Talla','Corte','Cliente','Nombre','Color','Diseño','Folio','Prendas del pedido'],rows,money:[],labelOffset:offset,paperSize:'letter',
      summary:[['Pedidos seleccionados',String(orders.length)],['Etiquetas',String(total)],['Primera posición libre',String(offset+1)],['Etiquetas por hoja Carta',String(pageSize)],['Hojas necesarias',String(total?Math.ceil((offset+total)/pageSize):0)],...(total>10000?[['Revisión','Selecciona hasta 10,000 etiquetas por descarga.']]:[])],
      extraTables:[{title:'Pedidos para etiquetar',heads:['Folio','Cliente','Prendas'],rows:orders.map(o=>[o.id,o.name,quantity(o)]),money:[]}]};
  }
  function preview(data,fallbackClient=''){
    const rows=data.rows,skip=data.labelOffset||0;
    if(!rows.length)return '<small>No hay etiquetas para mostrar en esta selección.</small>';
    const pages=Math.ceil((skip+rows.length)/pageSize);let html='<small>Vista completa: '+rows.length+' etiquetas en '+pages+' '+(pages===1?'hoja Carta.':'hojas Carta.')+'</small>';
    for(let page=0;page<pages;page++){
      const start=page*pageSize,end=Math.min(start+pageSize,skip+rows.length);let cards='';
      for(let slot=start;slot<end;slot++){
        if(slot<skip){cards+='<div class="pia-label pia-label-used">Posición '+(slot+1)+'<br>Ya utilizada</div>';continue;}
        const r=rows[slot-skip];
        cards+='<div class="pia-label" data-label-index="'+(slot-skip)+'"><small>Posición '+(slot%pageSize+1)+'</small><strong>'+esc(r[4])+'</strong>'+esc(r[1])+' · '+esc(r[5]||'Sin nombre')+'<br>'+esc(r[2])+' · '+esc(r[3])+'<br>'+esc(r[6]||'Color pendiente')+'<br>Pieza '+esc(r[0])+' de '+esc(r[9]??rows.length)+'<div class="pia-label-code">'+esc(r[8]||fallbackClient)+' · '+esc(r[7]||'D pendiente')+'</div></div>';
      }
      html+='<section class="pia-label-page" data-label-page="'+(page+1)+'"><h4>Hoja '+(page+1)+' de '+pages+' · Carta</h4><div class="pia-labels">'+cards+'</div></section>';
    }
    return html;
  }
  function screen(state){
    const list=selection(state),total=list.reduce((n,o)=>n+quantity(o),0),sheets=total?Math.ceil((total+offset)/pageSize):0;
    return '<section class="pia-panel"><h3>Etiquetar varios pedidos</h3><small>Selecciona pedidos completos. El PDF acomoda sus etiquetas seguidas, sin dejar espacios entre clientes.</small><div class="pia-batch-actions"><button type="button" data-labels-action="all">Seleccionar todos</button><button type="button" data-labels-action="none">Quitar selección</button></div><details open><summary>Pedidos · '+list.length+' seleccionados</summary>'+state.orders.filter(o=>(o.quoteStatus||'active')==='active'&&!o.delivered).map(o=>'<label class="pia-check pia-batch-check"><input type="checkbox" data-labels-order="'+esc(o.id)+'" '+(selected.has(o.id)?'checked':'')+' '+(!quantity(o)?'disabled':'')+'><span><strong>'+esc(o.name)+'</strong><br>'+esc(o.id)+' · '+quantity(o)+' prendas</span></label>').join('')+'</details><label class="pia-field" style="margin-top:14px">Primera etiqueta libre de la hoja<select id="pia-labels-start">'+Array.from({length:pageSize},(_,i)=>'<option value="'+i+'" '+(i===offset?'selected':'')+'>'+(i+1)+(i===0?' · hoja nueva':'')+'</option>').join('')+'</select></label><small>Si tu hoja ya tiene etiquetas utilizadas, indica dónde empezar. Imprime en Carta, a tamaño real (100 %).</small><div class="pia-account-line"><span>Pedidos</span><strong id="pia-labels-orders">'+list.length+'</strong></div><div class="pia-account-line"><span>Etiquetas por imprimir</span><strong id="pia-labels-total">'+total+'</strong></div><div class="pia-account-line"><span>Hojas Carta · 4 columnas × 6 filas</span><strong id="pia-labels-sheets">'+sheets+'</strong></div>'+(total>10000?'<p class="pia-notice">Selecciona hasta 10,000 etiquetas por descarga.</p>':'')+'<button type="button" class="pia-primary" data-labels-action="preview" '+(!total||total>10000?'disabled':'')+'>Vista previa de la impresión</button><div class="pia-doc-actions"><button type="button" class="pia-secondary-button" data-labels-action="pdf" '+(!total||total>10000?'disabled':'')+'>PDF para imprimir</button><button type="button" class="pia-secondary-button" data-labels-action="excel" '+(!total||total>10000?'disabled':'')+'>Excel de etiquetas</button></div><details open><summary>Ver todas las etiquetas</summary>'+preview(labelDocument(state))+'</details></section>';
  }
  function bind(bridge){app=bridge;const root=document.getElementById('proway-pedidos-preview');
    root.addEventListener('change',e=>{const x=e.target;if(x.dataset.labelsOrder){if(x.checked)selected.add(x.dataset.labelsOrder);else selected.delete(x.dataset.labelsOrder);app.repaint();}if(x.id==='pia-labels-start'){const n=Number(x.value);if(Number.isInteger(n)&&n>=0&&n<pageSize){offset=n;app.repaint();}}});
    root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled||!b.dataset.labelsAction)return;const action=b.dataset.labelsAction;try{if(action==='all'){selected.clear();for(const o of app.getState().orders)if(quantity(o)&&!o.delivered&&(o.quoteStatus||'active')==='active')selected.add(o.id);app.repaint();}else if(action==='none'){selected.clear();app.repaint();}else if(action==='preview')app.openDocument('etiquetas_lote');else await app.exportDocument('etiquetas_lote',action);}catch(err){app.announce(err.message);}});
  }
  window.ProwayLabels={pageSize,screen,document:labelDocument,preview,batchName,bind};
})();
