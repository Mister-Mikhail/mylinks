-- Versioned path is backfilled for existing links and changes automatically when URL changes.
alter table public.profile_links
  add column icon_snapshot_path text generated always as (
    '/link-icon/' || id::text || '/' || substr(md5(url), 1, 12) || '.png'
  ) stored;
