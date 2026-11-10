pipeline {
  agent {
    docker {
      // node:18 with Chromium system libs for Playwright; Playwright downloads
      // its own Chromium bundle, but system libs are required.
      image "mcr.microsoft.com/playwright:v1.50.1-jammy"
      args "-u root:root -v /var/run/docker.sock:/var/run/docker.sock"
      reuseNode true
    }
  }

  options {
    timestamps()
    ansiColor("xterm")
  }

  environment {
    NODE_ENV = "production"
    // Keep npm cache inside workspace to enable reuse across builds on the same agent.
    NPM_CONFIG_CACHE = "${WORKSPACE}/.npm"
    IMAGE_REPOSITORY = "ghcr.io/kishkumar96/partner2-dashboard"
    K8S_NAMESPACE = "production"
    K8S_DEPLOYMENT = "climate-dashboard"
    K8S_CONTAINER = "climate-dashboard"
  }

  stages {
    stage("Checkout") {
      steps {
        checkout scm
      }
    }

    stage("Install") {
      steps {
        sh "npm ci"
      }
    }

    stage("Lint") {
      steps {
        sh "npm run lint"
      }
    }

    stage("Type Check") {
      steps {
        sh "npm run type-check"
      }
    }

    stage("Test") {
      steps {
        sh "npm test"
      }
    }

    stage("Build") {
      steps {
        sh "npm run build"
      }
    }

    stage("Package Image") {
      when {
        anyOf {
          branch "main"
          branch "Updates"
        }
      }
      steps {
        script {
          env.IMAGE_TAG = sh(script: "git rev-parse --short=12 HEAD", returnStdout: true).trim()
          env.IMAGE = "${env.IMAGE_REPOSITORY}:${env.IMAGE_TAG}"
          env.IMAGE_LATEST = "${env.IMAGE_REPOSITORY}:latest"
        }
        withCredentials([
          usernamePassword(
            credentialsId: "container-registry-credentials",
            usernameVariable: "REGISTRY_USERNAME",
            passwordVariable: "REGISTRY_PASSWORD"
          )
        ]) {
          sh '''
            set -eu
            REGISTRY_HOST="$(printf '%s' "$IMAGE_REPOSITORY" | cut -d/ -f1)"
            apt-get update
            apt-get install -y docker.io
            echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" -u "$REGISTRY_USERNAME" --password-stdin
            docker build -t "$IMAGE" -t "$IMAGE_LATEST" .
            docker push "$IMAGE"
            docker push "$IMAGE_LATEST"
          '''
        }
      }
    }

    stage("Performance") {
      steps {
        // Install Playwright's Chromium browser bundle (system libs provided by
        // the mcr.microsoft.com/playwright image above).
        sh "npx playwright install chromium"
        // Run the full perf suite in soft-gate mode.
        // Set HARD_GATE=true here to fail the build on budget violations.
        sh "npm run perf:ci"
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: "reports/lighthouse/**"
          archiveArtifacts allowEmptyArchive: true, artifacts: "reports/perf/**"
          // Publish Playwright HTML report if the plugin is available
          publishHTML(
            target: [
              reportDir: 'reports/perf/html',
              reportFiles: 'index.html',
              reportName: 'Playwright Perf Report',
              keepAll: true,
              alwaysLinkToLastBuild: true,
              allowMissing: true
            ]
          )
        }
      }
    }

    stage("Deploy") {
      when {
        anyOf {
          branch "main"
          branch "Updates"
        }
      }
      steps {
        withCredentials([
          file(credentialsId: "kubeconfig-production", variable: "KUBECONFIG")
        ]) {
          sh '''
            set -eu
            KUBECTL_VERSION="v1.31.7"
            curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
            chmod +x /usr/local/bin/kubectl
            kubectl version --client
            kubectl apply -f k8s/namespace.yaml
            kubectl apply -f k8s/configmap.yaml
            kubectl apply -f k8s/service.yaml
            kubectl apply -f k8s/ingress.yaml
            kubectl apply -f k8s/hpa.yaml
            kubectl apply -f k8s/deployment.yaml
            kubectl set image "deployment/${K8S_DEPLOYMENT}" "${K8S_CONTAINER}=${IMAGE}" -n "${K8S_NAMESPACE}"
            kubectl rollout status "deployment/${K8S_DEPLOYMENT}" -n "${K8S_NAMESPACE}" --timeout=5m
          '''
        }
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: "reports/junit/*.xml"
      // Archive coverage and optional reports if they exist.
      archiveArtifacts allowEmptyArchive: true, artifacts: "coverage/**"
      archiveArtifacts allowEmptyArchive: true, artifacts: "lighthouse-report.json"
      archiveArtifacts allowEmptyArchive: true, artifacts: "reports/lighthouse/**"
      archiveArtifacts allowEmptyArchive: true, artifacts: "reports/perf/**"
      cleanWs()
    }
  }
}
