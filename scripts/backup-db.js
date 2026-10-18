// Back up the database: `node scripts/backup-db.js <reason>`. Runs before every
// schema push, and exits non-zero on failure so the push doesn't run unprotected.
const { backupDatabase } = require('../src/lib/db/backup.js')

backupDatabase(process.argv[2] || 'manual')
  .then(file => console.log(file ? `Backed up the database to ${file}` : 'No database to back up yet'))
  .catch(error => {
    console.error('Database backup failed, so the schema was not changed:', error)
    process.exit(1)
  })
