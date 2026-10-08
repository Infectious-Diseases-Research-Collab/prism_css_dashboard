-- Two hh_members fields added to the CSS survey (data dictionary 2026-10-02),
-- which every sync since has reported as "not a column of the table":
--   rdt_warning      integer  1 = interviewer acknowledged the "RDT required"
--                             warning (fever history or temperature >= 38)
--                             and went on to record why no RDT was done
--   why_rdt_not_done text     the reason, up to 80 characters
alter table public.hh_members
  add column if not exists rdt_warning integer,
  add column if not exists why_rdt_not_done text;

-- Each sync only re-reads records that changed, so records synced before
-- these columns existed would never get the values. Forgetting the form's
-- position makes the next run re-read every member record; unchanged values
-- are not rewritten (sync_upsert), so only the new columns are filled.
delete from public.sync_state where resource = 'submissions:hh_members';
