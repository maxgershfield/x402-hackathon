"use client";

import { useCallback } from "react";

type UseOasisApiOptions = {
  baseUrl: string;
  token?: string;
};

export function useOasisApi({ baseUrl, token }: UseOasisApiOptions) {
  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const url = path.startsWith("http")
        ? path
        : `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path.replace(/^\//, "")}`;

      const headers = new Headers(init.headers as HeadersInit | undefined);

      if (!headers.has("Content-Type") && init.body) {
        headers.set("Content-Type", "application/json");
      }

      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(url, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      if (response.status === 204) {
        return null;
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    },
    [baseUrl, token]
  );

  return { call };
}

