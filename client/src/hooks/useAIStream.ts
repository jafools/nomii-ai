import { useState, useRef, useCallback } from "react";

/** Shared SSE streaming helper for AI edge functions */
export type StreamOptions = {
  url: string;
  body: Record<string, unknown>;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
};

export function useAIStream() {
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async ({ url, body, onDelta, onDone, onError }: StreamOptions) => {
    setIsLoading(true);
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        onError(err.error || "Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      // flush
      if (buf.trim()) {
        for (let raw of buf.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || !raw.startsWith("data: ")) continue;
          const json = raw.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content as string | undefined;
            if (c) onDelta(c);
          } catch { /* ignore */ }
        }
      }

      onDone();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        onDone();
      } else {
        console.error("Stream error:", e);
        onError("Connection error. Please try again.");
      }
    }

    setIsLoading(false);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { stream, isLoading, cancel };
}
