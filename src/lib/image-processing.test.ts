import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { InvalidImageError, processImage, sniffImageKind } = await import("./image-processing");

async function jpegWithGps(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "UjiKamera", Model: "Model Uji", Copyright: "Pemilik Uji" },
      IFD3: {
        GPSLatitudeRef: "S",
        GPSLatitude: "6/1 21/1 3000/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "106/1 15/1 0/1",
      },
    })
    .toBuffer();
}

function contains(haystack: Buffer, needle: string): boolean {
  return haystack.includes(Buffer.from(needle, "latin1"));
}

describe("sniffImageKind", () => {
  it("recognizes JPEG, PNG, and WebP by their first bytes only", async () => {
    const base = sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } });
    expect(sniffImageKind(await base.clone().jpeg().toBuffer())).toBe("jpeg");
    expect(sniffImageKind(await base.clone().png().toBuffer())).toBe("png");
    expect(sniffImageKind(await base.clone().webp().toBuffer())).toBe("webp");
  });

  it("refuses SVG, GIF, PHP, and empty input", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(sniffImageKind(svg)).toBeNull();
    expect(sniffImageKind(gif)).toBeNull();
    expect(sniffImageKind(Buffer.from("<?php echo 'x'; ?>"))).toBeNull();
    expect(sniffImageKind(new Uint8Array())).toBeNull();
  });
});

describe("processImage", () => {
  it("refuses a PHP script renamed to .jpg (the name is never looked at)", async () => {
    await expect(processImage(Buffer.from("<?php system($_GET['c']); ?>"))).rejects.toThrow(
      new InvalidImageError("Foto harus berupa JPEG, PNG, atau WebP."),
    );
  });

  it("refuses SVG even though sharp itself could render it", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(processImage(svg)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("refuses more than 5 MB before decoding", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(processImage(big)).rejects.toThrow("Ukuran foto maksimal 5 MB.");
  });

  it("refuses a JPEG header glued onto something that isn't a JPEG", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("bukan gambar sama sekali")]);
    await expect(processImage(fake)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("strips EXIF including GPS: the stored file has no metadata at all", async () => {
    const input = await jpegWithGps();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(contains(input, "UjiKamera")).toBe(true);

    const output = await processImage(input);
    const after = await sharp(output.data).metadata();
    expect(output.kind).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(contains(output.data, "Exif")).toBe(false);
    expect(contains(output.data, "UjiKamera")).toBe(false);
    expect(contains(output.data, "Pemilik Uji")).toBe(false);
  });

  it("drops data appended after the image (a polyglot payload)", async () => {
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    const polyglot = Buffer.concat([image, Buffer.from("<?php system($_GET['c']); ?>")]);
    const output = await processImage(polyglot);
    expect(contains(output.data, "<?php")).toBe(false);
    expect(contains(output.data, "system(")).toBe(false);
  });

  it("caps the long edge at 2000 px and never enlarges", async () => {
    const large = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#abcdef" } }).png().toBuffer();
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#abcdef" } }).webp().toBuffer();

    const resized = await processImage(large);
    expect([resized.width, resized.height]).toEqual([2000, 1000]);
    expect(resized.kind).toBe("png");
    expect(resized.contentType).toBe("image/png");

    const kept = await processImage(small);
    expect([kept.width, kept.height]).toEqual([300, 200]);
    expect(kept.extension).toBe("webp");
  });

  it("applies the EXIF orientation before stripping it, so the photo stays upright", async () => {
    // 60x20 stored, orientation 6 (rotate 90° clockwise to display) → shown 20x60.
    const rotated = await sharp({ create: { width: 60, height: 20, channels: 3, background: "#fff" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const output = await processImage(rotated);
    expect([output.width, output.height]).toEqual([20, 60]);
    expect((await sharp(output.data).metadata()).orientation).toBeUndefined();
  });
});
