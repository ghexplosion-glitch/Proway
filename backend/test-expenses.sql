-- Isolated transactional checks. No production workspace or real user is modified.
begin;
do $$
declare uid uuid=gen_random_uuid(); w uuid=gen_random_uuid(); op uuid=gen_random_uuid(); p jsonb; result jsonb; v bigint; rejected boolean; e jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
    values(uid,'proway-expense-test-'||uid::text||'@example.invalid',now(),false,'{}');
  insert into proway_private.workspaces(id,name,owner_id) values(w,'Transactional expense test',uid);
  insert into proway_private.members(workspace_id,user_id,role,display_name) values(w,uid,'admin','Test');
  insert into proway_private.settings(workspace_id,data) values(w,'{"basePrice":800,"cutPrice":10,"rates":[],"shortCosts":{},"issuer":{"name":"","rfc":"","cp":"","legalType":"PF","regime":"626"},"calendar":{"saturday":false,"extra":""},"isrControl":{"month":"2026-10","external":{}},"designs":[]}');
  insert into proway_private.orders(workspace_id,order_id,data) values(w,'TEST','{"id":"TEST","name":"Unchanged order","rows":[]}');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  e='{"id":"E-test","category":"Hilos","date":"2026-10-09","amount":200,"client":"","note":"Test"}';
  p=jsonb_build_object('operationId',op,'patch',jsonb_build_object('expenses',jsonb_build_array(e)),'expected',jsonb_build_object('expenses',null),'guards','{}'::jsonb);
  result=public.proway_api('save_settings',w,p);
  if result->'ok'<>'true'::jsonb or result->'data'->'expenses'->0->>'amount'<>'200' then raise exception 'Expense was not saved'; end if;
  v=(result->>'version')::bigint;
  if public.proway_api('save_settings',w,p)<>result or (select version from proway_private.settings where workspace_id=w)<>v then raise exception 'Retry duplicated the expense'; end if;
  result=public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',jsonb_build_object('expenses','[]'::jsonb),'expected',jsonb_build_object('expenses',null),'guards','{}'::jsonb));
  if result->'conflict'<>'true'::jsonb then raise exception 'Concurrent expense change was not protected'; end if;
  foreach e in array array[
    '{"id":"E-bad","category":"Tela","date":"2026-10-09","amount":0,"client":"","note":"Test"}'::jsonb,
    '{"id":"E-bad","category":"Tela","date":"2026-02-30","amount":5,"client":"","note":"Test"}'::jsonb,
    '{"id":"E-bad","category":"Unknown","date":"2026-10-09","amount":5,"client":"","note":"Test"}'::jsonb
  ] loop
    rejected=false;
    begin
      perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',jsonb_build_object('expenses',jsonb_build_array(e)),'expected',jsonb_build_object('expenses',result->'data'->'expenses'),'guards','{}'::jsonb));
    exception when sqlstate 'P0001' or sqlstate '22008' then rejected=true; end;
    if not rejected then raise exception 'Invalid expense accepted'; end if;
  end loop;
  e=result->'data'->'expenses'->0;rejected=false;
  begin
    perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',jsonb_build_object('expenses',jsonb_build_array(e,e)),'expected',jsonb_build_object('expenses',jsonb_build_array(e)),'guards','{}'::jsonb));
  exception when sqlstate 'P0001' then rejected=true; end;
  if not rejected then raise exception 'Duplicate expense accepted'; end if;
  update proway_private.members set role='diseno' where workspace_id=w and user_id=uid;rejected=false;
  begin perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch','{"expenses":[]}'::jsonb,'expected',jsonb_build_object('expenses',jsonb_build_array(e))));
  exception when insufficient_privilege then rejected=true; end;
  if not rejected then raise exception 'Department could modify expenses'; end if;
  if (public.proway_api('sync',w,'{}')->'settings') ? 'expenses' then raise exception 'Department received private expense data'; end if;
  if (select data from proway_private.orders where workspace_id=w and order_id='TEST')<>'{"id":"TEST","name":"Unchanged order","rows":[]}'::jsonb then raise exception 'Orders were modified'; end if;
  if (select version from proway_private.settings where workspace_id=w)<>v then raise exception 'Rejected writes changed settings'; end if;
end $$;
rollback;
select jsonb_build_object('passed',11,'test_workspaces_remaining',(select count(*) from proway_private.workspaces where name='Transactional expense test')) as expense_checks;
