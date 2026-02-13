pipeline {
  agent {
    docker {
      image "node:18"
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
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: "reports/junit/*.xml"
      // Archive coverage and optional reports if they exist.
      archiveArtifacts allowEmptyArchive: true, artifacts: "coverage/**"
      archiveArtifacts allowEmptyArchive: true, artifacts: "lighthouse-report.json"
      cleanWs()
    }
  }
}
