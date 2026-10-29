import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateEmbeddedImageSizes,
  validateFiles,
  validateIndividualFileSizes,
  validateTotalFileSize,
} from "#/utils/file-validation";

const MEBIBYTE = 1024 * 1024;
const THREE_MEBIBYTES = 3 * MEBIBYTE;

function fileWithSize(name: string, size: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("attachment size validation", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", "3");
    vi.stubEnv("VITE_MAX_ATTACHMENT_TOTAL_MB", "3");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__;
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__;
  });

  it("accepts a file at the 3 MiB boundary and rejects one byte over it", () => {
    expect(
      validateIndividualFileSizes([
        fileWithSize("at-limit.zip", THREE_MEBIBYTES),
      ]),
    ).toEqual({ isValid: true });

    expect(
      validateIndividualFileSizes([
        fileWithSize("over-limit.zip", THREE_MEBIBYTES + 1),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 3MB are not allowed: over-limit.zip",
      oversizedFiles: ["over-limit.zip"],
    });
  });

  it("reports every oversized file by name in selection order", () => {
    const result = validateIndividualFileSizes([
      fileWithSize("first.bin", THREE_MEBIBYTES + 1),
      fileWithSize("allowed.bin", THREE_MEBIBYTES),
      fileWithSize("second.bin", 4 * MEBIBYTE),
    ]);

    expect(result).toEqual({
      isValid: false,
      errorMessage:
        "Files exceeding 3MB are not allowed: first.bin, second.bin",
      oversizedFiles: ["first.bin", "second.bin"],
    });
  });

  it("accepts new and existing files whose combined size is exactly 3 MiB", () => {
    expect(
      validateTotalFileSize(
        [fileWithSize("new.bin", MEBIBYTE)],
        [fileWithSize("existing.bin", 2 * MEBIBYTE)],
      ),
    ).toEqual({ isValid: true });
  });

  it("rejects a new and existing aggregate one byte over the limit", () => {
    expect(
      validateTotalFileSize(
        [fileWithSize("new.bin", MEBIBYTE + 1)],
        [fileWithSize("existing.bin", 2 * MEBIBYTE)],
      ),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 3.0MB, exceeding the 3MB limit. Please select fewer or smaller files.",
    });
  });

  it("formats an oversized aggregate to one decimal place", () => {
    expect(
      validateTotalFileSize(
        [fileWithSize("new.bin", 2 * MEBIBYTE)],
        [fileWithSize("existing.bin", 1.25 * MEBIBYTE)],
      ),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 3.3MB, exceeding the 3MB limit. Please select fewer or smaller files.",
    });
  });

  it("uses an empty existing-file list when none is provided", () => {
    expect(
      validateTotalFileSize([
        fileWithSize("new.bin", THREE_MEBIBYTES + MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 4.0MB, exceeding the 3MB limit. Please select fewer or smaller files.",
    });
  });

  it("returns the individual-file error before the aggregate-size error", () => {
    expect(
      validateFiles(
        [fileWithSize("too-large.bin", THREE_MEBIBYTES + 1)],
        [fileWithSize("existing.bin", MEBIBYTE)],
      ),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 3MB are not allowed: too-large.bin",
      oversizedFiles: ["too-large.bin"],
    });
  });

  it("checks the aggregate after every new file passes individually", () => {
    expect(
      validateFiles([
        fileWithSize("first.bin", 2 * MEBIBYTE),
        fileWithSize("second.bin", 2 * MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 4.0MB, exceeding the 3MB limit. Please select fewer or smaller files.",
    });
  });

  it("accepts an aggregate at the limit through the combined validator", () => {
    expect(
      validateFiles(
        [fileWithSize("new.bin", MEBIBYTE)],
        [fileWithSize("existing.bin", 2 * MEBIBYTE)],
      ),
    ).toEqual({ isValid: true });
  });
});

describe("attachment size validation with a configured limit", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_TOTAL_MB", undefined);
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__;
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__;
  });

  it("defaults to a 200 MiB ceiling", () => {
    expect(
      validateIndividualFileSizes([fileWithSize("huge.bin", 200 * MEBIBYTE)]),
    ).toEqual({ isValid: true });

    expect(
      validateIndividualFileSizes([
        fileWithSize("too-huge.bin", 200 * MEBIBYTE + 1),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 200MB are not allowed: too-huge.bin",
      oversizedFiles: ["too-huge.bin"],
    });
  });

  it("names the configured limit in the per-file error", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");

    expect(
      validateIndividualFileSizes([
        fileWithSize("too-big.bin", 513 * MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 512MB are not allowed: too-big.bin",
      oversizedFiles: ["too-big.bin"],
    });
  });

  it("names the configured limit in the aggregate error", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");

    expect(
      validateTotalFileSize([
        fileWithSize("a.bin", 256 * MEBIBYTE),
        fileWithSize("b.bin", 257 * MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 513.0MB, exceeding the 512MB limit. Please select fewer or smaller files.",
    });
  });

  it("honors the runtime window override injected by the static server", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__ = 8;
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__ = 8;

    expect(
      validateIndividualFileSizes([fileWithSize("ok.bin", 8 * MEBIBYTE)]),
    ).toEqual({ isValid: true });

    expect(
      validateIndividualFileSizes([fileWithSize("over.bin", 8 * MEBIBYTE + 1)]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 8MB are not allowed: over.bin",
      oversizedFiles: ["over.bin"],
    });
  });

  it("prefers the build-time env var over the runtime window override", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "4");
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__ = 8;
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__ = 8;

    expect(
      validateIndividualFileSizes([fileWithSize("over.bin", 5 * MEBIBYTE)]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 4MB are not allowed: over.bin",
      oversizedFiles: ["over.bin"],
    });
  });

  it("falls back to the default when the configured value is invalid", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "not-a-number");

    expect(
      validateIndividualFileSizes([fileWithSize("ok.bin", 200 * MEBIBYTE)]),
    ).toEqual({ isValid: true });

    expect(
      validateIndividualFileSizes([
        fileWithSize("over.bin", 200 * MEBIBYTE + 1),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 200MB are not allowed: over.bin",
      oversizedFiles: ["over.bin"],
    });
  });

  it("falls back to the default when the configured value is not positive", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "0");

    expect(
      validateIndividualFileSizes([fileWithSize("ok.bin", 200 * MEBIBYTE)]),
    ).toEqual({ isValid: true });
  });
});

describe("embedded image validation", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_TOTAL_MB", undefined);
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__;
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__;
  });

  it("accepts an image at the 3 MiB boundary and rejects one byte over it", () => {
    expect(
      validateEmbeddedImageSizes([
        fileWithSize("at-limit.png", THREE_MEBIBYTES),
      ]),
    ).toEqual({ isValid: true });

    expect(
      validateEmbeddedImageSizes([
        fileWithSize("over-limit.png", THREE_MEBIBYTES + 1),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Images exceeding 3MB are not allowed: over-limit.png. Upload them as files instead.",
      oversizedFiles: ["over-limit.png"],
    });
  });

  it("keeps the 3 MiB cap even when the upload ceiling is raised", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");

    expect(
      validateEmbeddedImageSizes([
        fileWithSize("over-limit.png", 4 * MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Images exceeding 3MB are not allowed: over-limit.png. Upload them as files instead.",
      oversizedFiles: ["over-limit.png"],
    });
  });

  it("accepts an oversized image on the workspace-file path", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");

    expect(
      validateIndividualFileSizes([fileWithSize("as-file.png", 4 * MEBIBYTE)]),
    ).toEqual({ isValid: true });
  });
});

describe("independent per-file and total limits", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", undefined);
    vi.stubEnv("VITE_MAX_ATTACHMENT_TOTAL_MB", undefined);
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_FILE_MB__;
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_MAX_ATTACHMENT_TOTAL_MB__;
  });

  it("raises only the per-file limit when only that one is configured", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", "512");

    expect(
      validateIndividualFileSizes([fileWithSize("ok.bin", 512 * MEBIBYTE)]),
    ).toEqual({ isValid: true });

    // The total limit keeps its default, so a 300 MiB selection is rejected.
    expect(
      validateTotalFileSize([fileWithSize("big.bin", 300 * MEBIBYTE)]),
    ).toEqual({
      isValid: false,
      errorMessage:
        "Total file size would be 300.0MB, exceeding the 200MB limit. Please select fewer or smaller files.",
    });
  });

  it("raises only the total limit when only that one is configured", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_TOTAL_MB", "512");

    expect(
      validateTotalFileSize([
        fileWithSize("a.bin", 256 * MEBIBYTE),
        fileWithSize("b.bin", 256 * MEBIBYTE),
      ]),
    ).toEqual({ isValid: true });

    // The per-file limit keeps its default.
    expect(
      validateIndividualFileSizes([
        fileWithSize("too-big.bin", 201 * MEBIBYTE),
      ]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 200MB are not allowed: too-big.bin",
      oversizedFiles: ["too-big.bin"],
    });
  });

  it("lets the shared limit apply to both when neither is set separately", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");

    expect(
      validateIndividualFileSizes([fileWithSize("ok.bin", 512 * MEBIBYTE)]),
    ).toEqual({ isValid: true });

    expect(
      validateTotalFileSize([
        fileWithSize("a.bin", 256 * MEBIBYTE),
        fileWithSize("b.bin", 256 * MEBIBYTE),
      ]),
    ).toEqual({ isValid: true });
  });

  it("lets the per-limit variables override the shared one", () => {
    vi.stubEnv("VITE_MAX_ATTACHMENT_SIZE_MB", "512");
    vi.stubEnv("VITE_MAX_ATTACHMENT_FILE_MB", "8");

    expect(
      validateIndividualFileSizes([fileWithSize("over.bin", 9 * MEBIBYTE)]),
    ).toEqual({
      isValid: false,
      errorMessage: "Files exceeding 8MB are not allowed: over.bin",
      oversizedFiles: ["over.bin"],
    });

    expect(
      validateTotalFileSize([
        fileWithSize("a.bin", 256 * MEBIBYTE),
        fileWithSize("b.bin", 256 * MEBIBYTE),
      ]),
    ).toEqual({ isValid: true });
  });
});
