pipeline {
  agent {
    docker {
      // node:18 with Chromium system libs for Playwright; Playwright downloads
      // its own Chromium bundle, but system libs are required.
      image "mcr.microsoft.com/playwright:v1.50.1-jammy"
      args "-u root:root"
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
