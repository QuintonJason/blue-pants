// Back up the database: `node scripts/backup-db.js <reason>`. Runs before every
// migration, and exits non-zero on failure so the migration doesn't run unprotected.
// Same environment as the app, so TRANSCRIPT_* settings in .env.local apply here too.
require('@next/env').loadEnvConfig(process.cwd())
const { backupDatabase } = require('../src/lib/db/backup.js')

backupDatabase(process.argv[2] || 'manual')
  .then(file => console.log(file ? `Backed up the database to ${file}` : 'No database to back up yet'))
  .catch(error => {
    console.error('Database backup failed, so the database was not migrated:', error)
    process.exit(1)
  })
