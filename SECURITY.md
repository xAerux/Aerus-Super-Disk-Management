# Security

The local service binds to loopback. Sensitive application routes require a
per-launch session capability delivered as an HttpOnly, SameSite cookie by the
application page. Unexpected origins or missing capabilities are rejected.

Existing path, protected-root, recycle-bin, and startup safety checks remain in
place. No startup or registry mutation was performed during packaging tests.

Report security issues privately to the owner before public disclosure. Never
include credentials, personal paths, startup exports, or application-data
directories in an issue.
