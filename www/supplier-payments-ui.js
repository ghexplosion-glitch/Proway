/* Review a supplier payment before recording its existing-ledger expense. No bank transfer is made. */
(() => {
  'use strict';
  let app;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const status=(order,state)=>ProwaySupplierPayments.status(order,state,ProwayExtras.settlement(order,state));
  function controls(order,state){
    const s=status(order,state);
    return '<div class="pia-supplier-status '+(s.paid?'is-paid':'')+'"><strong>'+s.label+'</strong>'+(s.payments.length?'<span>Registrado al taller: '+money(s.paidTotal)+' · último pago '+esc(s.lastDate)+'</span>':'')+'</div>'+
      (s.remaining!==null&&s.remaining>0&&(order.quoteStatus||'active')==='active'?'<button type="button" class="pia-primary" data-supplier-pay-order="'+esc(order.id)+'">Marcar como pagado</button>':'')+
      (s.paid?'<p class="pia-help">Este trabajo ya no se incluye en los pagos pendientes. Puedes consultar o corregir el registro en Pagados.</p>':'');
  }
  function history(state){
    const orders=state.orders.filter(o=>ProwaySupplierPayments.entries(o,state).length);
    return '<h3>Pagos de trabajos registrados</h3><p class="pia-help">Conserva fecha, importe y pedido. Si agregas prendas o extras, solo la diferencia de costo vuelve a Pendientes. Los saldos usan las tarifas actuales.</p>'+orders.map(order=>{
      const s=status(order,state);
      return '<details class="pia-supplier-history" data-supplier-history="'+esc(order.id)+'"><summary>'+esc(order.name)+' · '+s.label+' · '+money(s.paidTotal)+'</summary><small>'+esc(order.id)+'</small>'+s.payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>'<div class="pia-supplier-payment-row"><div><strong>'+money(e.amount)+' · '+esc(e.date)+'</strong><small>Base '+money(e.baseAmount??e.amount)+' · IVA '+money(e.iva||0)+'</small><small>'+esc(e.note)+'</small></div><button type="button" class="pia-secondary-button" data-supplier-correct="'+esc(e.id)+'">Corregir registro</button></div>').join('')+'</details>';
    }).join('')+(orders.length?'':'<p>No hay pagos de trabajos registrados.</p>');
  }
  function dialog(title,body){
    if(document.querySelector('.pia-supplier-dialog[open]'))return null;
    const d=document.createElement('dialog');d.className='pia-supplier-dialog';
    d.innerHTML='<form id="pia-supplier-payment-form"><div class="pia-supplier-dialog-head"><h3>'+esc(title)+'</h3><button type="button" data-supplier-cancel>Cerrar ×</button></div>'+body+'<p class="pia-supplier-error" role="alert" hidden></p><div class="pia-supplier-dialog-actions"><button type="button" class="pia-secondary-button" data-supplier-cancel>Cancelar</button><button type="submit" class="pia-primary">Confirmar pago registrado</button></div></form>';
    document.body.append(d);d.addEventListener('close',()=>d.remove());d.querySelectorAll('[data-supplier-cancel]').forEach(b=>b.addEventListener('click',()=>d.close()));d.showModal();return d;
  }
  function permitted(){if(!app.canManageSupplierPayments()||app.isBusy())throw Error('Espera y entra como administración para registrar pagos.');}
  function openPayment(ids,mode){
    permitted();const state=app.getState(),payment=ProwaySupplierPayments.plan(state,ids,mode,ProwayExtras.settlement),source=ProwaySupplierPayments.snapshot(state,ids);
    const d=dialog('Marcar trabajos como pagados','<p>Confirma un pago que ya realizaste al taller. Se guardará un egreso por pedido y dejará de aparecer en pendientes.</p><div class="pia-supplier-review">'+payment.items.map(x=>'<div><strong>'+esc(x.name)+'</strong><span>'+money(x.amount)+'</span></div>').join('')+'</div><p>Base: '+money(payment.base)+(mode==='added'?'<br>IVA adicional: '+money(payment.iva):'')+'<br><strong>Total registrado: '+money(payment.total)+'</strong></p><label class="pia-field">Fecha del pago<input id="pia-supplier-payment-date" type="date" required value="'+today()+'" max="'+today()+'"></label><label class="pia-field">Referencia u observación<input id="pia-supplier-payment-note" maxlength="300" placeholder="Ej. transferencia al taller"></label>');
    if(!d)return;let busy=false;
    d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;const b=d.querySelector('[type=submit]'),error=d.querySelector('.pia-supplier-error');b.disabled=true;error.hidden=true;
      try{await app.recordSupplierPayment({ids,mode,source,date:d.querySelector('#pia-supplier-payment-date').value,note:d.querySelector('#pia-supplier-payment-note').value});d.close();app.announce('Pago de taller registrado. Los trabajos pagados salen de Pendientes.');}
      catch(err){error.textContent=err.message;error.hidden=false;}finally{busy=false;b.disabled=false;}
    });
  }
  function openCorrection(id){
    permitted();const state=app.getState(),entry=state.expenses.find(e=>e.id===id&&e.category===ProwaySupplierPayments.category),order=state.orders.find(o=>o.id===entry?.client);if(!entry||!order)throw Error('Este registro cambió. Abre Pagados otra vez.');
    const d=dialog('Corregir un registro de pago','<p><strong>'+esc(order.name)+' · '+money(entry.amount)+'</strong><br>'+esc(entry.date)+'</p><p>Se anulará este egreso capturado por error y se recalculará el saldo del trabajo. Esta acción no realiza una devolución bancaria.</p>');if(!d)return;
    const b=d.querySelector('[type=submit]');b.textContent='Anular registro por error';let busy=false;
    d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;b.disabled=true;const error=d.querySelector('.pia-supplier-error');error.hidden=true;
      try{await app.correctSupplierPayment({profileId:state.profile.id,entry});d.close();app.announce('Registro corregido. El saldo del taller se recalculó.');}
      catch(err){error.textContent=err.message;error.hidden=false;}finally{busy=false;b.disabled=false;}
    });
  }
  function bind(bridge){app=bridge;document.getElementById('proway-pedidos-preview').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    try{if(b.hasAttribute('data-supplier-pay-batch')){const s=ProwayFinance.paymentSelection(app.getState());openPayment(s.ids,s.mode);}
      else if(b.dataset.supplierPayOrder){const order=app.getState().orders.find(o=>o.id===b.dataset.supplierPayOrder);if(!order)throw Error('El pedido cambió.');openPayment([order.id],order.supplier?.mode==='added'?'added':'none');}
      else if(b.dataset.supplierCorrect)openCorrection(b.dataset.supplierCorrect);
    }catch(err){app.announce(err.message);}
  });}
  window.ProwaySupplierUI={controls,history,bind};
})();
