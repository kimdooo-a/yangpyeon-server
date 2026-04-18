module.exports = {
  apps: [
    {
      name: "sp010-fork",
      namespace: "sp010",
      script: "./server.cjs",
      instances: 1,
      exec_mode: "fork",
      env: { PORT: "3001" },
    },
  ],
};
