"use client";

import { useEffect, useState } from "react";

type State<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Fetch live data for a component straight from the server's tool endpoint, so prices and
 * offers on screen come from the data source and never from text the model wrote.
 */
export function useToolData<T>(tool: string, input: Record<string, unknown>, enabled = true) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const key = JSON.stringify(input);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/tools/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setState({ status: "ready", data: body as T });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ status: "error", message: error.message });
      });
    return () => controller.abort();
  }, [tool, key, enabled]);

  return state;
}

export function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
