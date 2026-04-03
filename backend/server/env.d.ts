declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    ALLOWED_ORIGINS: string;
    SERVER_KEY: string;
    PORT: string;
    LOKI_URL: string;
    REDIS_HOST: string;
    REDIS_PORT: string;
    REDIS_PASSWORD: string;
    POSTGRES_MIGRATE: string;
    POSTGRES_TRIGGER: string;
    POSTGRES_HOST: string;
    POSTGRES_USER: string;
    POSTGRES_DB: string;
    POSTGRES_PASSWORD: string;
    OLLAMA_BASE_URL: string;
    OLLAMA_API_KEY: string;
    AI_SERVICE_BASE_URL: string;
    AI_SERVICE_API_KEY: string;
  }
}
