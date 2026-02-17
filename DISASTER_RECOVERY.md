# Disaster Recovery Plan

## Executive Summary

This document outlines the disaster recovery (DR) strategy for the Climate Risk Dashboard. The plan ensures business continuity and data protection in the event of system failures, security incidents, or natural disasters.

## Recovery Objectives

### Recovery Time Objective (RTO)
- **Critical Services**: 1 hour
- **Standard Services**: 4 hours
- **Non-critical Services**: 24 hours

### Recovery Point Objective (RPO)
- **Database**: 15 minutes (continuous replication)
- **User Data**: 1 hour (incremental backups)
- **Configuration**: Real-time (version controlled)

## Risk Assessment

### Critical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| Data center outage | Low | High | Multi-region deployment |
| Database failure | Medium | High | Automated backups, replication |
| Security breach | Medium | High | Security monitoring, incident response |
| Application failure | Medium | Medium | High availability, auto-scaling |
| Human error | High | Medium | Access controls, audit logs |
| Natural disaster | Low | High | Geographic redundancy |

## Backup Strategy

### Database Backups

#### Automated Backups
```bash
# RDS Automated Backups
- Frequency: Daily
- Retention: 30 days (production), 7 days (staging)
- Backup window: 03:00-04:00 UTC
- Point-in-time recovery: Last 5 minutes

# Manual Snapshots
- Before major changes
- Before deployments
- Monthly archival snapshots (retained 1 year)
```

#### Backup Verification
```bash
# Test restore weekly
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier test-restore \
  --db-snapshot-identifier snapshot-id \
  --db-instance-class db.t3.micro

# Verify data integrity
psql -h test-restore.xxx.rds.amazonaws.com -U postgres -d climate_risk -c "SELECT COUNT(*) FROM buildings;"

# Cleanup
aws rds delete-db-instance --db-instance-identifier test-restore --skip-final-snapshot
```

### Application Backups

#### Code Repository
- **Primary**: GitHub (main repository)
- **Mirror**: GitLab (hourly sync)
- **Local**: Development machines

#### Configuration
- **Infrastructure**: Terraform state in S3 (versioned)
- **Kubernetes**: Manifests in git
- **Secrets**: AWS Secrets Manager + encrypted backups

#### Static Assets
- **S3**: Versioning enabled
- **Replication**: Cross-region replication to us-west-2
- **Lifecycle**: Transition to Glacier after 90 days

### Cache Backups

#### Redis
```bash
# Automated snapshots
- Frequency: Every 6 hours
- Retention: 5 snapshots
- Manual snapshots before changes
```

## Disaster Scenarios

### Scenario 1: Database Failure

**Detection**:
- Health checks failing
- Connection errors
- Monitoring alerts

**Response**:
1. **Immediate** (0-5 minutes)
   ```bash
   # Verify failure
   aws rds describe-db-instances --db-instance-identifier climate-dashboard-prod
   
   # Check CloudWatch metrics
   aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name CPUUtilization
   ```

2. **Switch to Read Replica** (5-10 minutes)
   ```bash
   # Promote read replica to master
   aws rds promote-read-replica --db-instance-identifier climate-dashboard-replica
   
   # Update application config
   kubectl set env deployment/climate-dashboard \
     DATABASE_URL=postgresql://new-master-endpoint -n production
   ```

3. **Restore from Backup** (10-30 minutes)
   ```bash
   # If replica promotion fails, restore from snapshot
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier climate-dashboard-restored \
     --db-snapshot-identifier latest-snapshot
   
   # Wait for restore
   aws rds wait db-instance-available --db-instance-identifier climate-dashboard-restored
   ```

4. **Verification** (30-45 minutes)
   ```bash
   # Test connection
   psql -h restored-endpoint -U postgres -c "SELECT version();"
   
   # Verify data integrity
   psql -h restored-endpoint -U postgres -d climate_risk -c "SELECT COUNT(*) FROM critical_table;"
   
   # Run smoke tests
   npm run test:smoke
   ```

5. **Recovery Complete** (45-60 minutes)
   - Update DNS/load balancer
   - Monitor application
   - Document incident

**Estimated RTO**: 1 hour
**Estimated RPO**: 15 minutes

### Scenario 2: Application Failure

**Detection**:
- 5xx errors spike
- Health checks failing
- User reports

**Response**:
1. **Immediate Rollback** (0-5 minutes)
   ```bash
   # Kubernetes rollback
   kubectl rollout undo deployment/climate-dashboard -n production
   
   # Or Vercel rollback
   vercel rollback [previous-deployment-url]
   ```

2. **Scale Up Resources** (5-10 minutes)
   ```bash
   # Manual scaling if HPA not responding
   kubectl scale deployment climate-dashboard --replicas=10 -n production
   ```

3. **Investigate Root Cause** (10-30 minutes)
   ```bash
   # Check logs
   kubectl logs -f deployment/climate-dashboard -n production --tail=1000
   
   # Check Sentry
   # Review error aggregation and traces
   ```

4. **Deploy Fix** (30-60 minutes)
   ```bash
   # Deploy hotfix
   git checkout -b hotfix/critical-fix
   # Make fixes
   git commit -m "fix: critical issue"
   # Deploy through CI/CD or emergency deploy
   ```

**Estimated RTO**: 30 minutes (rollback) to 2 hours (fix)

### Scenario 3: Security Breach

**Detection**:
- Security alerts
- Unusual access patterns
- User reports

**Response**:
1. **Containment** (0-15 minutes)
   ```bash
   # Isolate affected systems
   kubectl scale deployment climate-dashboard --replicas=0 -n production
   
   # Revoke compromised credentials
   aws iam delete-access-key --access-key-id COMPROMISED_KEY
   
   # Update security groups
   aws ec2 revoke-security-group-ingress --group-id sg-xxx --ip-permissions ...
   ```

2. **Assessment** (15-60 minutes)
   - Review access logs
   - Identify attack vector
   - Assess data exposure
   - Document findings

3. **Eradication** (1-4 hours)
   ```bash
   # Rotate all secrets
   ./scripts/rotate-secrets.sh
   
   # Deploy patched version
   git deploy security-patch
   
   # Update WAF rules
   aws wafv2 update-web-acl ...
   ```

4. **Recovery** (4-8 hours)
   ```bash
   # Restore from clean backup
   # Reboot systems from known-good images
   # Enable systems gradually
   kubectl scale deployment climate-dashboard --replicas=3 -n production
   ```

5. **Post-Incident** (8-24 hours)
   - Forensic analysis
   - Incident report
   - User notification (if required)
   - Security improvements

**Estimated RTO**: 4-8 hours

### Scenario 4: Complete Data Center Outage

**Detection**:
- All services down
- AWS status page
- Monitoring alerts

**Response**:
1. **Activate DR Site** (0-15 minutes)
   ```bash
   # Failover to secondary region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z123456 \
     --change-batch file://failover-config.json
   ```

2. **Verify DR Systems** (15-30 minutes)
   ```bash
   # Check database replica in DR region
   psql -h dr-database-endpoint -U postgres
   
   # Verify application deployment
   kubectl get pods -n production --context=dr-cluster
   ```

3. **Scale DR Resources** (30-60 minutes)
   ```bash
   # Scale up to production capacity
   kubectl scale deployment climate-dashboard --replicas=5 \
     --context=dr-cluster -n production
   ```

4. **Update DNS** (60-90 minutes)
   - Change DNS to point to DR site
   - Update CDN configuration
   - Verify traffic routing

5. **Monitor and Optimize** (90-120 minutes)
   - Monitor performance
   - Adjust resources as needed
   - Communicate status to users

**Estimated RTO**: 2 hours

## Recovery Procedures

### Database Recovery

#### Point-in-Time Recovery
```bash
# Restore to specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier climate-dashboard-prod \
  --target-db-instance-identifier climate-dashboard-recovered \
  --restore-time 2026-02-14T10:00:00Z
```

#### Manual Recovery
```bash
# Download backup
aws s3 cp s3://backups/database/latest.dump /tmp/

# Restore
pg_restore -h database-endpoint -U postgres -d climate_risk /tmp/latest.dump

# Verify
psql -h database-endpoint -U postgres -d climate_risk -c "\dt"
```

### Application Recovery

#### From Git
```bash
# Clone repository
git clone https://github.com/your-org/climate-dashboard
cd climate-dashboard

# Checkout specific version
git checkout tags/v1.0.0

# Deploy
kubectl apply -f k8s/
```

#### From Container Registry
```bash
# Pull specific image
docker pull climate-dashboard:v1.0.0

# Deploy
kubectl set image deployment/climate-dashboard \
  climate-dashboard=climate-dashboard:v1.0.0 -n production
```

### Infrastructure Recovery

#### Terraform
```bash
# Clone infrastructure repo
git clone https://github.com/your-org/climate-infrastructure

# Initialize
cd terraform
terraform init

# Apply
terraform apply -var-file="production.tfvars"
```

#### Kubernetes
```bash
# Restore cluster from backup
# (If using managed Kubernetes, create new cluster)

# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/
```

## Testing and Validation

### DR Drills

**Quarterly Full DR Test**
- Complete failover to DR site
- All systems tested
- Full team participation
- Duration: 4 hours
- Report required

**Monthly Backup Recovery Test**
- Restore database from backup
- Verify data integrity
- Duration: 1 hour

**Weekly Automated Tests**
- Backup verification
- Health check validation
- Monitoring alert tests

### Test Checklist

- [ ] Database backup and restore
- [ ] Application deployment from scratch
- [ ] DNS failover
- [ ] Load balancer reconfiguration
- [ ] Secrets recovery
- [ ] Monitoring and alerting
- [ ] Team communication
- [ ] Documentation accuracy
- [ ] RTO/RPO verification
- [ ] Post-recovery validation

## Communication Plan

### Incident Communication

**Internal**:
1. **Incident Commander**: Declares incident level
2. **Status Page**: Updated every 15 minutes
3. **Slack**: #incidents channel
4. **Email**: stakeholders@yourdomain.com
5. **Phone**: On-call rotation

**External**:
1. **Status Page**: https://status.yourdomain.com
2. **Twitter**: @climatedashboard
3. **Email**: For registered users (if critical)

### Templates

#### Internal Alert
```
INCIDENT: P0 - Database Outage
Time: 2026-02-14 10:00 UTC
Status: Investigating
Impact: Application unavailable
ETA: TBD
Commander: @engineer-name
War Room: Zoom link
```

#### External Update
```
We're currently experiencing technical difficulties with our service.
Our team is actively working on a resolution.
Status updates: https://status.yourdomain.com
ETA: We'll provide updates every 30 minutes.
```

## Roles and Responsibilities

### Incident Commander
- Declares incident
- Coordinates response
- Communicates with stakeholders
- Makes final decisions

### Technical Lead
- Diagnoses issues
- Implements recovery
- Coordinates technical team
- Reviews changes

### Communications Lead
- Updates status page
- Communicates with users
- Coordinates with PR team
- Documents timeline

### On-Call Engineer
- First responder
- Initial assessment
- Escalates if needed
- Implements recovery steps

## Contact Information

### Escalation Path

**Level 1**: On-call engineer (PagerDuty)
**Level 2**: Engineering manager
**Level 3**: CTO
**Level 4**: CEO

### Emergency Contacts

```yaml
on_call:
  - primary: +1-xxx-xxx-xxxx
  - secondary: +1-xxx-xxx-xxxx

management:
  - eng_manager: manager@yourdomain.com
  - cto: cto@yourdomain.com

vendors:
  - aws_support: 1-800-xxx-xxxx (Enterprise)
  - vercel_support: support@vercel.com
  - database_dba: dba@vendor.com
```

## Post-Incident Review

### Timeline
- Within 48 hours of resolution
- All stakeholders invited
- Action items assigned
- Report published (internal)

### Template
```markdown
# Post-Incident Review - [Date]

## Summary
Brief description of incident

## Impact
- Duration: X hours
- Users affected: Y
- Revenue impact: $Z

## Timeline
- HH:MM - Event occurred
- HH:MM - Detected
- HH:MM - Response initiated
- HH:MM - Resolved

## Root Cause
Technical explanation

## What Went Well
- Response time
- Communication
- Recovery

## What Can Improve
- Detection
- Process
- Documentation

## Action Items
1. [Action] - [Owner] - [Due Date]
2. [Action] - [Owner] - [Due Date]
```

## Compliance and Auditing

### Documentation
- Maintain incident log
- Record all DR tests
- Track RTO/RPO metrics
- Annual DR plan review

### Compliance
- SOC 2 requirements
- GDPR data protection
- Industry standards
- Internal policies

## Continuous Improvement

### Metrics to Track
- Mean Time to Detect (MTTD)
- Mean Time to Respond (MTTR)
- Mean Time to Recovery (MTTR)
- Backup success rate
- DR test success rate

### Review Schedule
- **Weekly**: Incident review
- **Monthly**: DR metrics review
- **Quarterly**: Full DR test
- **Annually**: Complete plan review

## Appendix

### A. Runbooks
- Database failover runbook
- Application rollback runbook
- Security incident runbook
- Infrastructure recovery runbook

### B. Scripts
- `/scripts/backup-verify.sh`
- `/scripts/failover-database.sh`
- `/scripts/rotate-secrets.sh`
- `/scripts/emergency-deploy.sh`

### C. Configuration
- `/terraform/` - Infrastructure as code
- `/k8s/` - Kubernetes manifests
- `.github/workflows/` - CI/CD pipelines

### D. Resources
- AWS Console: https://console.aws.amazon.com
- Vercel Dashboard: https://vercel.com/dashboard
- Kubernetes Dashboard: https://k8s.yourdomain.com
- Monitoring: https://monitoring.yourdomain.com
- Status Page: https://status.yourdomain.com

## Document Control

- **Version**: 1.0
- **Last Updated**: 2026-02-14
- **Next Review**: 2026-05-14
- **Owner**: Infrastructure Team
- **Approved By**: CTO

---

**This is a living document. Please update after any incident or DR test.**
