# Secrets Management Guide

## Overview

This document outlines the secrets management strategy for the Climate Risk Dashboard application.

## Secrets Storage

### GitHub Actions Secrets

Required secrets for CI/CD:

```bash
# Vercel Deployment
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID=your-project-id

# Code Coverage
CODECOV_TOKEN=your-codecov-token

# Optional: Slack/Discord Notifications
SLACK_WEBHOOK_URL=your-webhook-url
DISCORD_WEBHOOK_URL=your-webhook-url

# Optional: Sentry
SENTRY_AUTH_TOKEN=your-sentry-token
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

### Setting Secrets in GitHub

```bash
# Via GitHub CLI
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID

# Via GitHub UI
# Go to: Repository → Settings → Secrets and variables → Actions
# Click "New repository secret"
```

### Environment-Specific Secrets

#### Production
- Stored in GitHub Secrets with `PROD_` prefix
- Managed through GitHub Environments (production)
- Requires manual approval for deployment

#### Staging
- Stored in GitHub Secrets with `STAGING_` prefix
- Managed through GitHub Environments (staging)
- No approval required

## Secret Rotation

### Rotation Schedule

- **API Keys**: Every 90 days
- **Database Credentials**: Every 90 days
- **Service Tokens**: Every 180 days
- **SSH Keys**: Every 365 days

### Rotation Process

```bash
# 1. Generate new secret
# 2. Update in secret manager
gh secret set SECRET_NAME < new-secret.txt

# 3. Test in staging
# 4. Deploy to production
# 5. Deactivate old secret after verification
```

## Local Development

### Using `.env` Files

```bash
# Never commit .env files
# Use .env.example as template

cp .env.example .env.local
# Edit .env.local with your local values
```

### Gitignore Configuration

```gitignore
# Environment files
.env
.env.local
.env.*.local
.env.production
.env.staging

# Secrets
secrets/
*.key
*.pem
*.p12
```

## Secret Scanning

### Automated Scanning

We use multiple tools to prevent secret leaks:

1. **TruffleHog** - Scans for secrets in commits
2. **GitHub Secret Scanning** - Native GitHub protection
3. **Pre-commit Hooks** - Local validation

### Manual Verification

```bash
# Check for potential secrets
git log -p | grep -E 'password|secret|key|token|api_key'

# Scan specific commit
git show <commit-hash> | grep -i secret
```

## Emergency Procedures

### If a Secret is Leaked

1. **Immediate Actions**
   ```bash
   # Rotate the compromised secret immediately
   # Revoke API tokens
   # Update all systems
   ```

2. **Investigation**
   - Review access logs
   - Check for unauthorized access
   - Document the incident

3. **Prevention**
   - Update secret scanning rules
   - Review security policies
   - Train team members

### Incident Response Checklist

- [ ] Identify leaked secret
- [ ] Revoke/rotate immediately
- [ ] Check for unauthorized usage
- [ ] Update in all environments
- [ ] Verify system integrity
- [ ] Document incident
- [ ] Review prevention measures

## Best Practices

### DO ✅

- Use environment variables for secrets
- Rotate secrets regularly
- Use different secrets per environment
- Enable secret scanning
- Use secret managers (GitHub Secrets, AWS Secrets Manager)
- Audit secret access regularly
- Use minimum required permissions

### DON'T ❌

- Commit secrets to git
- Share secrets via email/chat
- Use production secrets in development
- Hard-code secrets in source
- Log secrets in application
- Share secrets between unrelated projects
- Use weak/default secrets

## Secret Validation

### Pre-deployment Checks

```bash
#!/bin/bash
# verify-secrets.sh

required_secrets=(
  "VERCEL_TOKEN"
  "DATABASE_URL"
  "REDIS_URL"
)

for secret in "${required_secrets[@]}"; do
  if [ -z "${!secret}" ]; then
    echo "❌ Missing secret: $secret"
    exit 1
  fi
done

echo "✅ All required secrets present"
```

## Integration with Secret Managers

### AWS Secrets Manager

```bash
# Install AWS CLI
aws configure

# Store secret
aws secretsmanager create-secret \
  --name /climate-dashboard/production/database-url \
  --secret-string "postgresql://..."

# Retrieve secret
aws secretsmanager get-secret-value \
  --secret-id /climate-dashboard/production/database-url \
  --query SecretString \
  --output text
```

### HashiCorp Vault

```bash
# Write secret
vault kv put secret/climate-dashboard/database url="postgresql://..."

# Read secret
vault kv get -field=url secret/climate-dashboard/database
```

### Azure Key Vault

```bash
# Create secret
az keyvault secret set \
  --vault-name climate-dashboard-vault \
  --name database-url \
  --value "postgresql://..."

# Get secret
az keyvault secret show \
  --vault-name climate-dashboard-vault \
  --name database-url \
  --query value \
  --output tsv
```

## Monitoring & Auditing

### Secret Access Logs

- Enable audit logging for all secret access
- Set up alerts for unusual access patterns
- Review logs monthly

### Automated Alerts

```yaml
# Example alert configuration
alerts:
  - name: "Secret Access"
    condition: "secret_accessed AND user NOT IN approved_users"
    action: "notify_security_team"
  
  - name: "Failed Secret Access"
    condition: "failed_secret_access > 5 IN 1h"
    action: "block_and_notify"
```

## Compliance

### Requirements

- GDPR compliance for data handling
- SOC 2 Type II for security controls
- Regular security audits
- Encryption at rest and in transit

### Documentation

- Maintain secret inventory
- Document rotation procedures
- Keep audit trail
- Review access permissions quarterly

## Support

### Questions or Issues

- Security Team: security@yourdomain.com
- DevOps Team: devops@yourdomain.com
- Emergency Hotline: Available 24/7

### Resources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [OWASP Secrets Management](https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password)
- [12-Factor App - Config](https://12factor.net/config)
