/* Delivery confirmation is independent from the customer's remaining balance. */
(() => {
  'use strict';let app;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function open(id){
    if(app.isBusy())throw Error('Espera a que termine la tarea actual.');
    const state=app.getState(),order=state.orders.find(o=>o.id===id);if(!order||id!==state.activeOrderId)throw Error('El pedido cambió. Abre su entrega otra vez.');
    const correction=order.delivered;if(!(correction?app.canCorrectDelivery():app.canDeliver()))throw Error('Revisa y aprueba la cotización antes de entregar. Envío necesita el empaque validado.');
    if(document.querySelector('.pia-delivery-dialog[open]'))return;
    const d=document.createElement('dialog');d.className='pia-delivery-dialog';d.setAttribute('aria-label',correction?'Corregir entrega':'Marcar pedido como entregado');
    d.innerHTML='<form><div class="pia-delivery-dialog-head"><h3>'+(correction?'Corregir entrega':'Marcar pedido como entregado')+'</h3><button type="button" data-delivery-close>Cerrar ×</button></div><p><strong>'+esc(order.name)+'</strong><br>'+esc(order.id)+' · '+order.rows.reduce((n,r)=>n+r.qty,0)+' prendas</p>'+
      (correction?'<p>El pedido volverá a pendientes y conservará sus prendas, pagos y avances. Su entrega anterior seguirá en el historial.</p>':'<label class="pia-field">Tipo de entrega<select id="pia-delivery-method"><option value="personal" '+(!order.shipped?'selected':'')+'>Entrega personal</option><option value="paqueteria" '+(order.shipped?'selected':'disabled')+'>Paquetería'+(!order.shipped?' · valida la salida primero':'')+'</option></select></label><label class="pia-field">Fecha de entrega<input id="pia-delivery-date" type="date" required max="'+ProwayLifecycle.today()+'" value="'+ProwayLifecycle.today()+'"></label><label class="pia-delivery-check"><input id="pia-delivery-complete" type="checkbox" required><span>Confirmo que el cliente recibió el pedido completo.</span></label><p class="pia-help">Sale de producción. Si tiene saldo pendiente, permanece en Por cobrar; al liquidarse queda en Cerrados.</p>')+
      '<p class="pia-delivery-error" role="alert" hidden></p><div class="pia-delivery-dialog-actions"><button type="button" data-delivery-close>Cancelar</button><button type="submit" class="pia-primary">'+(correction?'Volver a pendientes':'Confirmar entrega')+'</button></div></form>';
    document.body.append(d);d.addEventListener('close',()=>d.remove());d.querySelectorAll('[data-delivery-close]').forEach(b=>b.addEventListener('click',()=>d.close()));d.showModal();let busy=false;
    d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const b=d.querySelector('[type=submit]'),error=d.querySelector('.pia-delivery-error');b.disabled=true;error.hidden=true;
      try{await app.recordDelivery({profileId:state.profile.id,orderId:order.id,before:order,correction,method:d.querySelector('#pia-delivery-method')?.value,date:d.querySelector('#pia-delivery-date')?.value,complete:d.querySelector('#pia-delivery-complete')?.checked});d.close();app.announce(correction?'Entrega corregida. El pedido volvió a pendientes.':'Entrega registrada. El pedido salió de producción; sus cobros e historial se conservan.');}
      catch(err){error.textContent=err.message;error.hidden=false;}finally{busy=false;b.disabled=false;}
    });
  }
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('click',e=>{const b=e.target.closest('[data-delivery-open]');if(!b||b.disabled)return;try{open(b.dataset.deliveryOpen);}catch(err){app.announce(err.message);}});}
  window.ProwayDeliveryUI={bind,open};
})();
