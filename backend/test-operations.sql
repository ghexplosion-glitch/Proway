-- Synthetic team only. Every account, order and expense is rolled back.
begin;
do $$
declare uid uuid=gen_random_uuid(); w uuid=gen_random_uuid(); op uuid;
  d jsonb; result jsonb; previous jsonb; patch jsonb; viewdata jsonb; rejected boolean; k text;
  emptyq jsonb='{"counts":{},"names":false,"design":false,"notes":"","checkedAt":""}';
  milestones jsonb='{"design":"2026-10-09","sewing":"2026-10-09","packing":"","shipping":""}';
  goodq jsonb='{"counts":{"1":2},"names":true,"design":true,"notes":"Conteo sintético","checkedAt":"2026-10-09"}';
  art text='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(uid,'proway-operations-test-'||uid::text||'@example.invalid',now(),false,'{}');
  insert into proway_private.workspaces(id,name,owner_id) values(w,'Transactional operations test',uid);
  insert into proway_private.members(workspace_id,user_id,role,display_name) values(w,uid,'admin','Synthetic test');
  insert into proway_private.settings(workspace_id,data) values(w,'{"basePrice":800,"cutPrice":10,"rates":[],"shortCosts":{},"issuer":{"name":"","rfc":"","cp":"","legalType":"PF","regime":"626"},"calendar":{"saturday":false,"extra":""},"isrControl":{"month":"2026-10","external":{}},"designs":[],"expenses":[]}');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  d='{"id":"TEST","name":"Synthetic operations client","contact":"","phone":"","address":"","orderDate":"","rows":[{"id":1,"product":"Butarga","size":"M","cut":"Hombre","qty":2,"printed":"Test","color":"Rojo","design":"Rojo","placement":"","special":""}],"images":{"front":null,"back":null},"dataOk":false,"confirmed":false,"designOk":false,"advance":0,"advanceDate":"","advanceIsr":0,"advanceCfdi":false,"advanceSimulated":false,"advanceRecord":null,"payments":[],"payerType":"PF","paymentOk":false,"startDate":"","released":false,"sewn":false,"packed":false,"shipped":false,"delivered":false,"source":"Test","sourceNote":"","vatMode":"included","showVat":false,"supplier":{"mode":"none","extras":[]},"fiscal":{"rfc":"","name":"","cp":"","regime":"","use":"","form":"","method":""},"shipment":{"carrier":"","guide":"","date":"","eta":"","status":"Preparación","events":[]}}';
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'baseVersion',0,'patch',d,'expected','{}'::jsonb));
  if result->'data'<>d then raise exception 'Legacy order was rewritten during migration';end if;
  d=d||jsonb_build_object('images',jsonb_build_object('front',art,'back',null),'quality',emptyq,'milestones',milestones,'refunds','[]'::jsonb,'cancellation','{"date":"","reason":""}'::jsonb)||'{"quoteStatus":"active","vatMode":"none","dataOk":true,"confirmed":true,"designOk":true,"advance":400,"advanceDate":"2026-10-09","paymentOk":true,"advanceRecord":{"date":"2026-10-09","amount":400,"retention":0,"documented":false,"simulated":false,"vatMode":"included"},"payments":[{"id":"PAY-1","date":"2026-10-09","amount":100,"retention":0,"documented":false,"simulated":false,"note":"Test","vatMode":"none"}],"startDate":"2026-10-09","released":true,"sewn":true}';
  perform proway_private.validate_order(d);update proway_private.orders set data=d where workspace_id=w and order_id='TEST';
  for patch in select unnest(array[
    '{"refunds":[{"id":"REF","date":"2026-10-09","amount":501,"note":""}]}'::jsonb,
    '{"refunds":[{"id":"REF","date":"2026-02-31","amount":1,"note":""}]}'::jsonb,
    '{"refunds":[{"id":"REF","date":"2026-10-09","amount":-1,"note":""}]}'::jsonb,
    '{"refunds":[{"id":"REF","date":"2026-10-09","amount":1,"note":"","secret":1}]}'::jsonb,
    '{"refunds":[{"id":"REF","date":"2026-10-09","amount":1,"note":""},{"id":"REF","date":"2026-10-09","amount":1,"note":""}]}'::jsonb,
    '{"quoteStatus":"cancelled"}'::jsonb,
    '{"cancellation":{"date":"2026-02-31","reason":"Test"}}'::jsonb,
    '{"quality":{"counts":{"1":1},"names":true,"design":true,"notes":"","checkedAt":"2026-10-09"}}'::jsonb,
    '{"quality":{"counts":{"2":2},"names":true,"design":true,"notes":"","checkedAt":""}}'::jsonb,
    '{"quality":{"counts":{"1":2.5},"names":true,"design":true,"notes":"","checkedAt":""}}'::jsonb,
    '{"quality":{"counts":{"1":2},"names":false,"design":true,"notes":"","checkedAt":"2026-10-09"}}'::jsonb,
    '{"quality":{"counts":{"1":2},"names":true,"design":true,"notes":"","checkedAt":"2026-02-31"}}'::jsonb,
    '{"milestones":{"design":"2026-02-31","sewing":"","packing":"","shipping":""}}'::jsonb,
    '{"milestones":{"design":"","sewing":"","packing":"","shipping":"","secret":""}}'::jsonb
  ]) loop
    rejected=false;begin perform proway_private.validate_order(d||patch);exception when others then rejected=true;end;
    if not rejected then raise exception 'Invalid operations fields accepted: %',patch;end if;
  end loop;
  patch='{"quoteStatus":"cancelled","cancellation":{"date":"2026-10-09","reason":"Synthetic cancellation"}}';
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',patch,'expected',jsonb_build_object('quoteStatus',d->'quoteStatus','cancellation',d->'cancellation')));
  if result->'data'->'advanceRecord'<>d->'advanceRecord' or result->'data'->'payments'<>d->'payments' or result->'data'->'rows'<>d->'rows' then raise exception 'Cancellation erased cash or garments';end if;
  previous=result->'data';update proway_private.members set role='empaque' where workspace_id=w and user_id=uid;
  rejected=false;begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',jsonb_build_object('quality',goodq),'expected',jsonb_build_object('quality',emptyq)));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Packing continued a cancelled order';end if;
  viewdata=public.proway_api('sync',w,'{}')->'orders'->0->'data';
  if viewdata->>'quoteStatus'<>'cancelled' or viewdata->'refunds'<>'[]'::jsonb or viewdata->'advanceRecord'<>'null'::jsonb or viewdata->'quality'<>emptyq or viewdata->'cancellation'->>'reason'='Synthetic cancellation' then raise exception 'Department state is incomplete or exposes private finance';end if;
  update proway_private.members set role='admin' where workspace_id=w and user_id=uid;
  patch='{"refunds":[{"id":"REF-1","date":"2026-10-09","amount":150,"note":"Synthetic refund"}]}';op=gen_random_uuid();
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected',jsonb_build_object('refunds',previous->'refunds')));
  if result->'data'->'refunds'->0->>'amount'<>'150' or result->'data'->'advanceRecord'<>d->'advanceRecord' then raise exception 'Refund erased the original receipt';end if;
  if public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected',jsonb_build_object('refunds',previous->'refunds')))<>result then raise exception 'Retry duplicated refund';end if;
  previous=result->'data';rejected=false;
  begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"advanceRecord":null,"payments":[]}'::jsonb,'expected',jsonb_build_object('advanceRecord',previous->'advanceRecord','payments',previous->'payments')));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Receipt correction reduced cash below paid refunds';end if;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"quoteStatus":"active"}'::jsonb,'expected','{"quoteStatus":"cancelled"}'::jsonb));
  if result->'data'->'refunds'<>previous->'refunds' or result->'data'->'payments'<>previous->'payments' then raise exception 'Reactivation lost its ledger';end if;
  previous=result->'data';update proway_private.members set role='empaque' where workspace_id=w and user_id=uid;
  rejected=false;begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"packed":true}'::jsonb,'expected','{"packed":false}'::jsonb));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Packing bypassed quality gate';end if;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',jsonb_build_object('quality',goodq),'expected',jsonb_build_object('quality',emptyq)));
  if result->'data'->'quality'<>goodq then raise exception 'Packing cannot save valid quality';end if;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"packed":true}'::jsonb,'expected','{"packed":false}'::jsonb,'guards',jsonb_build_object('quality',emptyq)));
  if result->'conflict'<>'true'::jsonb then raise exception 'Stale quality guard was ignored';end if;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',jsonb_build_object('packed',true,'milestones',milestones||'{"packing":"2026-10-09"}'::jsonb),'expected',jsonb_build_object('packed',false,'milestones',milestones),'guards',jsonb_build_object('quality',goodq)));
  if result->'data'->>'packed'<>'true' or result->'data'->'milestones'->>'packing'<>'2026-10-09' then raise exception 'Validated handoff did not store department date';end if;
  previous=result->'data';rejected=false;
  begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',jsonb_build_object('milestones',previous->'milestones'||'{"design":"2026-10-10"}'::jsonb),'expected',jsonb_build_object('milestones',previous->'milestones')));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Packing changed another department date';end if;
  rejected=false;begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"refunds":[]}'::jsonb,'expected',jsonb_build_object('refunds','[]'::jsonb)));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Packing can edit private refunds';end if;
  update proway_private.members set role='diseno' where workspace_id=w and user_id=uid;
  viewdata=proway_private.project_order(previous,'diseno');
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',jsonb_build_object('images',jsonb_build_object('front',null,'back',art),'quality',emptyq),'expected',jsonb_build_object('images',viewdata->'images','quality',viewdata->'quality')));
  if result->'data'->'quality'<>emptyq or result->'data'->>'packed'<>'false' or result->'data'->>'designOk'<>'false' then raise exception 'Changed design retained old quality or packing';end if;
  update proway_private.members set role='admin' where workspace_id=w and user_id=uid;
  previous=public.proway_api('sync',w,'{}')->'orders'->0->'data';
  if previous->'refunds'->0->>'amount'<>'150' or previous->'advanceRecord'<>d->'advanceRecord' then raise exception 'Department edit changed private ledger';end if;
  patch='{"expenses":[{"id":"EXP-1","client":"TEST","category":"Costura","date":"2026-10-09","baseAmount":100,"iva":16,"amount":116,"note":"Synthetic expense"}]}';op=gen_random_uuid();
  result=public.proway_api('save_settings',w,jsonb_build_object('operationId',op,'patch',patch,'expected','{"expenses":[]}'::jsonb));
  if result->'data'->'expenses'<>patch->'expenses' then raise exception 'Base and extra IVA expense cannot synchronize';end if;
  if public.proway_api('save_settings',w,jsonb_build_object('operationId',op,'patch',patch,'expected','{"expenses":[]}'::jsonb))<>result then raise exception 'Retry duplicated expense';end if;
  rejected=false;begin perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',jsonb_build_object('expenses',jsonb_set(patch->'expenses','{0,amount}','100'::jsonb)),'expected',jsonb_build_object('expenses',patch->'expenses')));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Expense total can disagree with base plus IVA';end if;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='proway_private' and p.proname in ('project_order','validate_order','save_order_body','save_settings_body') and (p.prosecdef or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))) then raise exception 'Private function privileges changed';end if;
end $$;
rollback;
select jsonb_build_object('passed',true,'test_workspaces_remaining',(select count(*) from proway_private.workspaces where name='Transactional operations test'),'test_users_remaining',(select count(*) from auth.users where email like 'proway-operations-test-%@example.invalid')) as operations_checks;
