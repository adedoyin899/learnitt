# Runbook: Backups & Disaster Recovery

**App:** Learnitt v0.1  
**Category:** Operational Maintenance  
**Cadence:** Weekly / Pre-migration  
**Script:** `scripts/backup.sh` / `scripts/backup.mjs`  
**Restore Script:** `scripts/restore.mjs`

---

## 1. Overview & Weekly Execution

Learnitt stores user study graphs, evidence grades, check-ins, journal entries, and private study materials. This runbook details how to run weekly database and storage bucket exports to a private destination.

### Running a Manual or Weekly Backup

```bash
# Run the automated bash backup (dumps DB + materials bucket + compresses tar.gz)
./scripts/backup.sh

# Or run the platform-independent Node backup runner:
node scripts/backup.mjs
```

Backups are timestamped and output to `./backups/learnitt-backup-YYYY-MM-DDTHH-MM-SS/`:
- `database.json`: All table rows exported with full column fidelity.
- `materials/`: Uploaded raw files (PDFs, Markdown, text).
- `manifest.json`: Verification manifest with table counts and checksums.
- `learnitt-backup-YYYY-MM-DD.tar.gz`: Encrypted or compressed bundle ready for off-site archiving (e.g. AWS S3 Glacier / Cloudflare R2 / cold storage).

---

## 2. Restoring into a Fresh Local Project

To restore a backup into a fresh development or staging database:

```bash
# Set target database URL or run against local Supabase / PGlite:
node scripts/restore.mjs ./backups/learnitt-backup-2026-10-19T...
```

The restore script inserts all records in topological dependency order (profiles -> goals -> skills -> prereqs -> materials -> chunks -> links -> plan items -> check-ins -> quizzes -> attempts -> grades -> journal -> reminders -> counters), ensuring zero foreign key constraint violations.

---

## 3. Supabase Free-Tier Pause Behavior & Keep-Alive

### The 7-Day Auto-Pause Mechanism
- Supabase Free Tier automatically pauses projects that receive no database or dashboard activity for **7 consecutive days**.
- When paused, the REST and GraphQL APIs return `503 Service Unavailable`, and waking the database can take **1 to 2 minutes**, causing perceived downtime for learners.

### Learnitt's Mitigation
1. **Automated Cron Keep-Alive:** The reminder cron (`POST /api/v1/cron/reminders`) and daily retention cron (`POST /api/v1/cron/retention`) query the database every weekday, ensuring regular database transactions that reset the 7-day inactivity timer.
2. **Weekly Keep-Alive Ping:** If an individual learner pauses studying for an extended break, a weekly health check ping from a free uptime monitor (e.g. UptimeRobot or GitHub Actions cron) hitting `/api/v1/today` keeps the database warm.

---

## 4. Decision Point to Upgrade to Supabase Pro

The project starts on Supabase Free Tier ($0/mo). Upgrade to **Supabase Pro Tier ($25/mo)** when any of the following triggers are met:

| Trigger Metric | Free Tier Limit | Pro Upgrade Trigger | Rationale |
|---|---|---|---|
| **Database Size** | 500 MB | **250 MB** (50% headroom) | Avoid read-only lockouts if large PDF chunk embeddings expand rapidly. |
| **Active Goals / Users** | 1 user | **> 10 concurrent active goals** | Higher connection pooling (pgbouncer) and dedicated CPU allocation. |
| **Storage Egress** | 2 GB / month | **1.5 GB / month** | Heavy PDF and material document downloads exceeding bandwidth limits. |
| **Automated Backups** | None (Manual only) | Production readiness | Pro tier includes 7-day point-in-time recovery (PITR) and daily automated snapshots. |
| **Zero Inactivity Pause**| Pauses after 7 days | Continuous production SLA | Pro tier projects are never paused due to inactivity. |
