/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Docker image sets NEXT_OUTPUT=standalone to ship only the files the
  // server needs (a much smaller image). Local `npm run build`/`npm run start`
  // are unaffected.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
};

module.exports = nextConfig;
