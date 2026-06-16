# Project Rules

Security Rules

- Never read, inspect, print, expose, summarize, or modify any `.env`, `.env.local`, `.env.production`, `.env.*` file.
- Never access or reveal API keys, tokens, secrets, passwords, service role keys, database credentials, or private certificates.
- Assume all environment variables are confidential.
- If environment variables are required for implementation, ask me for the variable name only and never request or display its value.
- Never run commands that output secrets.
- Never create logs containing secrets.
- Never use production credentials for testing.
- Prefer local mocks or staging environments.

Database Rules

- Never execute destructive SQL against production.
- Never run DELETE, DROP, TRUNCATE, or mass UPDATE statements without explicit approval.
- Treat production data as read-only unless specifically instructed.