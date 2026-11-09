-- =============================================================================
-- ZÉLL-V Lucky Draw — 010 Live-draw stage
-- Run after 009. Safe to re-run.
--
-- The projector plays the Golden Ticket drum. This read returns one ticket
-- row per allocated ticket in the category pool (the same pool draw_winner
-- uses), plus winners already drawn. The browser does not pick the winner.
-- =============================================================================

create or replace function public.draw_stage(p_category_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cat      public.prize_categories;
  rd       public.rounds;
  v_filled int;
  v_n      int;
  v_t      bigint;
begin
  if not public.is_admin() then
    raise exception '只限管理员 / Admins only' using errcode = '42501';
  end if;
  select * into cat from public.prize_categories where id = p_category_id;
  if not found then
    raise exception '奖项无效 / Invalid prize category';
  end if;
  select * into rd from public.rounds where id = cat.round_id;
  select count(*)::int into v_filled from public.winners where prize_category_id = cat.id and status = 'won';
  select count(*)::int, coalesce(sum(weight), 0)::bigint into v_n, v_t from public._draw_pool(cat.id);

  return jsonb_build_object(
    'draw', jsonb_build_object(
      'id', cat.id::text,
      'title', case when cat.is_grand or rd.id is null
        then jsonb_build_object('en', 'Grand Finale', 'zh', '总决赛')
        else jsonb_build_object('en', rd.name_en, 'zh', rd.name_zh) end,
      'date', case when cat.is_grand or rd.id is null
        then (select max(draw_date) from public.rounds) else rd.draw_date end,
      'note', jsonb_build_object(
        'en', cat.name_en || case when coalesce(cat.prize_desc, '') = '' then '' else ' · ' || cat.prize_desc end,
        'zh', cat.name_zh || case when coalesce(cat.prize_desc, '') = '' then '' else ' · ' || cat.prize_desc end),
      'grand', cat.is_grand
    ),
    'prizes', jsonb_build_array(jsonb_build_object(
      'id', cat.id::text,
      'rank', cat.rank,
      'short', jsonb_build_object('en', cat.name_en, 'zh', cat.name_zh),
      'name', jsonb_build_object(
        'en', case when coalesce(cat.prize_desc, '') = '' then cat.name_en else cat.prize_desc end,
        'zh', case when coalesce(cat.prize_desc, '') = '' then cat.name_zh else cat.prize_desc end),
      'count', cat.winner_slots
    )),
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object(
               't', 'T' || p.customer_id::text || '-' || gs,
               'n', public.mask_name(c.name),
               'p', public.mask_phone(c.phone),
               'c', p.customer_id::text
             ) order by c.name, gs), '[]'::jsonb)
      from public._draw_pool(cat.id) p
      join public.customers c on c.id = p.customer_id
      cross join lateral generate_series(1, p.weight::int) gs
    ),
    'revealed', (
      select coalesce(jsonb_agg(jsonb_build_object(
               't', 'W' || w.id,
               'n', public.mask_name(c.name),
               'p', public.mask_phone(c.phone),
               'c', c.id::text,
               'prize', cat.id::text,
               'at', w.created_at,
               'winner_id', w.id
             ) order by w.id), '[]'::jsonb)
      from public.winners w
      join public.customers c on c.id = w.customer_id
      where w.prize_category_id = cat.id and w.status = 'won'
    ),
    'admin_winners', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', w.id, 'status', w.status, 'name', c.name,
               'phone_masked', public.mask_phone(c.phone),
               'forfeit_reason', w.forfeit_reason
             ) order by w.id), '[]'::jsonb)
      from public.winners w
      join public.customers c on c.id = w.customer_id
      where w.prize_category_id = cat.id
    ),
    'filled', v_filled,
    'pool', jsonb_build_object('count', v_n, 'tickets', v_t),
    'blocked_reason', public._draw_blocked_reason(cat.id)
  );
end;
$$;

revoke execute on function public.draw_stage(int) from public, anon, authenticated;
grant execute on function public.draw_stage(int) to authenticated;
