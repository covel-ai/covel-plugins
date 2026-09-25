# Security and trust

**English** · [简体中文](SECURITY.zh-CN.md)

Directory metadata describes plugins; it does not grant runtime permissions. Maintainers review official sources, and fields inside a package cannot grant trust. Server-side JavaScript does not run in a process sandbox. Manifest network declarations constrain public APIs, not arbitrary JavaScript execution.

If you discover a potentially malicious plugin, contact the maintainers through the private reporting channel available on the repository's Security page. If private reporting is not enabled, open an issue containing only the plugin ID, repository link, and a summary without sensitive data. Do not publish keys, user data, or exploitable vulnerability details.

Maintainers may immediately mark an entry as `archived`, explain why, and remove its recommendation. Removing a directory entry does not automatically uninstall or revoke code that users have already installed. Users must disable or uninstall it and restart the backend themselves. Updates require users to review the source and confirm again; prior approval does not authorize silent updates.
