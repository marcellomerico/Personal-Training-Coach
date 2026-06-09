/** @type {import('next').NextConfig} */
const nextConfig = {
  // Web-App ist reiner Client für die bestehende NestJS-API (Cross-Origin
  // mit Cookie-Auth). Keine Server-Komponenten-Datenzugriffe nötig.
  reactStrictMode: true,
};

export default nextConfig;
