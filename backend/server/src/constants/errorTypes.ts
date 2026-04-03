export const ERROR_TYPES = {
  BAD_REQUEST: {
    statusCode: 400,
    type: "BAD_REQUEST",
  },
  CONFLICT: {
    statusCode: 409,
    type: "CONFLICT",
  },
  EXTERNAL_SERVICE_ERROR: {
    statusCode: 502,
    type: "EXTERNAL_SERVICE_ERROR",
  },
  INTERNAL_SERVER_ERROR: {
    statusCode: 500,
    type: "INTERNAL_SERVER_ERROR",
  },
  NOT_FOUND: {
    statusCode: 404,
    type: "NOT_FOUND",
  },
  UNAUTHORIZED: {
    statusCode: 401,
    type: "UNAUTHORIZED",
  },
} as const;

export type ErrorType = keyof typeof ERROR_TYPES;
