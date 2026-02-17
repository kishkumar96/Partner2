# CI/CD Quick Start Guide

## 🚀 Getting Started with New CI/CD

This guide helps you get started with the enhanced CI/CD pipeline.

## For Developers

### 1. Install Git Hooks

```bash
npm install
npx husky install
```

The hooks will now run automatically:
- **pre-commit**: Type check, lint, format check, tests
- **pre-push**: Full test suite with coverage, build verification
- **commit-msg**: Validates commit message format

### 2. Commit Message Format

Use conventional commits:
```bash
# Format: type(scope): subject

git commit -m "feat(map): add new layer toggle"
git commit -m "fix(dashboard): resolve data loading issue"
git commit -m "docs(readme): update installation steps"
```

**Valid types**: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert

### 3. Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

**Coverage requirement**: 80% for all metrics

### 4. Working with Environments

```bash
# Development (default)
npm run dev

# Staging
cp .env.staging .env.local
npm run dev

# Production build
npm run build
```

### 5. Creating Pull Requests

1. Create feature branch from `develop`
2. Make changes and commit (hooks will validate)
3. Push to GitHub (tests run automatically)
4. Open PR to `develop`
5. Preview deployment will be created automatically
6. Wait for CI checks to pass
7. Get code review
8. Merge when approved

**Auto-created on PR:**
- ✅ Preview deployment URL
- ✅ Lighthouse report
- ✅ Test results
- ✅ Coverage report

## For DevOps

### 1. Set Up GitHub Secrets

```bash
# Required secrets
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
gh secret set CODECOV_TOKEN

# Optional
gh secret set SENTRY_AUTH_TOKEN
gh secret set SLACK_WEBHOOK_URL
```

### 2. Initialize Terraform

```bash
cd terraform

# Create state backend first
aws s3 mb s3://climate-dashboard-terraform-state
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply
```

### 3. Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Set up secrets
cp k8s/secrets.yaml.example k8s/secrets.yaml
# Edit secrets.yaml with real values
kubectl apply -f k8s/secrets.yaml

# Deploy application
kubectl apply -f k8s/

# Verify
kubectl get pods -n production
```

### 4. Set Up Monitoring

```bash
# Verify health endpoint
curl https://yourdomain.com/api/health

# Check metrics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://yourdomain.com/api/metrics

# Configure alerts (see MONITORING.md)
```

### 5. Test Disaster Recovery

```bash
# Run weekly backup test
./scripts/test-backup-restore.sh

# Run quarterly DR drill
# See DISASTER_RECOVERY.md for procedures
```

## Branch Strategy

```
main (production)
  ↑
develop (staging)
  ↑
feature/* (preview deployments)
```

- **feature/*** → develop: Creates preview deployment
- **develop**: Auto-deploys to staging
- **main**: Auto-deploys to production (with approval)

## CI/CD Pipeline Overview

### On Pull Request
1. ✅ Code quality checks (lint, type check, format)
2. ✅ Run tests (unit, integration)
3. ✅ Security scanning (CodeQL, Trivy, secrets)
4. ✅ Build verification
5. ✅ Deploy preview environment
6. ✅ Run Lighthouse audit
7. ✅ Comment results on PR

### On Push to Develop
1. ✅ All PR checks
2. ✅ Build for staging
3. ✅ Deploy to staging
4. ✅ Run smoke tests
5. ✅ Notify team

### On Push to Main
1. ✅ All staging checks
2. ✅ Build for production
3. ✅ Deploy to production
4. ✅ Run verification tests
5. ✅ Monitor health for 5 minutes
6. ✅ Create release tag
7. ✅ Notify team

## Quick Commands

```bash
# Development
npm run dev                    # Start dev server
npm test                       # Run tests
npm run lint                   # Lint code
npm run type-check            # Type check
npm run build                 # Build production

# Docker
docker-compose up -d          # Start local services
docker-compose down           # Stop services
npm run docker:logs           # View logs

# Staging
docker-compose -f docker-compose.staging.yml up -d

# Git
git commit -m "type(scope): message"  # Commit with validation
git push                              # Triggers CI/CD

# Kubernetes
kubectl get pods -n production        # Check pods
kubectl logs -f deployment/climate-dashboard -n production
kubectl describe pod <pod-name> -n production

# Terraform
cd terraform
terraform plan                        # Preview changes
terraform apply                       # Apply changes
terraform destroy                     # Destroy infrastructure
```

## Troubleshooting

### Pre-commit Hooks Failing

```bash
# Fix formatting
npm run format

# Fix linting
npm run lint:fix

# Skip hooks (emergency only)
git commit --no-verify
```

### CI Failing

1. Check GitHub Actions logs
2. Run same commands locally
3. Fix issues
4. Push again

### Deployment Failing

1. Check deployment logs in Vercel/Kubernetes
2. Verify environment variables
3. Check health endpoint
4. Review recent changes
5. Rollback if needed

### Tests Failing

```bash
# Run specific test
npm test -- MapView.test.tsx

# Update snapshots
npm test -- -u

# Debug
npm test -- --verbose
```

## Getting Help

- **CI/CD Issues**: Check [CI_CD_IMPROVEMENTS.md](CI_CD_IMPROVEMENTS.md)
- **Secrets**: See [SECRETS_MANAGEMENT.md](SECRETS_MANAGEMENT.md)
- **Monitoring**: See [MONITORING.md](MONITORING.md)
- **Performance**: See [PERFORMANCE.md](PERFORMANCE.md)
- **Disaster Recovery**: See [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)
- **Infrastructure**: See [terraform/README.md](terraform/README.md)
- **Kubernetes**: See [k8s/README.md](k8s/README.md)

## Important Files

| File | Purpose |
|------|---------|
| `.husky/` | Git hooks |
| `.github/workflows/` | CI/CD pipelines |
| `jest.config.js` | Test configuration |
| `.lighthouserc.json` | Performance budgets |
| `performance-budget.json` | Resource budgets |
| `terraform/` | Infrastructure as code |
| `k8s/` | Kubernetes manifests |
| `.env.example` | Environment template |

## Best Practices

✅ **DO:**
- Write tests for new code
- Follow commit message format
- Review PR previews before merging
- Monitor after deployments
- Update documentation
- Run local checks before pushing

❌ **DON'T:**
- Skip pre-commit hooks
- Commit directly to main
- Skip code review
- Ignore CI failures
- Commit secrets
- Deploy without testing

## Next Steps

1. ✅ Read this guide
2. ✅ Set up local environment
3. ✅ Configure git hooks
4. ✅ Make a test commit
5. ✅ Create a test PR
6. ✅ Review CI/CD pipeline
7. ✅ Deploy to staging
8. ✅ Monitor production

## Resources

- [Contributing Guide](CONTRIBUTING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Security Policy](SECURITY.md)
- [Performance Guide](PERFORMANCE.md)
- [Monitoring Guide](MONITORING.md)

---

**Welcome to world-class CI/CD! 🎉**
