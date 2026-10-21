pipeline {
    agent any
    triggers { pollSCM('H/2 * * * *') }
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
        stage('Minikube Deployment') {
            steps {
                sh '''
                    minikube status > /dev/null 2>&1 || minikube start --driver=docker --cpus=2 --memory=3000
                    kubectl config use-context minikube
                    set +x
                    kubectl create secret docker-registry ecr-secret \
                      --docker-server=${ECR_REGISTRY} --docker-username=AWS \
                      --docker-password="$(aws ecr get-login-password --region ${AWS_REGION})" \
                      --dry-run=client -o yaml | kubectl apply -f -
                    set -x
                    sed "s|image: .*|image: ${IMAGE}:${TAG}|" k8s/deployment.yaml | kubectl apply -f -
                    kubectl apply -f k8s/service.yaml
                '''
            }
        }
        stage('Verification') {
            steps {
                sh '''
                    kubectl rollout status deployment/flight-booking --timeout=180s
                    kubectl get pods -o wide
                    kubectl get deployment flight-booking
                    kubectl get svc flight-booking-service
                    echo "Image running in the cluster:"
                    kubectl get deployment flight-booking -o jsonpath='{.spec.template.spec.containers[0].image}'
                    echo
                    curl -fsS http://$(minikube ip):30080/ | grep -q "Skyline Air"
                    echo "App is reachable inside the server at http://$(minikube ip):30080"

                    # Kills old dead port-forwards and keeps port 30080 mapped on all host interfaces
                    pkill -f "kubectl port-forward" || true
                    nohup bash -c 'while true; do kubectl port-forward --address 0.0.0.0 service/flight-booking-service 30080:80; sleep 2; done' > /dev/null 2>&1 &
                '''
            }
        }
    }
    post {
        always  { sh 'docker rm -f flight-test || true' }
        success { echo "Pipeline completed. Version ${TAG} deployed: ${IMAGE}:${TAG}" }
        failure { echo 'Pipeline failed!' }
    }
}
