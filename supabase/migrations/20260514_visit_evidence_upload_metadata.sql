alter table public.visit_evidence
  add column if not exists original_file_name text,
  add column if not exists original_file_size bigint,
  add column if not exists compressed_file_size bigint,
  add column if not exists mime_type text;

