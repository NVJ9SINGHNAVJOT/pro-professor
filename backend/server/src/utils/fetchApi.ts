import { logger } from "@/logger/logger";
import { getRequestId } from "@/utils/request";
import { Request } from "express";

export type ApiError = {
  status: number;
  message?: string;
  response: unknown;
};

export type ApiResponse<T> = { error: null; response: T } | { error: ApiError; response: null };

export type FetchApiOptions = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "HEAD";
  url: string;
  data?: object | FormData;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  params?: Record<string, string>;
};

export async function fetchApi<T>(req: Request, options: FetchApiOptions): Promise<ApiResponse<T>> {
  try {
    const { method, url: initialUrl, data, signal, headers, params } = options;
    const requestHeaders = new Headers();

    if (headers) {
      Object.entries(headers).forEach(([key, value]) => requestHeaders.append(key, value));
    }

    // Add query parameters to the URL
    let url = initialUrl;
    if (params) {
      const searchParams = new URLSearchParams(params);
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
      signal,
    };

    // Attach body only if method is NOT GET or HEAD and data is provided
    if (method !== "GET" && method !== "HEAD" && data != null) {
      if (data instanceof FormData) {
        // For FormData, do not set Content-Type; runtime sets it automatically
        requestOptions.body = data;
      } else {
        // For JSON, set Content-Type to application/json (unless already set)
        if (!requestHeaders.has("Content-Type")) {
          requestHeaders.append("Content-Type", "application/json");
        }
        requestOptions.body = JSON.stringify(data);
      }
    }

    logger.info("Outgoing API request", {
      requestId: getRequestId(req),
      method,
      url,
      payload: data ?? null,
    });

    const response = await fetch(url, requestOptions);
    const responseText = await response.text();

    let responseData: unknown = null;
    try {
      responseData = responseText ? (JSON.parse(responseText) as unknown) : null;
    } catch {
      responseData = responseText;
    }

    logger.info("Incoming API response", {
      requestId: getRequestId(req),
      method,
      url,
      status: response.status,
      response: responseData,
    });

    if (!response.ok) {
      const message =
        responseData && typeof responseData === "object" && "message" in responseData
          ? String((responseData as { message: unknown }).message)
          : typeof responseData === "string" && responseData.trim()
            ? responseData
            : undefined;

      return {
        error: {
          status: response.status,
          message,
          response: responseData,
        },
        response: null,
      };
    }

    return { error: null, response: responseData as T };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return {
      error: {
        status: 0,
        message: "message" in e ? e.message : undefined,
        response: null,
      },
      response: null,
    };
  }
}
