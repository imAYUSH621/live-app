#!/usr/bin/env bash
# CI emulator diagnostic capture (test-only). Runs inside android-emulator-runner.
set -x
APK=mobile/android/app/build/outputs/apk/release/app-release-test-diag.apk
adb install -r "$APK" || exit 1
adb logcat -c
adb shell monkey -p com.liveapp.live -c android.intent.category.LAUNCHER 1
for i in $(seq 1 12); do
  sleep 10
  PID=$(adb shell pidof com.liveapp.live | tr -d '\r')
  echo "poll $i pid=$PID"
  if [ -n "$PID" ]; then
    TOP=$(adb shell dumpsys activity activities | grep -m1 -i 'liveapp' || true)
    echo "top: $TOP"
    if echo "$TOP" | grep -qi 'DiagnosticErrorActivity'; then echo "DIAG_SCREEN_SHOWN"; break; fi
  fi
done
echo "=== window/focus ==="
adb shell dumpsys window | grep -i -E 'mCurrentFocus|mFocusedApp' || true
echo "=== activity dump (liveapp) ==="
adb shell dumpsys activity activities | grep -i -B2 -A2 'liveapp' | head -40 || true
echo "=== process/crash state ==="
adb shell pidof com.liveapp.live || echo "PROCESS_NOT_RUNNING"
echo "=== wake screen before capture (swiftshader renders black while dozing) ==="
adb shell input keyevent KEYCODE_WAKEUP || true
adb shell wm dismiss-keyguard || true
sleep 5
adb exec-out screencap -p > diag-emulator-screenshot.png
echo "=== ui hierarchy dump (structural UI evidence even if pixels are black) ==="
adb shell uiautomator dump /sdcard/diag-ui.xml || true
adb pull /sdcard/diag-ui.xml diag-ui-hierarchy.xml || true
adb logcat -d -v threadtime > diag-emulator-logcat.txt
grep -a -E 'AndroidRuntime|FATAL|ReactNativeJS|ExpoModulesCore|hermes|libc|DEBUG|liveapp' diag-emulator-logcat.txt | tail -150 > diag-emulator-logcat-filtered.txt || true
echo "CAPTURE_DONE"
