#!/usr/bin/env bash
set -u
# Sidecar is a separate real browser session receiving the native host stream.
node mobile/scripts/native-media-viewer.cjs > /tmp/native-media-viewer.log 2>&1 &
viewer=$!
python3 mobile/scripts/emulator-navigation.py
native_status=$?
wait "$viewer"
viewer_status=$?
cat /tmp/native-media-viewer.log
exit $((native_status || viewer_status))
