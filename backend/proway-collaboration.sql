-- Proway: private data, invitation-only membership and optimistic synchronization.
-- This migration does not change any existing application tables or Auth settings.
create schema if not exists proway_private;
revoke all on schema proway_private from public, anon, authenticated;
grant usage on schema proway_private to authenticated, service_role;

create table proway_private.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  owner_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create table proway_private.members (
  workspace_id uuid not null references proway_private.workspaces(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','diseno','costura','empaque','envio','consulta')),
  active boolean not null default true, display_name text not null default '',
  created_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create index proway_members_user_idx on proway_private.members(user_id,workspace_id);
create table proway_private.orders (
  workspace_id uuid not null references proway_private.workspaces(id),
  order_id text not null check(order_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data jsonb not null, version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(), primary key(workspace_id,order_id)
);
create table proway_private.settings (
  workspace_id uuid primary key references proway_private.workspaces(id),
  data jsonb not null, version bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table proway_private.events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references proway_private.workspaces(id),
  order_id text not null default '', actor_id uuid references auth.users(id) on delete set null,
  actor text not null, role text not null, action text not null,
  created_at timestamptz not null default now()
);
create index proway_events_workspace_idx on proway_private.events(workspace_id,id desc);
create table proway_private.invites (
  token_hash text primary key, workspace_id uuid not null references proway_private.workspaces(id),
  role text not null check(role in ('admin','diseno','costura','empaque','envio','consulta')),
  email text not null default '', expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null, used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  reserved_email text, attempts integer not null default 0, created_at timestamptz not null default now()
);
create index proway_invites_workspace_idx on proway_private.invites(workspace_id);
create table proway_private.operations (
  workspace_id uuid not null references proway_private.workspaces(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null, request_hash text not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(workspace_id,user_id,operation_id)
);
create index proway_operations_user_idx on proway_private.operations(user_id);
create index proway_orders_updated_by_idx on proway_private.orders(updated_by);
create index proway_events_actor_idx on proway_private.events(actor_id);
create index proway_invites_used_by_idx on proway_private.invites(used_by);
create index proway_invites_created_by_idx on proway_private.invites(created_by);
create index proway_workspaces_owner_idx on proway_private.workspaces(owner_id);

alter table proway_private.workspaces enable row level security;
alter table proway_private.members enable row level security;
alter table proway_private.orders enable row level security;
alter table proway_private.settings enable row level security;
alter table proway_private.events enable row level security;
alter table proway_private.invites enable row level security;
alter table proway_private.operations enable row level security;
-- No direct table privileges. All access goes through checked, projected RPCs.
revoke all on all tables in schema proway_private from public, anon, authenticated;
revoke all on all sequences in schema proway_private from public, anon, authenticated;

create function proway_private.member_role(w uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para continuar.' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and not u.is_anonymous) then
    raise exception 'Cuenta sin verificar.' using errcode='42501';
  end if;
  select m.role into r from proway_private.members m where m.workspace_id=w and m.user_id=auth.uid() and m.active;
  if r is null then raise exception 'No tienes acceso a este equipo.' using errcode='42501'; end if;
  return r;
end $$;

create function proway_private.project_order(d jsonb, r text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare outdata jsonb; rowsdata jsonb;
begin
  if r='admin' then return d; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','product',x->'product','size',x->'size','cut',x->'cut',
    'qty',x->'qty','printed',coalesce(x->'printed','""'::jsonb),'color',coalesce(x->'color','""'::jsonb),
    'design',coalesce(x->'design','""'::jsonb),'placement',coalesce(x->'placement','""'::jsonb),'special','')), '[]'::jsonb)
    into rowsdata from jsonb_array_elements(d->'rows') x;
  outdata=jsonb_build_object('id',d->'id','name',d->'name','contact','','phone','','address','',
    'orderDate',d->'orderDate','rows',rowsdata,'images',d->'images','additionalDesigns',coalesce(d->'additionalDesigns','[]'::jsonb),'dataOk',d->'dataOk','confirmed',d->'confirmed',
    'designOk',d->'designOk','paymentOk',d->'paymentOk','startDate',d->'startDate','released',d->'released',
    'sewn',d->'sewn','packed',d->'packed','shipped',d->'shipped','delivered',d->'delivered',
    'advance',0,'advanceDate','','advanceIsr',0,'advanceCfdi',false,'advanceSimulated',false,'advanceRecord',null,
    'payments','[]'::jsonb,'payerType','pending','vatMode','included','source','Pedido compartido','sourceNote','',
    'fiscal',jsonb_build_object('rfc','','name','','cp','','regime','','use','','form','','method',''),
    'shipment',d->'shipment','showVat',false,'supplier',jsonb_build_object('mode','none','extras','[]'::jsonb));
  if r='envio' then outdata=outdata||jsonb_build_object('address',d->'address','contact',d->'contact','phone',d->'phone'); end if;
  return outdata;
end $$;

create function proway_private.validate_order(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare x jsonb; k text; n numeric; totalrows integer;
begin
  if jsonb_typeof(d)<>'object' or octet_length(d::text)>7000000 then raise exception 'Pedido demasiado grande o inválido.'; end if;
  if coalesce(d->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(d->'name') is distinct from 'string' or length(d->>'name') not between 1 and 200 then raise exception 'Identificación inválida.'; end if;
  for k in select jsonb_object_keys(d) loop
    if k<>all(array['id','name','contact','phone','address','orderDate','rows','images','additionalDesigns','dataOk','confirmed','designOk','advance','advanceDate','advanceIsr','advanceCfdi','advanceSimulated','advanceRecord','payments','payerType','paymentOk','startDate','released','sewn','packed','shipped','delivered','source','sourceNote','vatMode','fiscal','shipment','showVat','supplier']) then raise exception 'Campo de pedido no permitido: %',k; end if;
  end loop;
  foreach k in array array['contact','phone','address','orderDate','advanceDate','startDate','source','sourceNote'] loop
    if jsonb_typeof(d->k) is distinct from 'string' or length(d->>k)>4000 then raise exception 'Dato de pedido inválido: %',k; end if;
  end loop;
  foreach k in array array['dataOk','confirmed','designOk','paymentOk','released','sewn','packed','shipped','delivered','advanceCfdi','advanceSimulated'] loop
    if jsonb_typeof(d->k) is distinct from 'boolean' then raise exception 'Validación inválida: %',k; end if;
  end loop;
  foreach k in array array['orderDate','advanceDate','startDate'] loop
    if d->>k<>'' then
      if (d->>k)!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida.'; end if;
      perform (d->>k)::date;
    end if;
  end loop;
  foreach k in array array['advance','advanceIsr'] loop
    if jsonb_typeof(d->k) is distinct from 'number' or (d->>k)::numeric not between 0 and 1000000000 then raise exception 'Importe inválido.'; end if;
  end loop;
  if coalesce(d->>'payerType','')<>all(array['pending','PF','PM']) or coalesce(d->>'vatMode','')<>all(array['included','added']) then raise exception 'Tipo fiscal inválido.'; end if;
  if jsonb_typeof(d->'rows') is distinct from 'array' or jsonb_array_length(d->'rows')>10000 then raise exception 'Listado inválido.'; end if;
  for x in select value from jsonb_array_elements(d->'rows') loop
    if jsonb_typeof(x->'id') is distinct from 'number' or (x->>'id')::numeric not between 1 and 9007199254740991 or trunc((x->>'id')::numeric)<>(x->>'id')::numeric then raise exception 'Identificador de prenda inválido.'; end if;
    if coalesce(x->>'product','')<>all(array['Butarga','Playera','Short']) or coalesce(x->>'cut','')<>all(array['Hombre','Mujer']) or coalesce(x->>'size','')='' or length(x->>'size')>30 then raise exception 'Prenda, talla o corte inválido.'; end if;
    if jsonb_typeof(x->'qty') is distinct from 'number' or (x->>'qty')::numeric not between 1 and 10000 or trunc((x->>'qty')::numeric)<>(x->>'qty')::numeric then raise exception 'Cantidad inválida.'; end if;
    if x->>'special'<>'' and (jsonb_typeof(x->'special') is distinct from 'number' or (x->>'special')::numeric not between 0 and 1000000000) then raise exception 'Precio inválido.'; end if;
    foreach k in array array['printed','color','design','placement'] loop
      if jsonb_typeof(coalesce(x->k,'""'::jsonb))<>'string' or length(coalesce(x->>k,''))>500 then raise exception 'Datos de prenda inválidos.'; end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(d->'rows'))<>(select count(distinct row_data->>'id') from jsonb_array_elements(d->'rows') row_data) then raise exception 'Prendas con identificador repetido.'; end if;
  if jsonb_typeof(d->'images') is distinct from 'object' then raise exception 'Diseño inválido.'; end if;
  foreach k in array array['front','back'] loop
    if d->'images'->k is distinct from 'null'::jsonb then
      if length(d->'images'->>k)>3000000 or coalesce(d->'images'->>k,'')!~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Imagen inválida.'; end if;
    end if;
  end loop;
  if d ? 'additionalDesigns' then
    if jsonb_typeof(d->'additionalDesigns') is distinct from 'array' or jsonb_array_length(d->'additionalDesigns')>8 then raise exception 'Puedes agregar hasta 8 diseños adicionales.'; end if;
    for x in select value from jsonb_array_elements(d->'additionalDesigns') loop
      if jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(x->'name') is distinct from 'string' or length(trim(x->>'name')) not between 1 and 100 or jsonb_typeof(x->'images') is distinct from 'object' then raise exception 'Diseño adicional inválido.'; end if;
      for k in select jsonb_object_keys(x) loop
        if k<>all(array['id','name','images']) then raise exception 'Campo de diseño no permitido.'; end if;
      end loop;
      foreach k in array array['front','back'] loop
        if x->'images'->k is distinct from 'null'::jsonb then
          if jsonb_typeof(x->'images'->k) is distinct from 'string' or length(x->'images'->>k)>3000000 or coalesce(x->'images'->>k,'')!~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Imagen adicional inválida.'; end if;
        end if;
      end loop;
      if (d->>'designOk')::boolean and x->'images'->>'front' is null and x->'images'->>'back' is null then raise exception 'Agrega las imágenes de todos los diseños antes de aprobar.'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements(d->'additionalDesigns'))<>(select count(distinct item->>'id') from jsonb_array_elements(d->'additionalDesigns') item) then raise exception 'Identificador de diseño repetido.'; end if;
  end if;
  if jsonb_typeof(d->'fiscal') is distinct from 'object' or jsonb_typeof(d->'shipment') is distinct from 'object' or jsonb_typeof(d->'payments') is distinct from 'array' or jsonb_array_length(d->'payments')>1000 then raise exception 'Datos fiscales, pagos o envío inválidos.'; end if;
  foreach k in array array['rfc','name','cp','regime','use','form','method'] loop
    if jsonb_typeof(d->'fiscal'->k) is distinct from 'string' or length(d->'fiscal'->>k)>1000 then raise exception 'Datos fiscales inválidos.'; end if;
  end loop;
  foreach k in array array['carrier','guide','date','eta','status'] loop
    if jsonb_typeof(d->'shipment'->k) is distinct from 'string' or length(d->'shipment'->>k)>500 then raise exception 'Datos de envío inválidos.'; end if;
  end loop;
  if coalesce(d->'shipment'->>'status','')<>all(array['Preparación','Enviado','En tránsito','Incidencia','Entregado']) or jsonb_typeof(d->'shipment'->'events') is distinct from 'array' or jsonb_array_length(d->'shipment'->'events')>1000 then raise exception 'Seguimiento inválido.'; end if;
  foreach k in array array['date','eta'] loop
    if d->'shipment'->>k<>'' then
      if (d->'shipment'->>k)!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha de envío inválida.'; end if;
      perform (d->'shipment'->>k)::date;
    end if;
  end loop;
  for x in select value from jsonb_array_elements(d->'payments') loop
    if jsonb_typeof(x->'amount') is distinct from 'number' or (x->>'amount')::numeric not between 0 and 1000000000 or jsonb_typeof(x->'retention') is distinct from 'number' or (x->>'retention')::numeric not between 0 and 1000000000 or (x->>'date')!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Registro de pago inválido.'; end if;
    perform (x->>'date')::date;
  end loop;
  if d ? 'showVat' and jsonb_typeof(d->'showVat')<>'boolean' then raise exception 'Desglose inválido.'; end if;
  if d ? 'supplier' then
    if jsonb_typeof(d->'supplier')<>'object' or coalesce(d->'supplier'->>'mode','')<>all(array['none','added','included']) or jsonb_typeof(d->'supplier'->'extras')<>'array' or jsonb_array_length(d->'supplier'->'extras')>500 then raise exception 'Costos extra inválidos.'; end if;
    for x in select value from jsonb_array_elements(d->'supplier'->'extras') loop
      if coalesce(x->>'type','')<>all(array['Error','Impresión extra']) or coalesce(x->>'product','')<>all(array['Butarga','Playera','Short']) or coalesce(x->>'cut','')<>all(array['Hombre','Mujer']) or coalesce(x->>'size','')='' or length(x->>'size')>30 or jsonb_typeof(x->'qty')<>'number' or (x->>'qty')::numeric not between 1 and 10000 or trunc((x->>'qty')::numeric)<>(x->>'qty')::numeric or jsonb_typeof(x->'cutting')<>'boolean' or length(coalesce(x->>'note',''))>500 then raise exception 'Error o impresión extra inválidos.'; end if;
    end loop;
  end if;
  if (d->>'dataOk')::boolean and jsonb_array_length(d->'rows')=0 then raise exception 'El pedido debe tener prendas.'; end if;
  if (d->>'confirmed')::boolean and (not (d->>'dataOk')::boolean or d->>'payerType'='pending') then raise exception 'Revisa el pedido y confirma el tipo de cliente antes de confirmar la cotización.'; end if;
  if (d->>'designOk')::boolean and (jsonb_array_length(d->'rows')=0 or (d->'images'->>'front' is null and d->'images'->>'back' is null)) then raise exception 'Agrega el diseño antes de aprobarlo.'; end if;
  if (d->>'paymentOk')::boolean and ((d->>'advance')::numeric<=0 or d->>'advanceDate'='' or (d->>'advanceSimulated')::boolean) then raise exception 'Valida un anticipo real antes de iniciar.'; end if;
  if d->>'startDate'<>'' and not ((d->>'dataOk')::boolean and (d->>'confirmed')::boolean and (d->>'designOk')::boolean and (d->>'paymentOk')::boolean) then raise exception 'Faltan las validaciones de pedido, cotización, diseño o anticipo.'; end if;
  if (d->>'released')::boolean and d->>'startDate'='' then raise exception 'Valida el inicio antes de pasar a costura.'; end if;
  if (d->>'sewn')::boolean and not (d->>'released')::boolean then raise exception 'Diseño debe liberar el pedido a costura.'; end if;
  if (d->>'packed')::boolean and not (d->>'sewn')::boolean then raise exception 'Costura debe validar antes de empacar.'; end if;
  if (d->>'shipped')::boolean and (not (d->>'packed')::boolean or trim(d->>'address')='' or trim(d->'shipment'->>'carrier')='' or trim(d->'shipment'->>'guide')='' or d->'shipment'->>'date'='') then raise exception 'Completa empaque, dirección, paquetería, guía y fecha antes del envío.'; end if;
  if (d->>'delivered')::boolean and (not (d->>'shipped')::boolean or d->'shipment'->>'status'<>'Entregado') then raise exception 'Registra primero el envío y después la entrega.'; end if;
end $$;

create function proway_private.api_members(action text, w uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; uid uuid=auth.uid(); uemail text; uname text; i proway_private.invites%rowtype;
  stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; result jsonb; prev jsonb;
  patch jsonb; expected jsonb; guards jsonb; projected jsonb; candidate jsonb; k text; token text;
  oid text; op uuid; hash text; conflict boolean=false; resetting boolean=false; changes text[]; actor text;
begin
  if uid is null or jsonb_typeof(p) is distinct from 'object' then raise exception 'Inicia sesión para continuar.' using errcode='42501'; end if;
  select lower(u.email), left(coalesce(u.raw_user_meta_data->>'display_name',u.email),200) into uemail,uname
    from auth.users u where u.id=uid and u.email_confirmed_at is not null and not u.is_anonymous;
  if uemail is null then raise exception 'Cuenta sin verificar.' using errcode='42501'; end if;
  if action='join' then
    token=p->>'token'; if coalesce(token,'')!~ '^[a-f0-9]{64}$' then raise exception 'Invitación inválida.'; end if;
    select * into i from proway_private.invites where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
    if not found or i.expires_at<now() or (i.used_at is not null and i.used_by<>uid) or (i.email<>'' and i.email<>uemail) or (i.reserved_email is not null and i.reserved_email<>uemail) then raise exception 'La invitación no es válida, venció o ya se utilizó.' using errcode='42501'; end if;
    if i.used_by=uid then return jsonb_build_object('workspace',i.workspace_id,'role',(select role from proway_private.members where workspace_id=i.workspace_id and user_id=uid)); end if;
    insert into proway_private.members(workspace_id,user_id,role,display_name) values(i.workspace_id,uid,i.role,uname)
      on conflict(workspace_id,user_id) do update set role=excluded.role,active=true,display_name=excluded.display_name;
    if i.created_by is null and i.role='admin' then update proway_private.workspaces set owner_id=uid where id=i.workspace_id and owner_id is null; end if;
    update proway_private.invites set used_by=uid,used_at=now() where token_hash=i.token_hash;
    return jsonb_build_object('workspace',i.workspace_id,'role',i.role);
  end if;
  if action='memberships' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',m.workspace_id,'name',ws.name,'role',m.role,'displayName',m.display_name)) from proway_private.members m join proway_private.workspaces ws on ws.id=m.workspace_id where m.user_id=uid and m.active),'[]'::jsonb);
  end if;
  r=proway_private.member_role(w);
  select m.display_name into actor from proway_private.members m where m.workspace_id=w and m.user_id=uid;
  if action='sync' then
    select * into sett from proway_private.settings where workspace_id=w;
    result=jsonb_build_object('workspace',w,'name',(select name from proway_private.workspaces where id=w),'role',r,'displayName',actor,
      'settingsVersion',sett.version,'settings',case when r='admin' then case when coalesce(p->>'settingsVersion','0')::bigint=sett.version then null else sett.data end else jsonb_build_object('calendar',sett.data->'calendar') end,
      'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.order_id,'version',o.version,'data',proway_private.project_order(o.data,r)) order by o.order_id) from proway_private.orders o where o.workspace_id=w and o.version<>coalesce((p->'versions'->>o.order_id)::bigint,0)),'[]'::jsonb),
      'orderIds',coalesce((select jsonb_agg(o.order_id order by o.order_id) from proway_private.orders o where o.workspace_id=w),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(ej order by eid) from (select e.id eid,jsonb_build_object('id',e.id,'client',e.order_id,'action',e.action,'actor',e.actor,'role',e.role,'time',e.created_at) ej from proway_private.events e where e.workspace_id=w order by e.id desc limit 200) ev),'[]'::jsonb));
    return result;
  end if;
  if action='members' then
    if r<>'admin' then raise exception 'Solo administración puede gestionar usuarios.' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'role',m.role,'active',m.active,'owner',ws.owner_id=m.user_id) order by m.created_at) from proway_private.members m join auth.users u on u.id=m.user_id join proway_private.workspaces ws on ws.id=m.workspace_id where m.workspace_id=w),'[]'::jsonb);
  end if;
  if action='invite' then
    if r<>'admin' then raise exception 'Solo administración puede invitar.' using errcode='42501'; end if;
    if coalesce(p->>'role','')<>all(array['admin','diseno','costura','empaque','envio','consulta']) then raise exception 'Departamento inválido.'; end if;
    if (select count(*) from proway_private.invites where workspace_id=w and created_by=uid and created_at>now()-interval '1 hour')>=30 then raise exception 'Demasiadas invitaciones. Intenta más tarde.'; end if;
    uemail=lower(trim(coalesce(p->>'email',''))); if length(uemail)>254 or (uemail<>'' and uemail!~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'Correo inválido.'; end if;
    token=encode(extensions.gen_random_bytes(32),'hex');
    insert into proway_private.invites(token_hash,workspace_id,role,email,expires_at,created_by) values(encode(extensions.digest(token,'sha256'),'hex'),w,p->>'role',uemail,now()+interval '7 days',uid);
    return jsonb_build_object('token',token,'expiresAt',now()+interval '7 days','role',p->>'role');
  end if;
  if action='member_update' then
    if r<>'admin' then raise exception 'Solo administración puede gestionar usuarios.' using errcode='42501'; end if;
    if (p->>'userId')::uuid=(select owner_id from proway_private.workspaces where id=w) then raise exception 'El acceso del propietario se conserva.'; end if;
    if coalesce(p->>'role','')<>all(array['admin','diseno','costura','empaque','envio','consulta']) or jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception 'Permisos inválidos.'; end if;
    update proway_private.members set role=p->>'role',active=(p->>'active')::boolean where workspace_id=w and user_id=(p->>'userId')::uuid;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Acción no permitida.';
end $$;
create function proway_private.save_settings_body(w uuid,r text,p jsonb,uid uuid,actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; patch jsonb=p->'patch'; expected jsonb=p->'expected'; guards jsonb=coalesce(p->'guards','{}'::jsonb); result jsonb; candidate jsonb; projected jsonb; k text; oid text; conflict boolean=false; resetting boolean=false; e jsonb;
begin
    if r<>'admin' then raise exception 'Solo administración puede modificar precios y datos fiscales.' using errcode='42501'; end if;
    select * into sett from proway_private.settings where workspace_id=w for update;
    foreach k in array array(select jsonb_object_keys(patch)) loop
      if k<>all(array['basePrice','cutPrice','rates','shortCosts','issuer','calendar','isrControl','designs','expenses']) then raise exception 'Configuración no permitida.'; end if;
      if coalesce(sett.data->k,'null'::jsonb) is distinct from coalesce(expected->k,'null'::jsonb) and sett.data->k is distinct from patch->k then conflict=true; end if;
    end loop;
    if conflict then return jsonb_build_object('conflict',true,'id','settings','version',sett.version,'data',sett.data); end if;
    candidate=sett.data||patch;
    if (candidate->>'basePrice')::numeric not between 0 and 1000000000 or (candidate->>'cutPrice')::numeric not between 0 and 1000000000 or jsonb_typeof(candidate->'rates') is distinct from 'array' or jsonb_array_length(candidate->'rates')>500 or candidate->'issuer'->>'legalType'<>'PF' or coalesce(candidate->'issuer'->>'regime','') not like '626%' or jsonb_typeof(candidate->'calendar'->'saturday') is distinct from 'boolean' or length(candidate->'calendar'->>'extra')>10000 or octet_length(candidate::text)>15000000 then raise exception 'Configuración inválida.'; end if;
    if candidate ? 'expenses' then
      if jsonb_typeof(candidate->'expenses') is distinct from 'array' or jsonb_array_length(candidate->'expenses')>10000 then raise exception 'Registro de egresos inválido.'; end if;
      for e in select value from jsonb_array_elements(candidate->'expenses') loop
        if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
          or jsonb_typeof(e->'amount') is distinct from 'number' or (e->>'amount')::numeric not between 0.01 and 1000000000
          or coalesce(e->>'category','') <> all(array['Hilos','Tela','Reparación de máquina','Costura','Sublimación y corte','Envío','Otro'])
          or coalesce(e->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((e->>'date')::date,'YYYY-MM-DD') <> e->>'date'
          or jsonb_typeof(e->'note') is distinct from 'string' or length(e->>'note')>500
          or jsonb_typeof(e->'client') is distinct from 'string' or (e->>'client'<>'' and e->>'client' !~ '^[A-Za-z0-9_-]{1,64}$') then raise exception 'Egreso inválido.'; end if;
      end loop;
      if exists(select 1 from jsonb_array_elements(candidate->'expenses') a group by a->>'id' having count(*)>1) then raise exception 'Egreso duplicado.'; end if;
    end if;
    update proway_private.settings set data=candidate,version=version+1,updated_at=now() where workspace_id=w returning version into sett.version;
    insert into proway_private.events(workspace_id,actor_id,actor,role,action) values(w,uid,actor,r,'Administración actualizó la configuración');
    result=jsonb_build_object('ok',true,'id','settings','version',sett.version,'data',candidate);
  return result;
end $$;
create function proway_private.save_order_body(w uuid,r text,p jsonb,uid uuid,actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; patch jsonb=p->'patch'; expected jsonb=p->'expected'; guards jsonb=coalesce(p->'guards','{}'::jsonb); result jsonb; candidate jsonb; projected jsonb; k text; oid text; conflict boolean=false; resetting boolean=false;
begin
    oid=p->>'orderId'; if coalesce(oid,'')!~ '^[A-Za-z0-9_-]{1,64}$' or patch ? 'id' and patch->>'id'<>oid then raise exception 'Pedido inválido.'; end if;
    select * into stored from proway_private.orders where workspace_id=w and order_id=oid for update;
    if not found then
      if r<>'admin' then raise exception 'Solo administración puede crear pedidos.' using errcode='42501'; end if;
      if coalesce(p->>'baseVersion','0')::bigint<>0 then return jsonb_build_object('conflict',true,'id',oid,'version',0,'data',null); end if;
      if (select count(*) from proway_private.orders where workspace_id=w)>=1000 then raise exception 'Límite de pedidos alcanzado. Archiva y descarga un respaldo.'; end if;
      candidate=patch||jsonb_build_object('id',oid); perform proway_private.validate_order(candidate);
      insert into proway_private.orders(workspace_id,order_id,data,updated_by) values(w,oid,candidate,uid) returning * into stored;
    else
      projected=proway_private.project_order(stored.data,r);
      resetting=r='diseno' and (patch ? 'images' or patch ? 'additionalDesigns' or patch->'designOk'='false'::jsonb);
      for k in select jsonb_object_keys(patch) loop
        if r='consulta' or r='diseno' and k<>all(array['images','additionalDesigns','designOk','released']) and not (resetting and k=any(array['startDate','sewn','packed','shipped','delivered']) and patch->>k=any(array['','false'])) or r='costura' and k<>'sewn' or r='empaque' and k<>'packed' or r='envio' and k<>all(array['shipment','shipped','delivered']) then raise exception 'Tu departamento no puede modificar este campo: %',k using errcode='42501'; end if;
        if coalesce(projected->k,'null'::jsonb) is distinct from coalesce(expected->k,'null'::jsonb) and projected->k is distinct from patch->k then conflict=true; end if;
      end loop;
      for k in select jsonb_object_keys(guards) loop
        if coalesce(projected->k,'null'::jsonb) is distinct from coalesce(guards->k,'null'::jsonb) then conflict=true; end if;
      end loop;
      if conflict then return jsonb_build_object('conflict',true,'id',oid,'version',stored.version,'data',projected); end if;
      candidate=stored.data||patch;
      if (patch ? 'images' and patch->'images' is distinct from stored.data->'images') or (patch ? 'additionalDesigns' and patch->'additionalDesigns' is distinct from coalesce(stored.data->'additionalDesigns','[]'::jsonb)) then
        candidate=candidate||jsonb_build_object('designOk',false,'startDate','','released',false,'sewn',false,'packed',false,'shipped',false,'delivered',false);
      end if;
      if resetting or (patch ? 'images' and patch->'images' is distinct from stored.data->'images') or (patch ? 'additionalDesigns' and patch->'additionalDesigns' is distinct from coalesce(stored.data->'additionalDesigns','[]'::jsonb)) then candidate=jsonb_set(candidate,'{shipment,status}','"Preparación"'::jsonb); end if;
      if r='diseno' and resetting then candidate=candidate||jsonb_build_object('startDate','','released',false,'sewn',false,'packed',false,'shipped',false,'delivered',false); end if;
      -- Only the server appends shipment events; client event arrays cannot rewrite history.
      if patch ? 'shipment' then
        candidate=jsonb_set(candidate,'{shipment,events}',stored.data->'shipment'->'events');
        if candidate->'shipment'->>'status' is distinct from stored.data->'shipment'->>'status' then
          candidate=jsonb_set(candidate,'{shipment,events}',(stored.data->'shipment'->'events')||jsonb_build_array(jsonb_build_object('status',candidate->'shipment'->>'status','date',coalesce(nullif(candidate->'shipment'->>'date',''),(now() at time zone 'America/Mexico_City')::date::text))));
        end if;
      end if;
      perform proway_private.validate_order(candidate);
      update proway_private.orders set data=candidate,version=version+1,updated_by=uid,updated_at=now() where workspace_id=w and order_id=oid returning * into stored;
    end if;
    insert into proway_private.events(workspace_id,order_id,actor_id,actor,role,action) values(w,oid,uid,actor,r,case r when 'diseno' then 'Diseño actualizó el pedido' when 'costura' then 'Costura validó el pedido' when 'empaque' then 'Empaque validó el pedido' when 'envio' then 'Envío actualizó el seguimiento' else 'Administración actualizó el pedido' end);
    result=jsonb_build_object('ok',true,'id',oid,'version',stored.version,'data',proway_private.project_order(stored.data,r));
  return result;
end $$;
create function proway_private.api_write(action text, w uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; uid uuid=auth.uid(); uemail text; uname text; i proway_private.invites%rowtype;
  stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; result jsonb; prev jsonb;
  patch jsonb; expected jsonb; guards jsonb; projected jsonb; candidate jsonb; k text; token text;
  oid text; op uuid; hash text; conflict boolean=false; resetting boolean=false; changes text[]; actor text;
begin
  if uid is null or jsonb_typeof(p) is distinct from 'object' then raise exception 'Inicia sesión para continuar.' using errcode='42501'; end if;
  select lower(u.email), left(coalesce(u.raw_user_meta_data->>'display_name',u.email),200) into uemail,uname
    from auth.users u where u.id=uid and u.email_confirmed_at is not null and not u.is_anonymous;
  if uemail is null then raise exception 'Cuenta sin verificar.' using errcode='42501'; end if;
  r=proway_private.member_role(w);
  select m.display_name into actor from proway_private.members m where m.workspace_id=w and m.user_id=uid;
  if action<>all(array['save_order','save_settings']) then raise exception 'Acción no permitida.'; end if;
  op=(p->>'operationId')::uuid; hash=encode(extensions.digest(action||p::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(w::text||uid::text||op::text,0));
  select o.result,o.request_hash into prev,token from proway_private.operations o where o.workspace_id=w and o.user_id=uid and o.operation_id=op;
  if found then if token<>hash then raise exception 'La operación cambió. Intenta nuevamente.'; end if; return prev; end if;
  patch=p->'patch'; expected=p->'expected'; guards=coalesce(p->'guards','{}'::jsonb);
  if jsonb_typeof(patch) is distinct from 'object' or jsonb_typeof(expected) is distinct from 'object' or jsonb_typeof(guards) is distinct from 'object' then raise exception 'Cambio inválido.'; end if;
  if action='save_settings' then result=proway_private.save_settings_body(w,r,p,uid,actor); else result=proway_private.save_order_body(w,r,p,uid,actor); end if;
  if result->'conflict'='true'::jsonb then return result; end if;
  insert into proway_private.operations(workspace_id,user_id,operation_id,request_hash,result) values(w,uid,op,hash,result);
  return result;
end $$;

create function proway_private.api(action text,w uuid,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin if action=any(array['save_order','save_settings']) then return proway_private.api_write(action,w,p); else return proway_private.api_members(action,w,p); end if; end $$;

create function public.proway_api(action text, workspace uuid default null, payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select proway_private.api(action,workspace,payload); $$;

create function proway_private.signup_check(token text, email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i proway_private.invites%rowtype; e text=lower(trim(email));
begin
  if auth.role()<>'service_role' then raise exception 'Acceso no permitido.' using errcode='42501'; end if;
  if coalesce(token,'')!~ '^[a-f0-9]{64}$' or length(e)>254 or e!~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invitación o correo inválidos.'; end if;
  select * into i from proway_private.invites where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if not found or i.expires_at<now() or i.used_at is not null or i.attempts>=8 or (i.email<>'' and i.email<>e) or (i.reserved_email is not null and i.reserved_email<>e) then raise exception 'La invitación no es válida, venció o ya se utilizó.'; end if;
  update proway_private.invites set reserved_email=e,attempts=attempts+1 where token_hash=i.token_hash;
  return jsonb_build_object('existing',exists(select 1 from auth.users where lower(auth.users.email)=e));
end $$;
create function public.proway_signup_check(token text, email text) returns jsonb
language sql security invoker set search_path = '' as $$ select proway_private.signup_check(token,email); $$;

revoke execute on all functions in schema proway_private from public,anon,authenticated;
grant execute on function proway_private.api(text,uuid,jsonb) to authenticated;
grant execute on function proway_private.signup_check(text,text) to service_role;
revoke execute on function public.proway_api(text,uuid,jsonb) from public,anon;
grant execute on function public.proway_api(text,uuid,jsonb) to authenticated;
revoke execute on function public.proway_signup_check(text,text) from public,anon,authenticated;
grant execute on function public.proway_signup_check(text,text) to service_role;
comment on schema proway_private is 'Proway collaboration. Private tables; membership and projection enforced by scoped RPCs.';
