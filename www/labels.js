/* Bag labels derived from the existing roster. Printing never changes orders. */
(() => {
  'use strict';
  const pageSize=40,selected=new Set();let scope='',offset=0,mode='product',app;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quantity=o=>o.rows.reduce((n,r)=>n+r.qty,0);
  const colorText=value=>String(value||'').trim().replace(/\b(azul|rojo)\b/gi,x=>x[0].toUpperCase()+x.slice(1).toLowerCase());
  const unique=values=>[...new Set(values.filter(Boolean))].join(' / ');
  const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
  function scopeFor(state){if(scope!==state.profile.id){scope=state.profile.id;selected.clear();selected.add(state.activeOrderId);offset=0;mode='product';}}
  function selection(state){
    scopeFor(state);const ids=new Set(state.orders.map(o=>o.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
    return ProwaySyncCore.orderedOrders(state.orders).filter(o=>(o.quoteStatus||'active')==='active'&&!o.delivered&&selected.has(o.id)&&quantity(o)>0);
  }
  function people(order){
    const groups=new Map();for(const row of ProwayPresentation.sorted(order.rows,'size')){
      const name=String(row.printed||'').trim();
      if(!name){for(let i=0;i<row.qty;i++)groups.set('row:'+row.id+':'+i,[{...row,qty:1}]);continue;}
      const key='person:'+name;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
    }return [...groups.values()];
  }
  function personCount(order){const names=new Set();let unnamed=0;for(const row of order.rows){const name=String(row.printed||'').trim();if(name)names.add(name);else unnamed+=row.qty;}return names.size+unnamed;}
  function contents(rows){
    const groups=new Map();for(const row of rows){
      const key=JSON.stringify([row.product,row.size,row.cut]),color=colorText(row.color)||'Sin color';
      if(!groups.has(key))groups.set(key,{product:row.product,size:row.size,cut:row.cut,colors:new Map(),qty:0});
      const group=groups.get(key);group.qty+=row.qty;group.colors.set(color,(group.colors.get(color)||0)+row.qty);
    }
    return [...groups.values()].map(g=>g.qty+' × '+g.product+' · '+g.size+' · '+g.cut+' · '+(g.colors.size===1?[...g.colors.keys()][0]:[...g.colors].map(([color,qty])=>qty+' '+color).join(' + '))).join('\n');
  }
  function build(orders,start,labelMode){
    const total=orders.reduce((n,o)=>n+(labelMode==='person'?personCount(o):quantity(o)),0),rows=[];
    if(total<=10000)for(const order of orders){
      const bags=labelMode==='person'?people(order):ProwayPresentation.pieces(order.rows,'size').map(row=>[row]);
      for(const items of bags)rows.push([rows.length+1,unique(items.map(r=>r.product)),unique(items.map(r=>r.size)),unique(items.map(r=>r.cut)),order.name,String(items[0].printed||'').trim(),unique(items.map(r=>colorText(r.color))),contents(items),order.id,items.reduce((n,r)=>n+r.qty,0)]);
    }
    return {heads:['N.º de etiqueta','Producto','Talla','Corte','Cliente','Nombre / número impreso','Color','Contenido de la bolsa','Folio','Prendas en la bolsa'],rows,money:[],labelOffset:start,labelPageSize:pageSize,labelMode,paperSize:'letter',
      summary:[['Pedidos seleccionados',String(orders.length)],['Etiquetas',String(total)],['Prendas',String(orders.reduce((n,o)=>n+quantity(o),0))],['Agrupación',labelMode==='person'?'Por persona':'Por producto'],['Etiquetas por hoja Carta','40 · 4 columnas × 10 filas'],['Hojas necesarias',String(total?Math.ceil((start+total)/pageSize):0)],...(total>10000?[['Límite','Selecciona hasta 10,000 etiquetas por descarga.']]:[])],
      extraTables:[{title:'Pedidos para etiquetar',heads:['Folio','Cliente','Prendas'],rows:orders.map(o=>[o.id,o.name,quantity(o)]),money:[]}]};
  }
  function batchName(state){const orders=selection(state);return orders.length?orders.map(o=>o.name).join(' + ').slice(0,200):'Seleccionar pedidos';}
  function labelDocument(state){return build(selection(state),offset,mode);}
  function orderDocument(state){scopeFor(state);const order=state.orders.find(o=>o.id===state.activeOrderId);return build(order?[order]:[],0,mode);}
  function layout(data){const size=data.labelPageSize===40?40:24;return {columns:4,rows:size/4,pageSize:size,gapX:size===40?2:3,gapY:size===40?1.5:3,margin:13};}
  function lines(data,row,fallbackClient=''){
    const content=data.labelPageSize===40?row[7]:contents([{product:row[1],size:row[2],cut:row[3],qty:1,color:row[6]}]);
    return ['Etiqueta '+row[0],compact(row[4]),compact(row[5])||'Sin nombre',...String(content).split('\n'),compact(row[8]||fallbackClient)].filter(Boolean);
  }
  function printPlan(doc,data,fallbackClient=''){
    const spec=layout(data),width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),cellW=(width-2*spec.margin-(spec.columns-1)*spec.gapX)/spec.columns,cellH=(height-2*spec.margin-(spec.rows-1)*spec.gapY)/spec.rows;
    const cards=data.rows.map(row=>{
      for(const fontSize of [8,7.5,7,6.5]){
        const lineHeight=fontSize*.352778*1.08;doc.setFontSize(fontSize);const wrapped=[];
        lines(data,row,fallbackClient).forEach((text,index)=>{doc.setFont('helvetica',index===0||index===2?'bold':'normal');const parts=doc.splitTextToSize(text.replace(/[–—−]/g,'-'),cellW-3);parts.forEach(part=>wrapped.push({text:part,bold:index===0||index===2}));});
        if(wrapped.length*lineHeight<=cellH-3)return {wrapped,fontSize,lineHeight};
      }
      throw Error('La etiqueta '+row[0]+' de '+row[4]+' ('+(row[5]||'sin nombre')+') no cabe completa en 40 por hoja. Elige Por producto o acorta los datos del pedido.');
    });return {...spec,cellW,cellH,cards};
  }
  function preview(data,fallbackClient=''){
    const rows=data.rows,skip=data.labelOffset||0,spec=layout(data);if(!rows.length)return '<small>No hay etiquetas para mostrar en esta selección.</small>';
    const pages=Math.ceil((skip+rows.length)/spec.pageSize);let html='<small>Vista completa: '+rows.length+' etiquetas · '+spec.columns+' columnas × '+spec.rows+' filas · '+pages+' '+(pages===1?'hoja Carta.':'hojas Carta.')+'</small>';
    for(let page=0;page<pages;page++){
      let cards='';for(let slot=page*spec.pageSize;slot<(page+1)*spec.pageSize;slot++){
        if(slot<skip){cards+='<div class="pia-label-used" aria-label="Espacio ya utilizado"></div>';continue;}
        if(slot>=skip+rows.length){cards+='<div class="pia-label-empty" aria-hidden="true"></div>';continue;}
        const r=rows[slot-skip],texts=lines(data,r,fallbackClient);
        cards+='<div class="pia-label" data-label-index="'+(slot-skip)+'"><small>'+esc(texts[0])+'</small><strong>'+esc(r[4])+'</strong><b>'+esc(r[5]||'Sin nombre')+'</b><div class="pia-label-content">'+esc(data.labelPageSize===40?r[7]:texts.slice(3,-1).join('\n')).replace(/\n/g,'<br>')+'</div><div class="pia-label-code">'+esc(r[8]||fallbackClient)+'</div></div>';
      }
      html+='<section class="pia-label-page" data-label-page="'+(page+1)+'"><h4>Hoja '+(page+1)+' de '+pages+' · Carta · '+spec.pageSize+' espacios</h4><div class="pia-labels">'+cards+'</div></section>';
    }return html;
  }
  function screen(state){
    const data=labelDocument(state),list=selection(state),total=Number(data.summary.find(r=>r[0]==='Etiquetas')[1]),sheets=total?Math.ceil((total+offset)/pageSize):0;
    return '<section class="pia-panel"><h3>Etiquetas para la bolsa</h3><small>Nombre, productos, talla, corte y color. 40 etiquetas por hoja Carta: 4 columnas × 10 filas.</small><label class="pia-field" style="margin-top:14px">Una etiqueta por<select id="pia-labels-mode"><option value="product" '+(mode==='product'?'selected':'')+'>Producto · una por prenda</option><option value="person" '+(mode==='person'?'selected':'')+'>Persona · sus artículos en una bolsa</option></select></label><small>Por persona agrupa el mismo nombre y número dentro de cada pedido; conserva la cantidad y el color de sus artículos. Los artículos sin nombre se mantienen separados.</small><div class="pia-batch-actions"><button type="button" data-labels-action="all">Seleccionar todos</button><button type="button" data-labels-action="none">Quitar selección</button></div><details open><summary>Pedidos · '+list.length+' seleccionados</summary>'+ProwaySyncCore.orderedOrders(state.orders).filter(o=>(o.quoteStatus||'active')==='active'&&!o.delivered).map(o=>'<label class="pia-check pia-batch-check"><input type="checkbox" data-labels-order="'+esc(o.id)+'" '+(selected.has(o.id)?'checked':'')+' '+(!quantity(o)?'disabled':'')+'><span><strong>'+esc(o.name)+'</strong><br>'+esc(o.id)+' · '+quantity(o)+' prendas</span></label>').join('')+'</details><details class="pia-label-options"><summary>Usar una hoja empezada</summary><label class="pia-field">Primera etiqueta libre<select id="pia-labels-start">'+Array.from({length:pageSize},(_,i)=>'<option value="'+i+'" '+(i===offset?'selected':'')+'>'+(i+1)+(i===0?' · hoja nueva':'')+'</option>').join('')+'</select></label><small>Los espacios ya usados quedan en blanco; las etiquetas nuevas empiezan en 1.</small></details><div class="pia-account-line"><span>Pedidos</span><strong id="pia-labels-orders">'+list.length+'</strong></div><div class="pia-account-line"><span>Etiquetas por imprimir</span><strong id="pia-labels-total">'+total+'</strong></div><div class="pia-account-line"><span>Hojas Carta · 40 etiquetas por hoja</span><strong id="pia-labels-sheets">'+sheets+'</strong></div><small>Imprime en Carta al 100 %, sin ajustar a página.</small>'+(total>10000?'<p class="pia-notice">Selecciona hasta 10,000 etiquetas por descarga.</p>':'')+'<button type="button" class="pia-primary" data-labels-action="preview" '+(!total||total>10000?'disabled':'')+'>Vista previa de la impresión</button><div class="pia-doc-actions"><button type="button" class="pia-secondary-button" data-labels-action="pdf" '+(!total||total>10000?'disabled':'')+'>PDF para imprimir</button><button type="button" class="pia-secondary-button" data-labels-action="excel" '+(!total||total>10000?'disabled':'')+'>Excel de etiquetas</button></div><details open><summary>Ver todas las etiquetas</summary>'+preview(data)+'</details></section>';
  }
  function bind(bridge){app=bridge;const root=document.getElementById('proway-pedidos-preview');
    root.addEventListener('change',e=>{const x=e.target;if(x.dataset.labelsOrder){if(x.checked)selected.add(x.dataset.labelsOrder);else selected.delete(x.dataset.labelsOrder);app.repaint();}if(x.id==='pia-labels-start'){const n=Number(x.value);if(Number.isInteger(n)&&n>=0&&n<pageSize){offset=n;app.repaint();}}if(x.id==='pia-labels-mode'&&['product','person'].includes(x.value)){mode=x.value;app.repaint();}});
    root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled||!b.dataset.labelsAction)return;const action=b.dataset.labelsAction;try{if(action==='all'){selected.clear();for(const o of app.getState().orders)if(quantity(o)&&!o.delivered&&(o.quoteStatus||'active')==='active')selected.add(o.id);app.repaint();}else if(action==='none'){selected.clear();app.repaint();}else if(action==='preview')app.openDocument('etiquetas_lote');else await app.exportDocument('etiquetas_lote',action);}catch(err){app.announce(err.message);}});
  }
  window.ProwayLabels={pageSize,screen,document:labelDocument,orderDocument,preview,batchName,bind,layout,lines,printPlan};
})();
