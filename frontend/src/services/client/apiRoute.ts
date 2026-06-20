import type { FetchApiOptions } from "@/services/client/fetchApi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRoute<Args extends any[], Res> = {
  build: (...args: Args) => FetchApiOptions;
  __responseType?: Res;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRoute<Args extends any[], Res>(build: (...args: Args) => FetchApiOptions): ApiRoute<Args, Res> {
  return { build };
}
