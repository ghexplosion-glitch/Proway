/* Visual design selection edits the existing draft; order renaming keeps the same folio. */
(() => {
  'use strict';
  let app,active=null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalized=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es-MX');
  const order=s=>s.orders.find(r=>r.id===s.activeOrderId);
  function models(r){
    const list=[{value:'primary',name:'Diseño principal',text:'Diseño principal',images:r.images},...r.additionalDesigns.map(d=>({value:'id:'+d.id,name:d.name,text:d.name,images:d.images}))];
    for(const row of r.rows){const name=row.design.trim();if(ProwayOrderDesigns.primary(name)||ProwayDesignEditor.unassigned(name)||list.some(d=>ProwayOrderDesigns.code(d.name)===ProwayOrderDesigns.code(name)))continue;list.push({value:'code:'+name,name,text:name,images:{front:null,back:null}});}
    list.push({value:'clear',name:'Sin diseño',text:'Sin diseño',images:{front:null,back:null}});
    return list.map(d=>({...d,quantity:r.rows.filter(row=>d.value==='primary'?ProwayOrderDesigns.primary(row.design):ProwayOrderDesigns.code(row.design)===ProwayOrderDesigns.code(d.text)).reduce((n,row)=>n+row.qty,0)}));
  }
  function close(){if(active?.open)active.close();}
  function dialog(title,subtitle,opener){
    close();const el=document.createElement('dialog');el.className='pia-order-tools-dialog';el.innerHTML='<header class="pia-order-tools-header"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button type="button" data-order-tools-close aria-label="Cerrar">×</button></header><p class="pia-order-tools-error" role="status" aria-live="polite" hidden></p><div class="pia-order-tools-body"></div>';
    document.body.append(el);active=el;el.querySelector('[data-order-tools-close]').onclick=()=>el.close();
    el.addEventListener('close',()=>{if(active===el)active=null;el.remove();if(opener?.id)document.getElementById(opener.id)?.focus({preventScroll:true});});
    el.addEventListener('click',e=>{if(e.target===el){const b=el.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)el.close();}});
    return el;
  }
  function error(el,message){const box=el.querySelector('.pia-order-tools-error');box.hidden=!message;box.textContent=message||'';}
  function ensureEditable(){if(!app.canEditOrder()||app.isBusy())throw Error('Abre un pedido activo con permiso de administración y espera a que termine la tarea actual.');}
  function openName(opener){
    ensureEditable();const s=app.getState(),r=order(s),request={profileId:s.profile.id,orderId:r.id,sourceName:r.name};
    const el=dialog('Editar nombre del pedido',r.id+' · Se conserva el mismo folio.',opener),body=el.querySelector('.pia-order-tools-body');
    body.innerHTML='<form id="pia-order-name-form"><label for="pia-order-name-draft">Nombre del pedido / equipo</label><input id="pia-order-name-draft" name="name" type="text" required maxlength="200" autocomplete="off" value="'+esc(r.name)+'"><p class="pia-order-tools-help">El nuevo nombre aparecerá en los listados y en las próximas exportaciones. Los documentos ya emitidos conservan su versión.</p><div class="pia-order-tools-actions"><button type="submit" class="pia-order-tools-primary">Guardar nombre</button><button type="button" data-name-cancel>Cancelar</button></div></form>';
    body.querySelector('[data-name-cancel]').onclick=()=>el.close();
    body.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const button=body.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;error(el,'');try{const result=await app.renameOrder({...request,name:body.querySelector('input').value});el.close();app.announce(result.changed?'Nombre del pedido actualizado: '+result.name+'.':'El nombre ya estaba guardado.');}catch(err){if(el.isConnected)error(el,err.message);}finally{if(button.isConnected)button.disabled=false;}});
    el.showModal();const input=body.querySelector('input');input.focus();input.select();
  }
  function openDesign(opener){
    ensureEditable();const s=app.getState(),r=order(s),inputId=opener.dataset.designInputId,input=document.getElementById(inputId);if(!input)throw Error('Abre de nuevo el formulario para elegir su diseño.');
    const batch=inputId==='pia-design-target',form=input.closest('#pia-person-form'),session=form?.dataset.personSession||'',originalValue=input.value;
    const request={profileId:s.profile.id,orderId:r.id},el=dialog('Elegir diseño',batch?'Elige la imagen; después aplica el diseño a las prendas seleccionadas.':opener.dataset.designScope==='article'?'Solo cambia este artículo. Guarda la persona para aplicarlo.':'Se usará en los artículos de esta persona. Guarda la persona para aplicarlo.',opener),body=el.querySelector('.pia-order-tools-body');
    let choices=models(r),source=JSON.stringify({images:r.images,additionalDesigns:r.additionalDesigns,codes:choices.map(d=>d.value)});
    const selected=batch?originalValue:ProwayOrderDesigns.primary(originalValue)?'primary':ProwayDesignEditor.unassigned(originalValue)?'clear':choices.find(d=>ProwayOrderDesigns.code(d.text)===ProwayOrderDesigns.code(originalValue))?.value;
    body.innerHTML='<label class="pia-order-tools-search" for="pia-visual-design-search">Buscar diseño<input id="pia-visual-design-search" type="search" autocomplete="off" placeholder="Escribe su nombre"></label><div class="pia-visual-design-grid"></div><p data-design-empty hidden>No hay diseños con ese nombre.</p><button type="button" class="pia-order-tools-manage">Cargar o editar diseños del pedido</button>';
    const paint=()=>{body.querySelector('.pia-visual-design-grid').innerHTML=choices.map(d=>'<button type="button" class="pia-visual-design" data-visual-design="'+esc(d.value)+'" data-design-search="'+esc(normalized(d.name))+'" aria-pressed="'+(d.value===selected)+'"><strong>'+esc(d.name)+'</strong>'+(d.value==='clear'?'<span class="pia-visual-design-clear">Quitar la asignación</span>':'<span class="pia-visual-design-images">'+['front','back'].map(side=>'<span>'+(d.images?.[side]?'<img src="'+esc(d.images[side])+'" alt="'+esc(d.name)+' · '+(side==='front'?'Frente':'Espalda')+'">':'<span class="pia-visual-design-placeholder">Imagen pendiente</span>')+'<small>'+(side==='front'?'Frente':'Espalda')+'</small></span>').join('')+'</span>')+'<small>'+d.quantity+' '+(d.quantity===1?'prenda asignada':'prendas asignadas')+'</small>'+(d.value===selected?'<span class="pia-visual-design-selected">✓ Elegido</span>':'')+'</button>').join('');filter();};
    const filter=()=>{const q=normalized(body.querySelector('input').value);let n=0;body.querySelectorAll('[data-visual-design]').forEach(card=>{card.hidden=!card.dataset.designSearch.includes(q);if(!card.hidden)n++;});body.querySelector('[data-design-empty]').hidden=n>0;};
    body.querySelector('input').addEventListener('input',filter);
    body.querySelector('.pia-order-tools-manage').onclick=()=>{el.close();app.openDesignLibrary();};
    body.addEventListener('click',e=>{const button=e.target.closest('[data-visual-design]');if(!button)return;try{
      ensureEditable();const current=app.getState(),live=order(current),field=document.getElementById(inputId);
      if(current.profile.id!==request.profileId||live.id!==request.orderId||!field||field.value!==originalValue||(field.closest('#pia-person-form')?.dataset.personSession||'')!==session)throw Error('El pedido o la persona cambió. Cierra y vuelve a elegir su diseño.');
      const latest=models(live),fingerprint=JSON.stringify({images:live.images,additionalDesigns:live.additionalDesigns,codes:latest.map(d=>d.value)});
      if(source!==fingerprint){choices=latest;source=fingerprint;paint();throw Error('Los diseños cambiaron. Revisa las imágenes y elige de nuevo.');}
      const choice=choices.find(d=>d.value===button.dataset.visualDesign);if(!choice)throw Error('Este diseño ya no está disponible.');
      field.value=batch?choice.value:choice.text;field.dispatchEvent(new Event('change',{bubbles:true}));el.close();app.announce('Diseño elegido: '+choice.name+'. '+(batch?'Revisa las prendas y toca Aplicar.':'Guarda la persona para aplicar el cambio.'));
    }catch(err){error(el,err.message);}});
    paint();el.showModal();
  }
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('click',e=>{const b=e.target.closest('#pia-rename-order,[data-order-tools-pick]');if(!b||b.disabled)return;try{if(b.id==='pia-rename-order')openName(b);else openDesign(b);}catch(err){app.announce(err.message);}});}
  window.ProwayOrderTools={bind};
})();
