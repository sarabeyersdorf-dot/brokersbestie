-- CRM tasks in Bestie (2026-10-23, Sara: "I dont show any tasks at all for me
-- in the crm echo deal"). The feed now sends each deal's task list; those rows
-- carry source = 'crm', and crm_dirty like dates/events for ticks going back.
alter table public.tasks add column if not exists source text;
alter table public.tasks add column if not exists crm_dirty boolean default false;
