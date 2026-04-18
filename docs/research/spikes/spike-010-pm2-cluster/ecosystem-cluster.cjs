module.exports = {
  apps: [
    {
      name: "sp010-cluster",
      namespace: "sp010",
      script: "./server.cjs",
      instances: 4,
      exec_mode: "cluster",
      env: { PORT: "3001" },
    },
  ],
};
