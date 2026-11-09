import { Readable } from "node:stream";
import { UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../common/types/auth-user";
import { TranscribeService } from "./transcribe.service";

const user = { id: "u1" } as AuthUser;
const other = { id: "u2" } as AuthUser;
const result = { text: "Halo.", truncated: false, passes: 1, warning: null, provider: "gemini", model: "m" };

function setup(transcribeFile: () => Promise<typeof result>, mimeType = "audio/webm;codecs=opus") {
  const transcribe = vi.fn(transcribeFile);
  const service = new TranscribeService(
    { transcribeFile: transcribe } as never,
    { findWithPermission: () => Promise.resolve({ asset: { id: "a1", objectKey: "k", mimeType } }) } as never,
    { getObject: () => Promise.resolve(Readable.from([Buffer.from("x")])) } as never,
  );
  return { service, transcribe };
}

const settled = async (service: TranscribeService, userId = "u1") => {
  await vi.waitFor(() => expect(service.status(userId, "a1")?.status).not.toBe("running"));
  return service.status(userId, "a1")!;
};

describe("TranscribeService", () => {
  it("langsung menjawab running, hasil tersedia lewat status", async () => {
    const { service } = setup(() => Promise.resolve(result));
    expect((await service.start(user, "a1")).status).toBe("running");
    expect(await settled(service)).toMatchObject({ status: "done", result });
  });

  it("berkas yang sama tidak ditranskrip dua kali", async () => {
    const { service, transcribe } = setup(() => Promise.resolve(result));
    await service.start(user, "a1");
    await service.start(user, "a1");
    await settled(service);
    expect((await service.start(user, "a1")).status).toBe("done");
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("kegagalan membawa status & pesan, dan boleh dicoba lagi", async () => {
    const { service, transcribe } = setup(() => Promise.reject(new UnprocessableEntityException("key ditolak")));
    await service.start(user, "a1");
    expect(await settled(service)).toMatchObject({ status: "failed", httpStatus: 422, message: "key ditolak" });
    await service.start(user, "a1");
    await settled(service);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("hasil dengan bagian gagal boleh diulang", async () => {
    const { service, transcribe } = setup(() => Promise.resolve({ ...result, truncated: true }));
    await service.start(user, "a1");
    await settled(service);
    await service.start(user, "a1");
    await settled(service);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("pekerjaan user lain tidak terlihat", async () => {
    const { service } = setup(() => Promise.resolve(result));
    await service.start(user, "a1");
    expect(service.status(other.id, "a1")).toBeNull();
  });

  it("berkas bukan audio ditolak", async () => {
    const { service, transcribe } = setup(() => Promise.resolve(result), "application/pdf");
    await expect(service.start(user, "a1")).rejects.toThrow("bukan audio");
    expect(transcribe).not.toHaveBeenCalled();
  });
});
