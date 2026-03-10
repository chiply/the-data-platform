#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
NAMESPACE="smoke-test"
DEPLOY_NAME="smoke-hello"
SERVICE_NAME="smoke-hello"
INGRESS_NAME="smoke-hello"
INGRESS_HOST="smoke.localhost"
IMAGE="nginx:alpine"
PORT=80
MAX_WAIT_SECONDS=120
CURL_RETRIES=15
CURL_RETRY_DELAY=2

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[smoke-test]${NC} $*"; }
warn()  { echo -e "${YELLOW}[smoke-test]${NC} $*"; }
error() { echo -e "${RED}[smoke-test]${NC} $*" >&2; }

# --- Cleanup function ---
cleanup() {
  log "Cleaning up smoke test resources..."
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=false 2>/dev/null || true
  log "Cleanup complete."
}

# Always clean up on exit
trap cleanup EXIT

# --- Pre-flight checks ---
for cmd in kubectl curl; do
  if ! command -v "${cmd}" &>/dev/null; then
    error "${cmd} is required but not found on PATH"
    exit 1
  fi
done

if ! kubectl cluster-info &>/dev/null; then
  error "Cannot connect to Kubernetes cluster. Is your cluster running?"
  error "Start the local cluster with: monorepo/infra/scripts/local-up.sh"
  exit 1
fi

log "Connected to cluster. Starting smoke test..."

# --- Deploy ---
log "Creating namespace ${NAMESPACE}..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

log "Applying smoke test manifests..."
kubectl apply -n "${NAMESPACE}" -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEPLOY_NAME}
  labels:
    app: ${DEPLOY_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${DEPLOY_NAME}
  template:
    metadata:
      labels:
        app: ${DEPLOY_NAME}
    spec:
      containers:
      - name: hello
        image: ${IMAGE}
        ports:
        - containerPort: ${PORT}
        readinessProbe:
          httpGet:
            path: /
            port: ${PORT}
          initialDelaySeconds: 2
          periodSeconds: 3
        resources:
          requests:
            cpu: 50m
            memory: 32Mi
          limits:
            cpu: 100m
            memory: 64Mi
---
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
spec:
  selector:
    app: ${DEPLOY_NAME}
  ports:
  - port: 80
    targetPort: ${PORT}
    protocol: TCP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${INGRESS_NAME}
spec:
  ingressClassName: traefik
  rules:
  - host: ${INGRESS_HOST}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${SERVICE_NAME}
            port:
              number: 80
EOF

# --- Wait for pod readiness ---
log "Waiting for deployment to be ready (up to ${MAX_WAIT_SECONDS}s)..."
if ! kubectl rollout status deployment/"${DEPLOY_NAME}" \
  -n "${NAMESPACE}" \
  --timeout="${MAX_WAIT_SECONDS}s"; then
  error "Deployment did not become ready within ${MAX_WAIT_SECONDS}s"
  kubectl get pods -n "${NAMESPACE}" -o wide
  kubectl describe deployment/"${DEPLOY_NAME}" -n "${NAMESPACE}"
  exit 1
fi

log "Deployment is ready."

# --- Test ingress connectivity ---
log "Testing HTTP connectivity via ingress (host: ${INGRESS_HOST})..."

CONNECTED=false
for i in $(seq 1 "${CURL_RETRIES}"); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --resolve "${INGRESS_HOST}:80:127.0.0.1" \
    "http://${INGRESS_HOST}/" \
    --max-time 5 2>/dev/null) || HTTP_CODE="000"

  if [ "${HTTP_CODE}" = "200" ]; then
    CONNECTED=true
    break
  fi

  warn "Attempt ${i}/${CURL_RETRIES}: HTTP ${HTTP_CODE} (retrying in ${CURL_RETRY_DELAY}s)..."
  sleep "${CURL_RETRY_DELAY}"
done

if [ "${CONNECTED}" = true ]; then
  log "Smoke test PASSED - received HTTP 200 from ${INGRESS_HOST}"
  # Show response body for confirmation
  echo ""
  curl -s --resolve "${INGRESS_HOST}:80:127.0.0.1" "http://${INGRESS_HOST}/" --max-time 5
  echo ""
  exit 0
else
  error "Smoke test FAILED - could not reach service via ingress"
  error "Last HTTP status: ${HTTP_CODE}"
  echo ""
  warn "Debug info:"
  kubectl get pods,svc,ingress -n "${NAMESPACE}" -o wide
  exit 1
fi
