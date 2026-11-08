# Operations

Runbooks for running BasaManager: what to type, in which order, and how to know it worked. They assume you have
never run Docker on a server. Start with [Docker & the VPS](/concepts/docker-and-vps) if the words are new.

| Runbook                                                      | Use it when                                         |
| ------------------------------------------------------------ | --------------------------------------------------- |
| [Deploy](/operations/deploy)                                 | shipping a version to staging or production         |
| [Roll back](/operations/rollback)                            | a release is bad and you want the previous one back |
| [Backup & restore drill](/operations/backup-and-restore)     | taking, checking or restoring a database backup     |
| [Rotate a secret](/operations/rotate-a-secret)               | a password or key leaked or is expiring             |
| [Incident playbook](/operations/incident-playbook)           | production is broken right now                      |
| [Reading logs & Sentry](/operations/reading-logs-and-sentry) | finding out what the app did                        |
