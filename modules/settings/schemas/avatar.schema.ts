import { z } from "zod";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const avatarSchema = z.custom<File>((value) => value instanceof File, {
  message: "Choose an image file.",
}).refine((file) => file.size > 0, "Choose an image file.")
  .refine((file) => file.size <= AVATAR_MAX_BYTES, "Avatar must be 5 MB or smaller.")
  .refine(
    (file) => AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number]),
    "Use a JPEG, PNG, or WebP image.",
  );

export async function hasValidAvatarSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}
