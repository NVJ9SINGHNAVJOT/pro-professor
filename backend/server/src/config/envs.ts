const environmentVariables = [
  "ENVIRONMENT",
  "ALLOWED_ORIGINS",
  "SERVER_KEY",
  "PORT",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_PASSWORD",
  "POSTGRES_MIGRATE",
  "POSTGRES_TRIGGER",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "OLLAMA_BASE_URL",
  "AI_SERVICE_BASE_URL",
];

export function checkEnvVariables(): void {
  environmentVariables.forEach((envVar) => {
    if (!process.env[envVar] || process.env[envVar].trim() === "") {
      throw new Error(`Missing or empty environment variable: ${envVar}`);
    }
  });
}
