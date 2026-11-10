# Terraform Infrastructure as Code

This directory contains Terraform configuration for provisioning infrastructure.

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured
- Vercel CLI configured (for deployments)

## Structure

```
terraform/
├── main.tf              # Main infrastructure configuration
├── variables.tf         # Variable definitions
├── terraform.tfvars     # Variable values (gitignored)
├── terraform.tfvars.example  # Example configuration
└── README.md           # This file
```

## Setup

### 1. Initialize Terraform

```bash
cd terraform
terraform init
```

### 2. Configure Variables

```bash
# Copy example and edit
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

### 3. Plan Infrastructure

```bash
terraform plan
```

### 4. Apply Configuration

```bash
terraform apply
```

## Environments

### Production

```bash
terraform workspace new production
terraform workspace select production
terraform apply -var-file="production.tfvars"
```

### Staging

```bash
terraform workspace new staging
terraform workspace select staging
terraform apply -var-file="staging.tfvars"
```

## Resources Created

- **VPC**: Isolated network environment
- **RDS PostgreSQL**: Managed database with PostGIS
- **ElastiCache Redis**: Managed Redis cache
- **S3 Buckets**: Asset storage
- **CloudWatch**: Logging and monitoring
- **SNS**: Alert notifications
- **Security Groups**: Network security rules

## State Management

Terraform state is stored in S3 with DynamoDB locking:

```hcl
backend "s3" {
  bucket         = "climate-dashboard-terraform-state"
  key            = "prod/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "terraform-state-lock"
}
```

### Create State Backend

```bash
# S3 bucket for state
aws s3 mb s3://climate-dashboard-terraform-state

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket climate-dashboard-terraform-state \
  --versioning-configuration Status=Enabled

# DynamoDB table for locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Common Commands

```bash
# Format code
terraform fmt

# Validate configuration
terraform validate

# Show planned changes
terraform plan

# Apply changes
terraform apply

# Destroy infrastructure
terraform destroy

# Show outputs
terraform output

# Import existing resource
terraform import aws_db_instance.postgres db-instance-id
```

## Security Best Practices

1. **Never commit** `terraform.tfvars` or `.tfstate` files
2. **Use** workspace separation for environments
3. **Enable** state encryption and locking
4. **Rotate** access keys regularly
5. **Review** plans before applying
6. **Use** least-privilege IAM policies
7. **Enable** resource tagging

## Troubleshooting

### State Lock Error

```bash
# Remove stale lock
terraform force-unlock <lock-id>
```

### Import Existing Resources

```bash
# Import database
terraform import aws_db_instance.postgres climate-dashboard-prod

# Import VPC
terraform import aws_vpc.main vpc-xxxxx
```

### Dependency Issues

```bash
# Refresh state
terraform refresh

# Target specific resource
terraform apply -target=aws_db_instance.postgres
```

## Cost Optimization

- Use `t3.micro` instances for non-production
- Enable auto-scaling where possible
- Use spot instances for non-critical workloads
- Set up budget alerts
- Regular review of unused resources

## Monitoring

- CloudWatch dashboards created automatically
- Alarms for high CPU and memory usage
- SNS notifications to configured email
- Integration with Grafana/Prometheus possible

## Backup Strategy

- RDS automated backups enabled
- S3 bucket versioning enabled
- Terraform state versioned in S3
- Point-in-time recovery available

## Compliance

- Encryption at rest enabled
- VPC isolation configured
- Security groups restrict access
- CloudWatch logging enabled
- IAM roles follow least privilege

## Support

For infrastructure questions:
- DevOps Team: devops@yourdomain.com
- Documentation: https://terraform.io/docs
