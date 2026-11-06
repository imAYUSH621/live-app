#!/usr/bin/env bash
# CI emulator diagnostic capture (test-only). Runs inside android-emulator-runner.
# Phase "diag": instrumented build (uncaught-JS-exception handler + red fallback activity).
# Phase "plain": non-instrumented release build (what a tester would actually install),
# to confirm the failure experience/fix without the catch handler altering it.
set -x
DIAG=mobile/android/app/build/outputs/apk/release/app-release-test-diag.apk
PLAIN=mobile/android/app/build/outputs/apk/release/app-release-test-plain.apk

capture() {
  local label="$1"
  adb logcat -c
  adb shell monkey -p com.liveapp.live -c android.intent.category.LAUNCHER 1
  for i in $(seq 1 12); do
    sleep 10
    PID=$(adb shell pidof com.liveapp.live | tr -d '\r')
    echo "[$label] poll $i pid=$PID"
    if [ -n "$PID" ]; then
      TOP=$(adb shell dumpsys activity activities | grep -m1 -i 'liveapp' || true)
      echo "[$label] top: $TOP"
      if echo "$TOP" | grep -qi 'DiagnosticErrorActivity'; then echo "[$label] DIAG_SCREEN_SHOWN"; break; fi
    fi
  done
  echo "[$label] === window/focus ==="
  adb shell dumpsys window | grep -i -E 'mCurrentFocus|mFocusedApp' || true
  adb shell pidof com.liveapp.live || echo "[$label] PROCESS_NOT_RUNNING"
  echo "[$label] === display state ==="
  adb shell dumpsys display | grep -i -E 'mState=|mScreenState' | head -5 || true
  echo "[$label] === wake + settle ==="
  adb shell svc power stayon true || true
  adb shell input keyevent KEYCODE_WAKEUP || true
  adb shell wm dismiss-keyguard || true
  sleep 12
  adb exec-out screencap -p > diag-${label}-screenshot.png || true
  echo "[$label] screenshot1 bytes=$(stat -c%s diag-${label}-screenshot.png 2>/dev/null || echo 0)"
  sleep 8
  adb shell screencap -p /sdcard/diag-${label}-2.png || true
  adb pull /sdcard/diag-${label}-2.png diag-${label}-screenshot2.png || true
  echo "[$label] screenshot2 bytes=$(stat -c%s diag-${label}-screenshot2.png 2>/dev/null || echo 0)"
  echo "[$label] === ui hierarchy ==="
  adb shell uiautomator dump /sdcard/diag-ui-${label}.xml || true
  adb shell cat /sdcard/diag-ui-${label}.xml > diag-ui-hierarchy-${label}.xml || true
  grep -o 'text="[^"]*"' diag-ui-hierarchy-${label}.xml | head -50 || true
  if grep -qi 'login\|sign\|phone\|continue' diag-ui-hierarchy-${label}.xml; then echo "[$label] LOGIN_LIKE_SCREEN_PRESENT"; fi
  adb logcat -d -v threadtime > diag-${label}-logcat.txt
  grep -a -E 'AndroidRuntime|FATAL|ReactNativeJS|ExpoModulesCore|hermes|libc|DEBUG|liveapp' diag-${label}-logcat.txt | tail -150 > diag-${label}-logcat-filtered.txt || true
  if grep -q 'FATAL EXCEPTION' diag-${label}-logcat.txt; then echo "[$label] FATAL_FOUND"; else echo "[$label] NO_FATAL"; fi
  echo "[$label] CAPTURE_DONE"
}

adb install -r "$DIAG" || exit 1
capture diag
if [ -f "$PLAIN" ]; then
  adb uninstall com.liveapp.live || true
  adb install -r "$PLAIN" || exit 1
  capture plain
else
  echo "PLAIN_APK_MISSING - skipping non-instrumented phase"
fi
echo ALL_CAPTURES_DONE
