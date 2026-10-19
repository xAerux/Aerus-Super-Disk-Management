# Safe testing checklist

Use a disposable Windows account or test machine.

- Launch and close the application.
- Navigate each view.
- Confirm discovery is local to the tester.
- Inspect the startup list only; do not toggle entries during basic testing.
- Use cleanup preview only with disposable test files.
- Verify an unauthorized local HTTP request is rejected.
- Verify ordinary UI requests continue to reach the local service.
- Record Windows version, package hash, and exact reproduction steps.

Do not use private production folders, secrets, or important startup entries.
