// Staging-demo chrome (test persona logins, staging badges, demo dock) is a
// development aid. It ships only when built with VITE_STAGING_DEMO=true.
// Production/client builds must leave it off: no demo UI in the bundle output.
export const STAGING_DEMO = import.meta.env.VITE_STAGING_DEMO === 'true';
