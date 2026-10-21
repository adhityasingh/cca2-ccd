# Skyline Air: CI/CD Pipeline with Jenkins, Docker, AWS ECR and Minikube (CCA 2)

## 1. Project chosen
Skyline Air is a single-file static flight-booking website (`index.html`): users search flights, book seats and cancel bookings. Bookings are kept in the browser's localStorage, so there is no backend or database. It is an existing project, approved by my teacher; this assignment builds the automated delivery pipeline around it.

## 2. Repository contents
- `index.html` - the application
- `tests/test.js` - automated tests run in the Build and Test stage
- `Dockerfile` - nginx:alpine image that serves index.html
- `Jenkinsfile` - declarative Jenkins pipeline
- `k8s/deployment.yaml`, `k8s/service.yaml` - Kubernetes Deployment and Service

## 3. Pipeline stages
| # | Stage | What it does |
|---|-------|--------------|
| 1 | Source Code | The code lives in this GitHub repository (branch main). |
| 2 | Jenkins Checkout | Jenkins pulls the latest commit using a GitHub token stored in Jenkins credentials. |
| 3 | Build and Test | Runs tests/test.js in a node:20-alpine container: page structure, JavaScript syntax, and a simulated search, book, seat-count and cancel flow. The pipeline stops if a check fails. |
| 4 | Docker Build | Builds the image from the Dockerfile, tagged with the Jenkins build number and `latest`. A Container Test then runs the container and checks that it serves the page. |
| 5 | Push Image | Logs in to Amazon ECR and pushes both tags. |
| 6 | Minikube Deployment | Recreates the ECR pull secret, sets the new image tag in the Deployment, and applies the Deployment and Service. |
| 7 | Verification | Waits for the rollout, lists pods, deployment and service, prints the running image, and checks that the app responds. |

The pipeline starts automatically: the Jenkinsfile polls GitHub about every 2 minutes (`pollSCM`) and runs on every new commit.

## 4. How Jenkins was set up on AWS
- Region ap-south-1 (Mumbai). EC2 instance `jenkins-server`: Amazon Linux 2023, m7i-flex.large (2 vCPU, 8 GiB), 30 GiB disk.
- Security group opens ports 22 (SSH), 8080 (Jenkins) and 30080 (the app).
- Installed on the server: Java 21, Git, Docker, Jenkins LTS (systemd service), kubectl and Minikube. The `jenkins` user is in the docker group.
- Jenkins has the suggested plugins, an admin account, and a credential `github-credentials` (fine-grained GitHub token with read-only access to this repo).
- The pipeline job `ccd-pipeline` uses "Pipeline script from SCM" and reads the Jenkinsfile from this repository.

## 5. How the image was pushed
The image goes to a private Amazon ECR repository named `flight-booking`, tagged with the Jenkins build number (for example `5`) and `latest`. The EC2 server has an IAM role (`jenkins-ec2-ecr-role`, policy AmazonEC2ContainerRegistryPowerUser). The pipeline runs `aws ecr get-login-password` to get a temporary token, so no access keys or passwords are stored anywhere.

## 6. How it was deployed and accessed
- Minikube (Docker driver) runs on the same EC2 server as the `jenkins` user.
- `k8s/deployment.yaml` runs 2 replicas that pull the image from ECR using the secret `ecr-secret`. ECR tokens last 12 hours, so the pipeline recreates the secret on every run. The pipeline also replaces the image tag with the current build number.
- `k8s/service.yaml` is a NodePort Service on port 30080.
- Minikube's IP is internal to the server, so a small `socat` forwarder maps server port 30080 to the Service. The app opens at `http://<EC2-public-IP>:30080`.
- Verification: `kubectl get pods,deploy,svc` and a curl check run in the Verification stage.

## 7. What I changed for the second run
I changed the tagline in `index.html` from "Book a seat in under a minute." to "Version 2 - CI/CD Pipeline" and committed it to main. Jenkins detected the commit automatically ("Started by an SCM change"), built a new image with the next build number, pushed it to ECR, and rolled it out on Minikube. The browser then showed the new tagline, and `kubectl` showed the new image tag.
