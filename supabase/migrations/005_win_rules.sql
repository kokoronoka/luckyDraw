-- =============================================================================
-- ZÉLL-V Lucky Draw — 005 winning rules (decided 2026-11-05, per campaign T&C)
-- Run after 004. Safe on a live database.
--
--   * A customer may win again in a later round, in ANY tier
--     (removes the old "each tier only once in the whole event" rule)
--   * A customer may win different tiers in the same round (e.g. 2nd and 4th)
--   * Round winners remain eligible for the Grand Prize
--   * A customer can't hold two winner slots of the same prize category
--     (e.g. two of R1's 4th prizes, or the Grand Prize twice)
--   * A forfeited customer is excluded from the redraw of that category
-- =============================================================================

drop index if exists public.winners_one_per_tier;
create unique index if not exists winners_one_per_category
  on public.winners (customer_id, prize_category_id) where status = 'won';

create or replace function public._draw_pool(p_category_id int)
returns table (customer_id uuid, weight bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cat public.prize_categories;
begin
  select * into cat from public.prize_categories where id = p_category_id;
  if not found then
    return;
  end if;

  return query
  with base as (
    select ea.customer_id, ea.effective::bigint as weight
    from public._effective_allocations(cat.round_id) ea
    where not cat.is_grand and ea.prize_category_id = cat.id
    union all
    select tg.customer_id, sum(tg.tickets)::bigint
    from public.ticket_grants tg
    where cat.is_grand and tg.voided_at is null
    group by tg.customer_id
  )
  select b.customer_id, b.weight
  from base b
  where b.weight > 0
    -- already holds a slot of THIS prize category (won or forfeited)
    and not exists (select 1 from public.winners w
                    where w.customer_id = b.customer_id
                      and w.prize_category_id = cat.id
                      and w.status in ('won', 'forfeited'));
end;
$$;

revoke execute on function public._draw_pool(int) from public, anon, authenticated;
