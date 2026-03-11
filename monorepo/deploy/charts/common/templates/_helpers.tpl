{{/*
Expand the name of the chart.
Uses nameOverride if set, otherwise the chart name.
*/}}
{{- define "common.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
If fullnameOverride is set, use that. Otherwise, if the release name contains the
chart name, use the release name; otherwise concatenate them.
*/}}
{{- define "common.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "common.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common app.kubernetes.io/* labels following Kubernetes recommended conventions.
*/}}
{{- define "common.labels" -}}
helm.sh/chart: {{ include "common.chart" . }}
app.kubernetes.io/name: {{ include "common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: the-data-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels (subset of common labels used for pod selection).
*/}}
{{- define "common.selectorLabels" -}}
app.kubernetes.io/name: {{ include "common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "common.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "common.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Standard security context for containers.
Defaults: runAsNonRoot, readOnlyRootFilesystem, no privilege escalation.
*/}}
{{- define "common.securityContext" -}}
securityContext:
  {{- if hasKey .Values.securityContext "runAsNonRoot" }}
  runAsNonRoot: {{ .Values.securityContext.runAsNonRoot }}
  {{- else }}
  runAsNonRoot: true
  {{- end }}
  {{- if hasKey .Values.securityContext "readOnlyRootFilesystem" }}
  readOnlyRootFilesystem: {{ .Values.securityContext.readOnlyRootFilesystem }}
  {{- else }}
  readOnlyRootFilesystem: true
  {{- end }}
  {{- if hasKey .Values.securityContext "allowPrivilegeEscalation" }}
  allowPrivilegeEscalation: {{ .Values.securityContext.allowPrivilegeEscalation }}
  {{- else }}
  allowPrivilegeEscalation: false
  {{- end }}
  capabilities:
    drop:
      - ALL
{{- end }}

{{/*
Liveness probe template.
Usage: {{ include "common.livenessProbe" . }}
*/}}
{{- define "common.livenessProbe" -}}
{{- if .Values.livenessProbe.enabled }}
livenessProbe:
  httpGet:
    path: {{ .Values.livenessProbe.path }}
    port: {{ .Values.livenessProbe.port }}
  initialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.livenessProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.livenessProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.livenessProbe.failureThreshold }}
  successThreshold: {{ .Values.livenessProbe.successThreshold }}
{{- end }}
{{- end }}

{{/*
Readiness probe template.
Usage: {{ include "common.readinessProbe" . }}
*/}}
{{- define "common.readinessProbe" -}}
{{- if .Values.readinessProbe.enabled }}
readinessProbe:
  httpGet:
    path: {{ .Values.readinessProbe.path }}
    port: {{ .Values.readinessProbe.port }}
  initialDelaySeconds: {{ .Values.readinessProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.readinessProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.readinessProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.readinessProbe.failureThreshold }}
  successThreshold: {{ .Values.readinessProbe.successThreshold }}
{{- end }}
{{- end }}

{{/*
Startup probe template.
Usage: {{ include "common.startupProbe" . }}
*/}}
{{- define "common.startupProbe" -}}
{{- if .Values.startupProbe.enabled }}
startupProbe:
  httpGet:
    path: {{ .Values.startupProbe.path }}
    port: {{ .Values.startupProbe.port }}
  initialDelaySeconds: {{ .Values.startupProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.startupProbe.periodSeconds }}
  timeoutSeconds: {{ .Values.startupProbe.timeoutSeconds }}
  failureThreshold: {{ .Values.startupProbe.failureThreshold }}
  successThreshold: {{ .Values.startupProbe.successThreshold }}
{{- end }}
{{- end }}

{{/*
Container image string.
Usage: {{ include "common.image" . }}
*/}}
{{- define "common.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}
