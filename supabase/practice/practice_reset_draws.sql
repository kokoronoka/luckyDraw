-- =============================================================================
-- PRACTICE PROJECT ONLY — wipe all draws and winners so you can rehearse again.
-- Refuses to run on the live database (needs the _practice_env marker table
-- that only practice_setup.sql creates).
-- =============================================================================
do $$
begin
  if to_regclass('public._practice_env') is null then
    raise exception 'STOP: this is not the practice project (no _practice_env table). Nothing was deleted.';
  end if;
  delete from public.winners;
  delete from public.draws;
  raise notice 'Practice draws and winners cleared.';
end;
$$;

select 'Practice draws cleared' as status;
