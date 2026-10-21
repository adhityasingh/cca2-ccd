pipeline {
    agent any
    environment {
        AWS_REGION   = 'ap-south-1'
        ECR_REGISTRY = '257526643717.dkr.ecr.ap-south-1.amazonaws.com'
        ECR_REPO     = 'flight-booking'
        IMAGE        = "${ECR_REGISTRY}/${ECR_REPO}"
        TAG          = "${BUILD_NUMBER}"
    }
    stages {
        stage('Jenkins Checkout') { steps { checkout scm } }
        stage('Build and Test') {
            steps {
                sh 'test -f index.html'
                sh 'docker run --rm -v "$WORKSPACE":/app -w /app node:20-alpine node tests/test.js'
            }
        }
        stage('Docker Build') {
            steps { sh 'docker build -t ${IMAGE}:${TAG} -t ${IMAGE}:latest .' }
        }
        stage('Container Test') {
            steps {
                sh '''
                    docker rm -f flight-test || true
                    docker run -d --name flight-test -p 8081:80 ${IMAGE}:${TAG}
                    sleep 3
                    curl -fsS http://localhost:8081/ | grep -q "Skyline Air"
                '''
            }
        }
        stage('Push Image') {
            steps {
                sh '''
                    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    docker push ${IMAGE}:${TAG}
                    docker push ${IMAGE}:latest
                '''
            }
        }
    }
    post {
        always  { sh 'docker rm -f flight-test || true' }
        success { echo "Pipeline completed. Image pushed: ${IMAGE}:${TAG}" }
        failure { echo 'Pipeline failed!' }
    }
}
