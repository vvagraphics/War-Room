// --- FIX FOR WEB FONT PRELOAD WARNING ---
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,
};

module.exports = nextConfig;