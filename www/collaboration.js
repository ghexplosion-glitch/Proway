/* Invitation-only teams. No service keys, passwords or private orders in source. */
(() => {
  'use strict';
  const C=ProwaySyncCore, roles={admin:'Administración',diseno:'Diseño',costura:'Costura / armado',empaque:'Empaque',envio:'Envío',consulta:'Solo consulta'};
  let bridge,client,meta=null,user=null,legacy=null,opened=false,busy=false,timer,poll,locked=false,invitation='',lastMessage='',members=[],inviteUrl='',signup=false,authBusy=false;
  const uuid=()=>crypto.randomUUID(),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const activeKey='proway-active-account-v1',authKey='proway-auth-v1';
  function badge(){
    const bar=document.querySelector('.pia-connect');if(!bar)return;
    let message=meta?(navigator.onLine?(Object.keys(meta.conflicts||{}).length?'Revisar cambios en conflicto':Object.keys(meta.pending||{}).length+' cambios pendientes'):'Sin conexión · cambios pendientes en este equipo'):'Pedidos guardados en este equipo';
    if(meta&&!Object.keys(meta.pending||{}).length&&navigator.onLine)message=meta.lastSynced?'Sincronizado · '+new Date(meta.lastSynced).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}):'Conectando al equipo…';
    if(!bar.querySelector('#pia-cloud-status')){
      bar.innerHTML='<span id="pia-cloud-status" role="status"></span><button type="button" id="pia-team"></button>';
      document.getElementById('pia-team').addEventListener('click',()=>show());
    }
    const status=bar.querySelector('#pia-cloud-status'),button=bar.querySelector('#pia-team');
    if(status.textContent!==message)status.textContent=message;
    const label=meta?roles[meta.role]:'Equipo';if(button.textContent!==label)button.textContent=label;
  }
  function lock(value){locked=value;bridge.lock(value);}
  function info(message){lastMessage=message;badge();if(opened)paint();}
  function field(label,name,type='text',extra=''){return '<label class="pia-team-field">'+label+'<input name="'+name+'" type="'+type+'" '+extra+'></label>';}
  function show(){opened=true;paint();document.getElementById('pia-team-dialog').showModal();if(meta&&navigator.onLine&&meta.role==='admin')loadMembers().catch(e=>info(e.message));}
  function close(){opened=false;document.getElementById('pia-team-dialog').close();}
  function paint(){
    let dialog=document.getElementById('pia-team-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='pia-team-dialog';dialog.className='pia-team-dialog';document.getElementById('proway-pedidos-preview').append(dialog);dialog.addEventListener('click',onClick);dialog.addEventListener('submit',onSubmit);}
    const title=meta?'Tu equipo Proway':'Colaboración Proway';let html='<div class="pia-team-top"><h2>'+title+'</h2><button type="button" data-team="close" aria-label="Cerrar">✕</button></div>';
    if(!meta){
      html+='<p>Una cuenta por persona. Usa la misma cuenta en tu celular y computadora.</p><div class="pia-team-auth-layout"><aside class="pia-team-tabs" aria-label="Acceso al equipo"><button type="button" data-team="login" aria-pressed="'+(!signup)+'">Entrar</button>'+(invitation?'<button type="button" data-team="signup" aria-pressed="'+signup+'">Crear cuenta</button>':'')+'</aside>';
      html+='<form id="pia-team-auth">'+(signup?field('Tu nombre','name','text','autocomplete="name" required maxlength="200"'):'')+field('Correo','email','email','autocomplete="email" required maxlength="254"')+field('Contraseña','password','password','autocomplete="'+(signup?'new-password':'current-password')+'" required '+(signup?'minlength="12" maxlength="200"':''))+(signup?'<small>Al menos 12 caracteres. El acceso se crea con esta invitación.</small>':'')+'<button type="submit" class="pia-primary" '+(authBusy?'disabled':'')+'>'+(authBusy?'Conectando…':signup?'Crear cuenta y entrar':'Entrar al equipo')+'</button></form></div>';
      if(!invitation)html+='<small>El propietario te debe dar una invitación para tu primer acceso.</small>';
    }else{
      html+='<p><strong>'+esc(meta.displayName||user?.email)+'</strong><br>'+esc(roles[meta.role])+' · '+esc(meta.name||'Proway')+'</p><p>'+Object.keys(meta.pending||{}).length+' cambios pendientes. '+(meta.lastSynced?'Última sincronización: '+esc(new Date(meta.lastSynced).toLocaleString('es-MX')):'')+'</p><button type="button" class="pia-primary" data-team="sync" '+(busy?'disabled':'')+'>'+(busy?'Sincronizando…':'Sincronizar ahora')+'</button>';
      const conflicts=Object.entries(meta.conflicts||{});if(conflicts.length)html+='<section class="pia-team-card"><h3>Revisar antes de compartir</h3>'+conflicts.map(([id,v])=>'<div><strong>'+esc(id==='settings'?'Configuración':v.data?.name||id)+'</strong><p>'+esc(v.message||'Otra persona modificó los mismos datos. Tu copia sigue guardada.')+'</p><button type="button" data-team="conflict-cloud" data-id="'+esc(id)+'">Usar lo del equipo</button><button type="button" data-team="conflict-mine" data-id="'+esc(id)+'">Revisé: compartir mi copia</button></div>').join('')+'</section>';
      if(meta.role==='admin'){
        if(meta.migrationCandidate){const candidate=meta.migrationCandidate;html+='<section class="pia-team-card"><h3>Pedidos que ya tenías en este equipo</h3><p>Conservamos tu base anterior. Elige qué pedidos incorporar al equipo. No selecciones un pedido vacío para reemplazar uno con prendas.</p><form id="pia-team-migrate">'+candidate.orders.filter(o=>o.rows.length||o.contact||o.address).map(o=>'<label class="pia-check"><input type="checkbox" name="order" value="'+esc(o.id)+'"><span>'+esc(o.name)+' · '+o.rows.reduce((s,x)=>s+x.qty,0)+' prendas en este equipo / '+(meta.bases[o.id]?.data.rows.reduce((s,x)=>s+x.qty,0)||0)+' en el equipo</span></label>').join('')+'<label class="pia-check"><input type="checkbox" name="settings"><span>También compartir mis tarifas y configuración anteriores</span></label><button type="submit" class="pia-primary">Compartir los pedidos seleccionados</button></form><button type="button" data-team="backup-old">Descargar mi respaldo anterior</button><button type="button" data-team="dismiss-migrate">Conservar solo como respaldo</button></section>';}
        html+='<section class="pia-team-card"><h3>Invitar a otra persona</h3><form id="pia-team-invite"><label class="pia-team-field">Departamento<select name="role">'+Object.entries(roles).map(([k,v])=>'<option value="'+k+'" '+(k==='diseno'?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>'+field('Correo de la persona · opcional','email','email','maxlength="254"')+'<button class="pia-primary" type="submit">Crear invitación</button></form>'+(inviteUrl?'<label class="pia-team-field">Enlace privado · un uso · vence en 7 días<textarea id="pia-team-invite-link" readonly>'+esc(inviteUrl)+'</textarea></label><button type="button" data-team="copy-invite">Copiar invitación</button>':'')+'<small>Copia el enlace y envíalo tú. Cada persona crea su propia contraseña.</small></section>';
        html+='<section class="pia-team-card"><h3>Personas del equipo</h3>'+(members.length?members.map(m=>'<div class="pia-team-member"><strong>'+esc(m.name||m.email)+'</strong><small>'+esc(m.email)+'</small><select data-member-role="'+esc(m.id)+'" '+(m.owner?'disabled':'')+'>'+Object.entries(roles).map(([k,v])=>'<option value="'+k+'" '+(k===m.role?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><button type="button" data-team="member-toggle" data-id="'+esc(m.id)+'" '+(m.owner?'disabled':'')+'>'+(m.owner?'Propietario':m.active?'Desactivar acceso':'Activar acceso')+'</button></div>').join(''):'<small>Conéctate para cargar usuarios.</small>')+'</section>';
      }
      html+='<button type="button" data-team="logout">Cerrar sesión</button>';
    }
    if(lastMessage)html+='<p class="pia-team-message" role="status">'+esc(lastMessage)+'</p>';
    dialog.innerHTML=html;
  }
  async function rpc(action,payload={},workspace=meta?.workspace||null){
    if(!navigator.onLine)throw Error('Sin conexión. Tus cambios seguirán guardados en este equipo.');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const {data,error}=await client.rpc('proway_api',{action,workspace,payload}).abortSignal(controller.signal);if(error){const e=Error(error.message||'No se pudo conectar al equipo.');e.code=error.code;throw e;}return data;}finally{clearTimeout(timeout);}
  }
  function saveDescriptor(){localStorage.setItem(activeKey,JSON.stringify({workspace:meta.workspace,userId:meta.userId,role:meta.role,displayName:meta.displayName,name:meta.name,email:user?.email||meta.email}));localStorage.removeItem('proway-signed-out');}
  function hooks(){ProwayPlatform.setSyncHooks({prepare:state=>C.prepare(meta,state,uuid),committed:next=>{meta=next;badge();schedule();}});}
  function schedule(){clearTimeout(timer);if(meta&&Object.keys(meta.pending||{}).length&&navigator.onLine)timer=setTimeout(()=>sync().catch(e=>info(e.message)),1200);}
  async function persist(state){
    const current=bridge.getState();
    if(!C.equal({...current,savedAt:null},{...state,savedAt:null}))bridge.apply(state);
    await ProwayPlatform.flush();badge();
  }
  async function enter(session){
    if(!meta&&!localStorage.getItem(activeKey)&&!localStorage.getItem('proway-signed-out'))legacy=C.clone(bridge.getState());
    user=session.user;
    if(invitation){await rpc('join',{token:invitation},null);invitation='';history.replaceState(null,'',location.pathname+location.search);}
    const memberships=await rpc('memberships',{},null);const chosen=memberships.find(m=>m.id===window.PROWAY_CLOUD.workspace)||memberships[0];
    if(!chosen)throw Error('Esta cuenta todavía no tiene acceso. Abre la invitación que te dio el propietario.');
    const snapshot=await rpc('sync',{versions:{},settingsVersion:0},chosen.id);
    const scope='proway-equipo-'+chosen.id+'-'+user.id+'-'+snapshot.role;
    const cached=await ProwayPlatform.switchScope(scope),savedMeta=await ProwayPlatform.readAux();
    const guest=legacy;
    meta=savedMeta&&savedMeta.userId===user.id&&savedMeta.role===snapshot.role?savedMeta:{workspace:chosen.id,userId:user.id,role:snapshot.role,bases:{},settingsBase:null,pending:{},conflicts:{},events:[],migrationCandidate:snapshot.role==='admin'&&guest?.orders.some(o=>o.rows.length)?C.clone(guest):null};
    meta.displayName=snapshot.displayName;meta.name=snapshot.name;meta.email=user.email;
    bridge.setRole(meta.role);lock(false);ProwayPlatform.bindState(bridge.getState);
    const current=cached||bridge.emptyState();if(cached)bridge.apply(cached);
    hooks();await receive(snapshot,current);saveDescriptor();await sync();info('Sesión lista. Los pedidos se comparten al recuperar internet.');if(opened)paint();
  }
  async function receive(snapshot,current=bridge.getState()){
    if(snapshot.role!==meta.role){lock(true);throw Error('Cambió tu departamento. Cierra sesión y entra de nuevo para actualizar los permisos.');}
    for(const item of snapshot.orders){
      if(meta.conflicts[item.id])continue;
      const old=meta.bases[item.id],local=current.orders.find(o=>o.id===item.id);
      const merged=old?C.rebase(local,old.data,item.data):item.data;
      meta.bases[item.id]={data:C.clone(item.data),version:item.version};
      if(!C.equal(merged,item.data))meta.pending[item.id]={...(meta.pending[item.id]||{}),desired:merged};else delete meta.pending[item.id];
    }
    if(snapshot.settings){
      if(!meta.conflicts.settings){const merged=meta.settingsBase?C.rebase(C.settings(current),meta.settingsBase.data,snapshot.settings):snapshot.settings;meta.settingsBase={data:snapshot.settings,version:snapshot.settingsVersion};
        if(meta.role==='admin'&&!C.equal(merged,snapshot.settings))meta.pending.settings={...(meta.pending.settings||{}),desired:merged};else delete meta.pending.settings;}
    }
    meta.events=snapshot.events;meta.lastSynced=new Date().toISOString();
    const state=C.stateFrom(current,meta);meta=C.prepare(meta,state,uuid);await persist(state);
  }
  async function sync(force=false){
    if(!meta||busy||!navigator.onLine||locked)return;
    if(bridge.isBusy?.()){schedule();return;}
    const focused=document.activeElement;if(!force&&document.querySelector('#pia-main')?.contains(focused)&&focused.matches('input:not([type=checkbox]),textarea')){schedule();return;}
    busy=true;badge();
    try{
      await ProwayPlatform.flush();
      for(const id of Object.keys(meta.pending)){
        if(meta.conflicts[id])continue;
        const op=C.clone(meta.pending[id]);const result=await rpc(id==='settings'?'save_settings':'save_order',{
          operationId:op.operationId,orderId:id,baseVersion:op.baseVersion,patch:op.patch,expected:op.expected,guards:op.guards});
        if(result.conflict){meta.conflicts[id]=result;continue;}
        const state=bridge.getState();
        if(id==='settings'){const latest=C.settings(state),merged=C.rebase(latest,op.desired,result.data);meta.settingsBase={data:result.data,version:result.version};Object.assign(state,merged);}
        else{const at=state.orders.findIndex(o=>o.id===id);if(at>=0)state.orders[at]=C.rebase(state.orders[at],op.desired,result.data);meta.bases[id]={data:result.data,version:result.version};}
        delete meta.pending[id];meta=C.prepare(meta,state,uuid);await persist(state);
      }
      const versions=Object.fromEntries(Object.entries(meta.bases).map(([id,b])=>[id,b.version]));
      await receive(await rpc('sync',{versions,settingsVersion:meta.settingsBase?.version||0}));
      if(Object.keys(meta.conflicts).length)lastMessage='Hay cambios por revisar. Ninguna copia en conflicto se sobrescribió.';
    }catch(e){if(e.code==='42501'){lock(true);lastMessage='El servidor no autorizó el acceso. Entra de nuevo o consulta al propietario.';}else lastMessage=e.name==='AbortError'?'La conexión tardó demasiado. Los cambios siguen pendientes.':e.message;
      // Preserve validation errors so one invalid operation does not silently disappear.
      if(meta)await ProwayPlatform.flush().catch(()=>{});
    }finally{busy=false;badge();if(opened&&!document.querySelector('#pia-team-dialog form')?.contains(document.activeElement))paint();}
  }
  async function loadMembers(){members=await rpc('members');if(opened)paint();}
  async function onClick(event){
    const b=event.target.closest('[data-team]');if(!b||b.disabled)return;const action=b.dataset.team;
    try{
      if(action==='close'){close();return;}
      if(action==='login'||action==='signup'){signup=action==='signup';lastMessage='';paint();return;}
      if(action==='sync'){await sync(true);info(Object.keys(meta.pending).length?'Quedan cambios pendientes. Revisa el mensaje.':'Pedidos sincronizados.');return;}
      if(action==='copy-invite'){try{await navigator.clipboard.writeText(inviteUrl);info('Invitación copiada.');}catch{info('Mantén pulsado el enlace y elige Copiar.');}return;}
      if(action==='backup-old'){ProwayPlatform.backup(meta.migrationCandidate);return;}
      if(action==='dismiss-migrate'){meta.previousLocalBackup=meta.migrationCandidate;meta.migrationCandidate=null;await ProwayPlatform.flush();paint();return;}
      if(action.startsWith('conflict-')){
        const id=b.dataset.id,conflict=meta.conflicts[id];if(!conflict)return;await ProwayPlatform.checkpoint('Antes de resolver un conflicto de '+id);const state=bridge.getState();
        meta.conflictArchive=(meta.conflictArchive||[]).slice(-19);meta.conflictArchive.push({id,time:new Date().toISOString(),local:C.clone(meta.pending[id]?.desired)});
        if(id==='settings'){meta.settingsBase={data:conflict.data,version:conflict.version};if(action==='conflict-cloud')Object.assign(state,conflict.data);}
        else{meta.bases[id]={data:conflict.data,version:conflict.version};if(action==='conflict-cloud'){const at=state.orders.findIndex(o=>o.id===id);if(at>=0)state.orders[at]=conflict.data;}}
        delete meta.conflicts[id];delete meta.pending[id];meta=C.prepare(meta,state,uuid);await persist(state);await sync(true);paint();return;
      }
      if(action==='member-toggle'){
        const m=members.find(x=>x.id===b.dataset.id),role=document.querySelector('[data-member-role="'+m.id+'"]').value;
        await rpc('member_update',{userId:m.id,role,active:!m.active});await loadMembers();return;
      }
      if(action==='logout'){
        lock(true);await ProwayPlatform.flush();ProwayPlatform.setSyncHooks(null);await client.auth.signOut({scope:'local'});clearTimeout(timer);meta=null;user=null;localStorage.removeItem(activeKey);localStorage.setItem('proway-signed-out','1');ProwayPlatform.bindState(null);bridge.setRole('consulta');lock(true);lastMessage='Sesión cerrada. Tus copias locales se conservan para tu próximo acceso.';members=[];inviteUrl='';badge();paint();return;
      }
    }catch(e){info(e.message);}
  }
  async function onSubmit(event){
    event.preventDefault();const data=new FormData(event.target);
    try{
      if(event.target.id==='pia-team-auth'){
        authBusy=true;const email=String(data.get('email')).trim().toLowerCase(),password=String(data.get('password'));paint();
        if(signup){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(window.PROWAY_CLOUD.url+'/functions/v1/proway-cuentas',{method:'POST',headers:{apikey:window.PROWAY_CLOUD.key,'Content-Type':'application/json'},body:JSON.stringify({email,password,name:data.get('name'),token:invitation}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo crear la cuenta.');if(result.existing){signup=false;info(result.message);return;}}finally{clearTimeout(t);}}
        const {data:session,error}=await client.auth.signInWithPassword({email,password});if(error)throw Error('No se pudo entrar. Revisa correo y contraseña.');await enter(session.session);return;
      }
      if(event.target.id==='pia-team-invite'){const result=await rpc('invite',{role:data.get('role'),email:data.get('email')||''});inviteUrl=location.origin+location.pathname+'#equipo='+result.token;info('Invitación lista. Compártela con esa persona.');return;}
      if(event.target.id==='pia-team-migrate'){
        const selected=new Set(data.getAll('order')),state=bridge.getState(),candidate=meta.migrationCandidate;
        for(const order of candidate.orders.filter(o=>selected.has(o.id))){const at=state.orders.findIndex(o=>o.id===order.id);if(at>=0)state.orders[at]=C.clone(order);else state.orders.push(C.clone(order));}
        if(data.has('settings'))Object.assign(state,C.settings(candidate));meta.previousLocalBackup=candidate;meta.migrationCandidate=null;meta=C.prepare(meta,state,uuid);await persist(state);await sync(true);info('Se incorporaron los pedidos elegidos. La base anterior sigue conservada.');return;
      }
    }catch(e){info(e.message);}finally{authBusy=false;if(opened)paint();}
  }
  async function start(appBridge){
    bridge=appBridge;legacy=C.clone(bridge.getState());invitation=(location.hash.match(/^#equipo=([a-f0-9]{64})$/)||[])[1]||'';signup=!!invitation;
    if(!window.PROWAY_CLOUD?.url||!window.supabase){badge();return;}
    client=supabase.createClient(PROWAY_CLOUD.url,PROWAY_CLOUD.key,{auth:{storageKey:authKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    badge();document.addEventListener('change',async e=>{if(e.target.dataset.memberRole){const m=members.find(x=>x.id===e.target.dataset.memberRole);try{await rpc('member_update',{userId:m.id,role:e.target.value,active:m.active});await loadMembers();}catch(err){info(err.message);}}});
    window.addEventListener('online',()=>sync().catch(e=>info(e.message)));window.addEventListener('offline',badge);poll=setInterval(()=>{if(!document.hidden)sync().catch(e=>info(e.message));},20000);
    if(invitation){lock(true);show();return;}
    const descriptor=JSON.parse(localStorage.getItem(activeKey)||'null');
    if(descriptor){
      const cached=await ProwayPlatform.switchScope('proway-equipo-'+descriptor.workspace+'-'+descriptor.userId+'-'+descriptor.role);meta=await ProwayPlatform.readAux();
      if(cached&&meta){bridge.setRole(meta.role);bridge.apply(cached);ProwayPlatform.bindState(bridge.getState);hooks();lock(false);badge();}
      else{meta=null;lock(true);}
      if(navigator.onLine){try{const {data:{session}}=await client.auth.getSession();if(session)await enter(session);else{meta=null;lock(true);show();}}catch(e){info(e.message);}}
    }else if(localStorage.getItem('proway-signed-out')){lock(true);show();}
  }
  window.ProwayCollaboration={start,sync,show,getRole:()=>meta?.role||null,isLocked:()=>locked};
})();
