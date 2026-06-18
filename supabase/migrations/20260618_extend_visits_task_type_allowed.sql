-- Sync visits_task_type_allowed with the full WorkflowActivityId union
-- (types/workflow.ts, schemas/workflow.ts) — visits.task_type is populated
-- from activity IDs, not from campaigns.campaign_tasks, and the check
-- constraint was never extended when free_sample_distribution,
-- posm_deployment, photo_evidence, and notes were added as activity types.

alter table public.visits
  drop constraint if exists visits_task_type_allowed;

alter table public.visits
  add constraint visits_task_type_allowed
  check (
    task_type is null or task_type in (
      'register_outlet',
      'revisit_outlet',
      'sell_to_outlet',
      'product_survey',
      'availability_survey',
      'price_survey',
      'free_sample_distribution',
      'posm_deployment',
      'photo_evidence',
      'notes'
    )
  );
