#!/bin/bash
# Secret validation script for CI/CD pipeline

set -e

echo "🔒 Validating secrets configuration..."

# Function to check if a variable is set
check_secret() {
    local secret_name=$1
    local required=$2
    
    if [ -z "${!secret_name}" ]; then
        if [ "$required" = "true" ]; then
            echo "❌ CRITICAL: Missing required secret: $secret_name"
            return 1
        else
            echo "⚠️  WARNING: Optional secret not set: $secret_name"
            return 0
        fi
    else
        echo "✅ $secret_name is configured"
        return 0
    fi
}

# Critical secrets (required)
CRITICAL_SECRETS=(
    "VERCEL_TOKEN"
    "VERCEL_ORG_ID"
    "VERCEL_PROJECT_ID"
)

# Optional secrets
OPTIONAL_SECRETS=(
    "CODECOV_TOKEN"
    "SENTRY_AUTH_TOKEN"
    "SLACK_WEBHOOK_URL"
)

echo ""
echo "Checking critical secrets..."
exit_code=0
for secret in "${CRITICAL_SECRETS[@]}"; do
    if ! check_secret "$secret" "true"; then
        exit_code=1
    fi
done

echo ""
echo "Checking optional secrets..."
for secret in "${OPTIONAL_SECRETS[@]}"; do
    check_secret "$secret" "false"
done

echo ""
if [ $exit_code -eq 0 ]; then
    echo "✅ Secret validation passed"
else
    echo "❌ Secret validation failed - missing critical secrets"
fi

exit $exit_code
