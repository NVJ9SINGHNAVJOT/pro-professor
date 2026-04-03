export type AppErrorType = {
  statusCode: number;
  type: string;
};

export class AppError extends Error {
  statusCode: number;
  type: string;
  details?: unknown;

  constructor(errorType: AppErrorType, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = errorType.statusCode;
    this.type = errorType.type;
    this.details = details;
  }
}
