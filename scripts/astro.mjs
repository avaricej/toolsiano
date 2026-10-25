// Disable development/build telemetry for this project as well as browser tracking.
process.env.ASTRO_TELEMETRY_DISABLED = '1';
await import('../node_modules/astro/bin/astro.mjs');
