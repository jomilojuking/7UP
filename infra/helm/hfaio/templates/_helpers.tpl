{{/* Chart name. */}}
{{- define "hfaio.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Fully qualified app name. */}}
{{- define "hfaio.fullname" -}}
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

{{- define "hfaio.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "hfaio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: hfaio
{{- end }}

{{/* Selector labels; call with (dict "ctx" $ "component" "backend"). */}}
{{- define "hfaio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hfaio.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "hfaio.backend.fullname" -}}
{{- printf "%s-backend" (include "hfaio.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "hfaio.frontend.fullname" -}}
{{- printf "%s-frontend" (include "hfaio.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "hfaio.secretName" -}}
{{- default (printf "%s-secrets" (include "hfaio.fullname" .)) .Values.secrets.existingSecret }}
{{- end }}

{{- define "hfaio.image" -}}
{{- printf "%s:%s" .image.repository (default .ctx.Chart.AppVersion .image.tag) }}
{{- end }}
