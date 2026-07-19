# Security Policy

Artifacta hosts untrusted dashboard HTML and uploaded datasets. Please report vulnerabilities privately instead of opening a public issue.

## Reporting

Please use GitHub's private vulnerability-report form:

https://github.com/shl418/Artifacta/security/advisories/new

Include the affected route or package, impact, reproduction steps, and any suggested mitigation. Maintainers should acknowledge reports within 5 business days.

## Supported Versions

The `main` branch is the active development line until the first stable release. Security fixes land there first.

## Deployment Notes

- Set a strong `AUTH_SECRET` in every shared or production deployment.
- Keep previews sandboxed and consider serving preview traffic from a separate domain.
- Dataset-level URL/COS/Presto sync is not available. Dynamic updates run only through manually triggered bundle sync scripts; review those scripts before enabling them in a shared environment.
- Prefer `DATA_DRIVER=postgres` and `STORAGE_DRIVER=s3` for multi-instance deployments.
