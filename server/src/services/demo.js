import { config } from '../config.js';

// Staging/demo conveniences. BOTH require a non-production NODE_ENV and an
// explicit env opt-in; production always fails closed. Read at call time so
// tests can flip process.env without re-importing config.
export const demoLoginEnabled = () => config.nodeEnv !== 'production' && process.env.ALLOW_DEMO_LOGIN === 'true';
export const kycBypassEnabled = () => config.nodeEnv !== 'production' && process.env.ALLOW_KYC_BYPASS === 'true';

// Non-secret effective provider/configuration state for the admin readiness
// endpoint. Booleans and provider names only - never keys or secrets.
export function readinessFlags() {
  return {
    node_env: config.nodeEnv,
    demo_login_active: demoLoginEnabled(),
    kyc_bypass_active: kycBypassEnabled(),
    razorpay_enabled: !!(config.razorpay.keyId && config.razorpay.keySecret),
    otp_provider: config.otpProvider,
    twofactor_configured: !!config.twoFactorApiKey,
    turn_configured: !!(config.turn.urls && config.turn.secret),
    livekit_host: (() => { try { return new URL(config.livekit.url.replace(/^ws/, 'http')).host; } catch { return ''; } })(),
    cloudinary_configured: !!(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret),
    firebase_configured: !!config.firebaseServiceAccount,
    sightengine_configured: !!(config.sightengine.user && config.sightengine.secret),
    test_artifacts_enabled: process.env.TEST_ARTIFACTS_ENABLED === 'true',
  };
}
