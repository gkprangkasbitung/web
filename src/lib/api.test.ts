import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const { parseMultipart, readLimitedBody } = await import("./api");

function streamOf(chunks: number, chunkSize: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent === chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    },
  });
}

function streamingRequest(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { method: "PATCH", body, headers, duplex: "half" } as RequestInit);
}

describe("readLimitedBody", () => {
  it("returns the whole body when it fits", async () => {
    const body = await readLimitedBody(streamingRequest(streamOf(3, 10)), 30);
    expect(body?.byteLength).toBe(30);
  });

  it("refuses a declared Content-Length over the limit without reading", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "PATCH",
      body: "x",
      headers: { "content-length": "999999" },
    });
    expect(await readLimitedBody(request, 100)).toBeNull();
  });

  it("counts while streaming when there is no Content-Length (chunked)", async () => {
    expect(await readLimitedBody(streamingRequest(streamOf(11, 10)), 100)).toBeNull();
  });
});

describe("parseMultipart", () => {
  const schema = z.object({ nama: z.string().min(1, "Nama wajib diisi."), foto_file: z.instanceof(File).optional() });

  it("parses text fields and files", async () => {
    const form = new FormData();
    form.append("nama", "Uji");
    form.append("foto_file", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const request = new Request("http://localhost/api/test", { method: "PATCH", body: form });

    const result = await parseMultipart(request, schema, { maxBytes: 10_000, tooLarge: "Terlalu besar." });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.nama).toBe("Uji");
      expect(result.data.foto_file?.size).toBe(3);
    }
  });

  it("answers 400 with the given message when the body is too large", async () => {
    const form = new FormData();
    form.append("foto_file", new File([new Uint8Array(5000)], "a.jpg"));
    const request = new Request("http://localhost/api/test", { method: "PATCH", body: form });

    const result = await parseMultipart(request, schema, { maxBytes: 1000, tooLarge: "Terlalu besar." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual({ error: "Terlalu besar." });
    }
  });

  it("refuses a body that isn't multipart", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "PATCH",
      body: JSON.stringify({ nama: "Uji" }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseMultipart(request, schema, { maxBytes: 1000, tooLarge: "Terlalu besar." });
    expect(result.ok).toBe(false);
  });
});
