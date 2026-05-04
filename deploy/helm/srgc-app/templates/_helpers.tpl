{{- define "srgc.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "srgc.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "srgc.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "srgc.labels" -}}
app.kubernetes.io/name: {{ include "srgc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "srgc.selectorLabels" -}}
app.kubernetes.io/name: {{ include "srgc.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "srgc.nextauthUrl" -}}
{{- if .Values.env.NEXTAUTH_URL -}}
{{ .Values.env.NEXTAUTH_URL }}
{{- else -}}
{{ printf "https://%s" .Values.host }}
{{- end -}}
{{- end -}}
