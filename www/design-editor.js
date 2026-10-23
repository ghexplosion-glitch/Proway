/* Recoverable artwork edits. Existing row/image fields keep offline and team compatibility. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProwayDesignEditor=factory();})(globalThis,function(){
 'use strict';let app,pending=null;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const code=x=>String(x||'').trim().toLocaleLowerCase('es-MX'),primary=x=>!code(x)||code(x)==='diseño principal',unassigned=x=>code(x)==='sin diseño';
 const source=r=>structuredClone({rows:r.rows,images:r.images,additionalDesigns:r.additionalDesigns});
 function plan(order,request){
  if(request.source&&JSON.stringify(request.source)!==JSON.stringify(source(order)))throw Error('El pedido cambió. Revisa otra vez el diseño antes de editarlo.');
  const next=source(order),isPrimary=request.designId==='primary',design=isPrimary?{id:'primary',name:'Diseño principal',images:next.images}:next.additionalDesigns.find(d=>d.id===request.designId);
  if(!design)throw Error('Este diseño ya no está disponible.');
  const matches=row=>isPrimary?primary(row.design):code(row.design)===code(design.name),assigned=next.rows.filter(matches),quantity=assigned.reduce((n,r)=>n+r.qty,0);let designId=design.id,name=design.name;
  if(request.action==='clear-image'){if(!['front','back'].includes(request.side))throw Error('Elige frente o espalda.');design.images[request.side]=null;}
  else if(request.action==='clear-images'){design.images.front=null;design.images.back=null;}
  else if(request.action==='remove'){
   if(isPrimary){next.images={front:null,back:null};}else next.additionalDesigns=next.additionalDesigns.filter(d=>d.id!==design.id);
   assigned.forEach(row=>row.design='Sin diseño');
  }else if(request.action==='rename-primary'){
   name=String(request.name||'').trim();if(!name)throw Error('Escribe un nombre para el diseño.');if(primary(name))return {...next,name:design.name,designId,quantity,changed:false,rowsChanged:false};
   if(!isPrimary||!name||name.length>100||unassigned(name)||next.additionalDesigns.some(d=>code(d.name)===code(name)))throw Error('Usa un nombre único de 1 a 100 caracteres, distinto de Sin diseño.');
   if(next.additionalDesigns.length>=8)throw Error('Este pedido ya tiene 9 diseños. Retira uno que no uses para poder nombrar el principal.');
   if(!request.newId)throw Error('No se pudo identificar el diseño.');
   designId=request.newId;next.additionalDesigns.push({id:designId,name,images:{...next.images}});next.images={front:null,back:null};assigned.forEach(row=>row.design=name);
  }else throw Error('Acción de diseño no disponible.');
  return {...next,name,designId,quantity,changed:JSON.stringify(next)!==JSON.stringify(source(order)),rowsChanged:JSON.stringify(next.rows)!==JSON.stringify(order.rows)};
 }
 function controls(id,images){return '<div class="pia-design-edit-actions"><button type="button" data-design-editor-action="clear-images" data-editor-design="'+esc(id)+'" '+(!images.front&&!images.back?'disabled':'')+'>Limpiar imágenes</button><button type="button" data-design-remove="'+esc(id)+'">Eliminar diseño</button></div>';}
 function imageButton(id,side,image){return image?'<button type="button" class="pia-clear-image" data-design-editor-action="clear-image" data-editor-design="'+esc(id)+'" data-editor-side="'+side+'">Quitar '+(side==='front'?'frente':'espalda')+'</button>':'';}
 function review(r,id){if(!pending||pending.orderId!==r.id||pending.designId!==id||pending.profileId!==app?.getState().profile.id)return '';return '<section class="pia-notice pia-design-remove-review" data-design-review="'+esc(id)+'"><strong>Eliminar '+esc(pending.name)+' de '+esc(r.name)+'?</strong><p>'+pending.quantity+' prendas quedarán marcadas Sin diseño. Las imágenes se retirarán de este pedido. Cantidades, precios y cobros se conservan.</p><div class="pia-design-edit-actions"><button type="button" data-design-editor-action="confirm-remove" data-editor-design="'+esc(id)+'">Confirmar eliminar diseño</button><button type="button" data-design-editor-action="cancel-remove">Conservar diseño</button></div></section>';}
 function jump(target){const section=document.querySelector(target);if(!section)return;for(let p=section;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;section.scrollIntoView({block:'start',behavior:'instant'});}
 function bind(bridge){app=bridge;const root=document.getElementById('proway-pedidos-preview');
  root.addEventListener('change',async e=>{if(e.target.dataset.designName){pending=null;return;}if(!e.target.dataset.primaryDesignName)return;const s=app.getState(),r=s.orders.find(o=>o.id===s.activeOrderId);try{const result=await app.mutateOrderDesign({profileId:s.profile.id,orderId:r.id,source:source(r),designId:'primary',action:'rename-primary',name:e.target.value});ProwayOrderDesigns.refresh(s);app.repaint();const card=root.querySelector('[data-order-design="'+CSS.escape(result.designId)+'"]');card?.scrollIntoView({block:'nearest'});card?.querySelector('input[data-design-name]')?.focus({preventScroll:true});app.announce('Nombre del diseño actualizado y prendas vinculadas conservadas.');}catch(err){app.repaint();app.announce(err.message);}});
  root.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.pedidoJump){const target=b.dataset.pedidoJump;jump(target==='personas'?'#pia-person-list':target==='datos'?'#pia-order-data':'#pia-order-review');if(target==='personas')root.querySelector('#pia-person-search')?.focus({preventScroll:true});return;}
   if(!b.dataset.designEditorAction&&!b.dataset.designRemove)return;e.stopImmediatePropagation();
   const s=app.getState(),r=s.orders.find(o=>o.id===s.activeOrderId),id=b.dataset.editorDesign||b.dataset.designRemove,action=b.dataset.designEditorAction||'remove';
   try{
    if(action==='cancel-remove'){pending=null;app.repaint();return;}
    let request={profileId:s.profile.id,orderId:r.id,source:source(r),designId:id,action,side:b.dataset.editorSide};
    if(action==='remove'){
     const result=plan(r,request);
     if(result.quantity){pending={...request,name:result.name,quantity:result.quantity};app.repaint();root.querySelector('[data-design-review="'+CSS.escape(id)+'"]')?.scrollIntoView({block:'nearest'});app.announce('Este diseño está asignado a prendas. Revisa y confirma para retirarlo.');return;}
    }
    if(action==='confirm-remove'){if(!pending||pending.designId!==id||pending.orderId!==r.id||pending.profileId!==s.profile.id)throw Error('Revisa otra vez el diseño de este pedido.');request={...pending,action:'remove'};}
    b.disabled=true;const result=await app.mutateOrderDesign(request);pending=null;ProwayOrderDesigns.refresh(s);app.repaint();
    app.announce(action==='remove'||action==='confirm-remove'?'Diseño eliminado; '+result.quantity+' prendas quedaron Sin diseño.':'Imágenes limpiadas. El nombre y sus prendas se conservan.');
   }catch(err){pending=null;app.repaint();app.announce(err.message);}
  });
 }
 return {source,plan,controls,imageButton,review,bind,unassigned};
});
