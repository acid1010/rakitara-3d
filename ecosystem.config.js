module.exports = {
  apps: [
    {
      name: "rakitara-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3000",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "rakitara-api",
      cwd: __dirname,
      script: "server/index.ts",
      interpreter: "bun",
      exec_mode: "fork",
      instances: 1,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
        API_HOST: "127.0.0.1",
      },
    },
  ],
};
