# Kubernetes Deployment Guide

## Overview

This directory contains Kubernetes manifests for deploying the Climate Risk Dashboard.

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Helm (optional, for chart deployment)
- cert-manager (for TLS)
- NGINX Ingress Controller

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 2. Create Secrets

```bash
# Copy and edit secrets
cp k8s/secrets.yaml.example k8s/secrets.yaml
vim k8s/secrets.yaml

# Apply secrets
kubectl apply -f k8s/secrets.yaml
```

### 3. Deploy Application

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or apply individually
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n production

# Check services
kubectl get svc -n production

# Check ingress
kubectl get ingress -n production

# Check logs
kubectl logs -f deployment/climate-dashboard -n production
```

## Manifests

### Deployment (`deployment.yaml`)
- **Replicas**: 3 (production)
- **Strategy**: Rolling update
- **Health checks**: Liveness and readiness probes
- **Resources**: CPU and memory limits
- **Anti-affinity**: Spread across nodes

### Service (`service.yaml`)
- **Type**: ClusterIP
- **Port**: 80 → 3000
- **Headless service**: For direct pod access

### Ingress (`ingress.yaml`)
- **Class**: NGINX
- **TLS**: Let's Encrypt certificates
- **SSL**: Forced redirect
- **Rate limiting**: 100 req/s

### ConfigMap (`configmap.yaml`)
- Environment variables
- Non-sensitive configuration
- Public environment settings

### Secrets (`secrets.yaml.example`)
- Database credentials
- Redis credentials
- API keys
- Sensitive configuration

### HPA (`hpa.yaml`)
- **Min replicas**: 3
- **Max replicas**: 10
- **CPU target**: 70%
- **Memory target**: 80%
- **Scale down**: Gradual (300s stabilization)
- **Scale up**: Aggressive (immediate)

## Management Commands

### Scaling

```bash
# Manual scaling
kubectl scale deployment climate-dashboard --replicas=5 -n production

# Check HPA status
kubectl get hpa -n production
kubectl describe hpa climate-dashboard-hpa -n production
```

### Updates

```bash
# Update image
kubectl set image deployment/climate-dashboard \
  climate-dashboard=climate-dashboard:v2 \
  -n production

# Rollout status
kubectl rollout status deployment/climate-dashboard -n production

# Rollback
kubectl rollout undo deployment/climate-dashboard -n production

# Rollout history
kubectl rollout history deployment/climate-dashboard -n production
```

### Debugging

```bash
# Get pod logs
kubectl logs -f <pod-name> -n production

# Execute into pod
kubectl exec -it <pod-name> -n production -- /bin/sh

# Port forward
kubectl port-forward deployment/climate-dashboard 3000:3000 -n production

# Events
kubectl get events -n production --sort-by='.lastTimestamp'

# Describe resources
kubectl describe pod <pod-name> -n production
kubectl describe deployment climate-dashboard -n production
```

### Monitoring

```bash
# Resource usage
kubectl top nodes
kubectl top pods -n production

# Watch pods
kubectl get pods -n production -w

# Check health
kubectl exec -it <pod-name> -n production -- curl localhost:3000/api/health
```

## Blue-Green Deployment

```bash
# Deploy green version
kubectl apply -f k8s/deployment-green.yaml

# Test green version
kubectl port-forward deployment/climate-dashboard-green 3001:3000 -n production

# Switch traffic
kubectl patch service climate-dashboard -n production \
  -p '{"spec":{"selector":{"version":"v2"}}}'

# Remove blue version after validation
kubectl delete deployment climate-dashboard-blue -n production
```

## Canary Deployment

```bash
# Deploy canary with 10% traffic
kubectl apply -f k8s/deployment-canary.yaml

# Monitor metrics
kubectl top pods -n production -l version=canary

# Gradually increase traffic in ingress annotations
# Promote to stable or rollback based on metrics
```

## Disaster Recovery

### Backup

```bash
# Backup all resources
kubectl get all -n production -o yaml > backup-production.yaml

# Backup secrets (encrypted)
kubectl get secrets -n production -o yaml > secrets-backup.yaml
```

### Restore

```bash
# Restore from backup
kubectl apply -f backup-production.yaml

# Restore specific resource
kubectl apply -f deployment.yaml
```

### Cluster Migration

```bash
# Export from old cluster
kubectl get deployment climate-dashboard -n production -o yaml \
  --export > deployment-export.yaml

# Import to new cluster
kubectl apply -f deployment-export.yaml
```

## Security Best Practices

1. **Use namespaces** for isolation
2. **Implement RBAC** for access control
3. **Use secrets** for sensitive data
4. **Enable Pod Security Policies**
5. **Network policies** for traffic control
6. **Image scanning** before deployment
7. **Regular security updates**

## Performance Optimization

- **Resource limits**: Prevent resource exhaustion
- **HPA**: Auto-scale based on load
- **Readiness probes**: Traffic only to healthy pods
- **Pod anti-affinity**: Distribute across nodes
- **Node affinity**: Schedule on appropriate nodes

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n production

# Common issues:
# - ImagePullBackOff: Check image name/registry
# - CrashLoopBackOff: Check logs
# - Pending: Check resources/node capacity
```

### Service Not Accessible

```bash
# Check service endpoints
kubectl get endpoints climate-dashboard -n production

# Test from within cluster
kubectl run -it --rm debug --image=alpine --restart=Never -- sh
wget -O- http://climate-dashboard.production.svc.cluster.local
```

### Ingress Not Working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check ingress  details
kubectl describe ingress climate-dashboard -n production

# Check certificate
kubectl describe certificate climate-dashboard-tls -n production
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Deploy to Kubernetes
  run: |
    kubectl set image deployment/climate-dashboard \
      climate-dashboard=${{ env.IMAGE_TAG }} \
      -n production
    kubectl rollout status deployment/climate-dashboard -n production
```

### ArgoCD

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Create application
argocd app create climate-dashboard \
  --repo https://github.com/your-org/climate-dashboard \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production
```

## Monitoring Integration

### Prometheus

```bash
# Add ServiceMonitor
kubectl apply -f k8s/monitoring/servicemonitor.yaml

# Check metrics
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
```

### Grafana Dashboards

- Pre-configured dashboards available
- Import dashboard ID: 315 (Kubernetes cluster monitoring)
- Custom dashboard for application metrics

## Cost Optimization

- Use **HPA** for automatic scaling
- Set appropriate **resource requests/limits**
- Use **spot instances** for non-critical workloads
- Implement **pod disruption budgets**
- Regular **resource usage audits**

## Support

For Kubernetes questions:
- Platform Team: platform@yourdomain.com
- Documentation: https://kubernetes.io/docs/
- Slack: #kubernetes-support
