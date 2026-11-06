// TEST-ONLY startup diagnostics (enabled with LIVEAPP_DIAGNOSTIC=1 at prebuild time).
// Adds a conspicuous error activity that renders the real startup Throwable on screen
// (plus device page size / fingerprint) so cloud-device screenshot capture can read it,
// and wraps the React Native init in MainApplication.onCreate in a try/catch that
// refuses to continue as a masquerading healthy app. Never ship this in a release.
const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ACTIVITY = `package com.liveapp.live

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.system.Os
import android.system.OsConstants
import android.text.method.ScrollingMovementMethod
import android.widget.ScrollView
import android.widget.TextView
import java.io.PrintWriter
import java.io.StringWriter

// Conspicuous test-only diagnostic screen. Shown only when startup fails (or a fatal
// exception is caught). Never present in non-diagnostic builds.
class DiagnosticErrorActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pageSize = try { Os.sysconf(OsConstants._SC_PAGESIZE) } catch (e: Throwable) { -1L }
    val err = intent.getStringExtra("trace") ?: "(no trace captured)"
    val redacted = err.replace(Regex("([?&](token|sig|signature|auth|key)=)[^&\\\\s]+", RegexOption.IGNORE_CASE), "$1[redacted]")
      .replace(Regex("Bearer\\\\s+[A-Za-z0-9._-]+", RegexOption.IGNORE_CASE), "Bearer [redacted]")
    val tv = TextView(this)
    tv.setBackgroundColor(Color.parseColor("#7F0000"))
    tv.setTextColor(Color.WHITE)
    tv.textSize = 12f
    tv.setPadding(32, 48, 32, 48)
    tv.movementMethod = ScrollingMovementMethod()
    tv.text = "LIVEAPP DIAGNOSTIC TEST BUILD - STARTUP FAILED\\n(not a working app; do not distribute)\\n\\n" +
      "device=" + Build.MANUFACTURER + " " + Build.MODEL + "\\n" +
      "android=" + Build.VERSION.RELEASE + " (sdk " + Build.VERSION.SDK_INT + ")\\n" +
      "pageSize=" + pageSize + "\\n" +
      "fingerprint=" + Build.FINGERPRINT + "\\n\\n" + redacted
    val sv = ScrollView(this)
    sv.addView(tv)
    setContentView(sv)
  }

  companion object {
    @JvmStatic
    fun traceOf(t: Throwable): String {
      val sw = StringWriter()
      t.printStackTrace(PrintWriter(sw))
      return t.javaClass.name + ": " + (t.message ?: "") + "\\n" + sw.toString()
    }
  }
}
`;

function enabled() {
  return process.env.LIVEAPP_DIAGNOSTIC === '1';
}

module.exports = function withStartupDiagnostics(config) {
  if (!enabled()) return config;

  config = withDangerousMod(config, ['android', (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/java/com/liveapp/live');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'DiagnosticErrorActivity.kt'), ACTIVITY);
    return c;
  }]);

  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.activity = app.activity || [];
    app.activity.push({
      $: { 'android:name': '.DiagnosticErrorActivity', 'android:exported': 'false' },
    });
    return c;
  });

  config = withMainApplication(config, (c) => {
    let src = c.modResults.contents;
    if (!src.includes('installStartupDiagnostics()')) {
      src = src.replace(
        /override fun onCreate\(\) \{\n(\s*)super\.onCreate\(\)\n([\s\S]*?)\n  \}/,
        (m, indent, body) => `override fun onCreate() {
${indent}super.onCreate()
${indent}installStartupDiagnostics()
${indent}try {
${body.split('\n').map((l) => '  ' + l).join('\n')}
${indent}} catch (t: Throwable) {
${indent}  val i = android.content.Intent(this, DiagnosticErrorActivity::class.java)
${indent}  i.putExtra("trace", DiagnosticErrorActivity.traceOf(t))
${indent}  i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
${indent}  startActivity(i)
${indent}}
  }

  private fun installStartupDiagnostics() {
    Thread.setDefaultUncaughtExceptionHandler { _, t ->
      val i = android.content.Intent(this, DiagnosticErrorActivity::class.java)
      i.putExtra("trace", DiagnosticErrorActivity.traceOf(t))
      i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(i)
      android.os.Process.killProcess(android.os.Process.myPid())
    }
  }`);
    }
    c.modResults.contents = src;
    return c;
  });

  return config;
};
