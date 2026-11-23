# Free-tier readiness runbook

How to move ActivationIQ onto the Supabase Free plan without repeating the earlier outage, and how to reduce Vercel usage to fit a 4-hour monthly Fluid Active CPU allowance.

**Do not downgrade until every item in the [downgrade-ready checklist](#downgrade-ready-checklist) is true.**

## What went wrong

The Supabase `evidence` bucket held about 10 GB when the project was downgraded to a plan with 1 GB of file storage. The whole organisation was restricted, so every API returned HTTP 402, including login. The Storage API was blocked too, so the files could not be deleted to clear the restriction.

Contributing causes:

- Vercel crons ran about 576 times a day, using roughly 13 minutes of CPU a day.
- The built-in evidence migration only handles archived campaigns, so older evidence stayed on Supabase.
- Each scheduled migration wrote job and audit rows even when it had nothing to do.
- `system_events` grew to about 132 MB because nothing removed old rows.
- The login page could wait forever on "Checking session...".

## What changed

| Area | Change |
| --- | --- |
| `vercel.json` | Keeps only the daily summary and campaign archive crons. |
| `.github/workflows/scheduled-jobs.yml` | Runs monitoring every 30 minutes and evidence migration hourly. |
| `lib/storage/media-migration.ts` | Scheduled runs with no candidates write no rows. Manual runs are unchanged. |
| Login page | Session checks time out, and the sign-in form always appears. |
| `scripts/migrate-evidence-to-r2.mjs` | Inventories, copies, flips and purges evidence, with explicit confirmation. |
| `supabase/migrations/20261113_free_tier_housekeeping.sql` | Adds two manual prune functions. Applying it deletes nothing. |
| `.github/workflows/db-backup.yml` | Takes a nightly encrypted backup to a private R2 bucket. |

## Configuration names

Never commit these values or paste them into logs.

**GitHub Actions secrets**

| Secret | Used by |
| --- | --- |
| `APP_URL` | Scheduled jobs. Use the final production URL, because redirects are not followed. |
| `INTERNAL_MONITORING_SECRET` | Scheduled jobs. Must match the value set in Vercel. |
| `SUPABASE_DB_URL` | Backup. Use the **session pooler** string, because GitHub runners have no IPv6. |
| `BACKUP_PASSPHRASE` | Backup encryption. Store a copy in a password manager. Without it, backups cannot be restored. |
| `R2_ACCOUNT_ID` | Backup |
| `R2_BACKUP_BUCKET` | Backup. Must be a private bucket, separate from evidence. |
| `R2_BACKUP_ACCESS_KEY_ID` | Backup. Use a token scoped to the backup bucket only. |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Backup |

**`.env.local` for the migration script**

- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, optional `R2_ENDPOINT`
- Supabase S3: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, optional `SUPABASE_S3_REGION`, optional `SUPABASE_S3_BUCKET`
- Database (flip and purge): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Vercel:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME` must be set. `R2_ACCOUNT_ID` must be present **at build time**, because `next.config.ts` uses it to allow R2 images.

> **EU-jurisdiction R2 buckets:** the script supports `R2_ENDPOINT`, but the app's R2 provider and `next.config.ts` always use the default endpoint. If your bucket is EU-jurisdiction, the app needs a code change before any row is flipped.

## Order of operations

1. **Deploy.** Merge this work and deploy it. GitHub runs scheduled workflows only from the default branch (`master`), so the workflows will not run until they are there. Apply the housekeeping migration.
2. **Run both workflows once** from the Actions tab and confirm both are green.
3. **Test backup and restore.** Download a backup, decrypt it, and restore it into a local or throwaway Postgres:
   ```bash
   gpg --decrypt activationiq-<timestamp>.dump.gpg > restore.dump
   pg_restore --no-owner --no-privileges --schema=public --dbname=<local-test-database> restore.dump
   ```
   Check row counts on key tables. The `public` schema references `auth.users`, so restore `auth` as well on a plain Postgres instance. Delete `restore.dump` afterwards, because it contains customer data and password hashes.
4. **Inventory.**
   ```bash
   node scripts/migrate-evidence-to-r2.mjs inventory
   ```
   Review any size mismatches in `evidence-migration/size-mismatch.jsonl`. The script never overwrites them, so they need a manual decision.
5. **Pilot on one organisation with 50 files.** Keep the trailing slash on the prefix.
   ```bash
   CONFIRM=yes-copy-evidence-to-r2 node scripts/migrate-evidence-to-r2.mjs copy --prefix=<orgId>/ --limit=50 --execute
   CONFIRM=yes-flip-evidence-rows node scripts/migrate-evidence-to-r2.mjs flip --prefix=<orgId>/ --execute
   ```
   Open those photos in the admin UI before continuing.
6. **Confirm new uploads go to R2.** The most recent campaign's uploads already went to Cloudflare, so `default_storage_provider` may already be `r2`. Check the setting rather than assuming, and set it to `r2` if it is not. Then upload a test photo and confirm its row has `storage_provider = 'r2'`. **If the setting is still `supabase`, new photos keep filling Supabase.** Files already in R2 appear under "Only in R2" in the inventory, and the script leaves them untouched.
7. **Copy everything.**
   ```bash
   CONFIRM=yes-copy-evidence-to-r2 node scripts/migrate-evidence-to-r2.mjs copy --execute
   ```
   Re-run until it reports 0 failed.
8. **Flip the rows.**
   ```bash
   CONFIRM=yes-flip-evidence-rows node scripts/migrate-evidence-to-r2.mjs flip --execute
   ```
9. **Check one May photo and one July photo** in the admin UI.
10. **Wait a week.** The purge grace period counts from when a file was *copied*, not flipped, so the 168-hour default does not guarantee a week after the flip. Keep track of the flip date yourself.
11. **Purge.** Do a dry run, read every number, then run it for real.
    ```bash
    node scripts/migrate-evidence-to-r2.mjs purge
    CONFIRM=yes-purge-supabase-evidence node scripts/migrate-evidence-to-r2.mjs purge --execute
    ```
    Purge also removes copied objects that no database row references, such as the `archive/` originals from the 2026-06 recompression. Their only remaining copy is then in R2.
12. **Run the housekeeping functions** after reviewing the preview queries in the migration header.
    ```sql
    select public.prune_system_events();
    select public.prune_noop_migration_records();
    ```
13. **Run `VACUUM FULL` once** in a quiet period. It briefly locks the table.
    ```sql
    vacuum full public.system_events;
    ```

## Downgrade-ready checklist

- [ ] Supabase storage is under 0.5 GB.
- [ ] Database size is under about 350 MB.
- [ ] Two nightly backups have succeeded.
- [ ] A restore has been tested.
- [ ] The scheduled-jobs workflow is green.
- [ ] A test photo upload lands in R2.

## Known limitations

- **Alert coverage has gaps.** The alert rules look back 15 minutes, but checks now run every 30 minutes (and GitHub schedules can run late). A short spike between checks may not raise an alert.
- **Dry-run migrations still write rows.** If `commercial.storage.enabled` is not `true` and archived candidates exist, each hourly run records a job, up to 100 item rows and an audit row. Flipping those rows to R2 ends this. Watch database size until then.
- **GitHub can disable schedules.** In public repositories, scheduled workflows are disabled after 60 days without repository activity. Monitoring and backups would stop silently, so check the Actions tab regularly.
- **Backups exclude files.** The backup covers the `public` and `auth` schemas only. R2 evidence has no second copy unless you add one.
- **Free projects pause** after 7 days of inactivity. Confirm how Supabase currently defines activity rather than assuming the scheduled jobs prevent a pause.

## Keep unrelated projects separate

The Fair Use restriction applies to the whole Supabase **organisation**. Keep unrelated projects in a separate Supabase organisation so that one project going over quota cannot take the others down.

## Vercel plan (decision open)

Vercel's Hobby plan is for non-commercial use. ActivationIQ is a paid product, so running it permanently on Hobby is a terms risk even if its usage fits the limits. Check Vercel's current terms and decide which plan is appropriate. This work reduces usage but does not resolve that question.

Evidence retention policy is also still open and is not changed by this work.
