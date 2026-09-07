#!/bin/sh
# Run read-only probes and atomically retain their latest completed JSON report.
set -eu
umask 077
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo 'usage: probe-connectors.sh REPORT_PATH [CONNECTOR]' >&2
  exit 2
fi
report_path=$1
connector_key=${2:-}
qa_binary=${APPCALL_QA_BIN:-bin/qa}
report_temp=$(mktemp "${report_path}.XXXXXX")
trap 'rm -f "$report_temp"' EXIT HUP INT TERM
set -- run --read-only --require-probe --timeout 10m --json
if [ -n "$connector_key" ]; then
  set -- "$@" --connector "$connector_key"
fi
probe_status=0
"$qa_binary" "$@" > "$report_temp" || probe_status=$?
if [ -s "$report_temp" ]; then
  mv "$report_temp" "$report_path"
fi
exit "$probe_status"
