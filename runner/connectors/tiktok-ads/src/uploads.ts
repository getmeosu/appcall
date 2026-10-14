type UploadInput = Record<string, unknown>;

const SKIPPED_INPUTS = new Set([
  "accessToken",
  "fetch",
  "fileBase64",
  "fileName",
  "fileBase64Secondary",
  "fileNameSecondary",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendFile(form: FormData, field: string, encoded: unknown, fileName: unknown): void {
  if (typeof encoded !== "string" || encoded.length === 0) return;
  const bytes = Buffer.from(encoded, "base64");
  const name = typeof fileName === "string" && fileName.length > 0 ? fileName : "upload.bin";
  form.append(field, new Blob([bytes]), name);
}

export function createTikTokMultipartUpload(action: string, path: string, fileField: string, secondaryField?: string) {
  return async (input: UploadInput) => {
    const accessToken = input.accessToken;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw { ok: false, code: "INVALID_ACTION_INPUT", message: "accessToken is required" };
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) {
      if (SKIPPED_INPUTS.has(key) || value == null) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        form.append(key, String(value));
      }
    }
    appendFile(form, fileField, input.fileBase64, input.fileName);
    if (secondaryField) appendFile(form, secondaryField, input.fileBase64Secondary, input.fileNameSecondary);
    const fetchImpl = (typeof input.fetch === "function" ? input.fetch : fetch) as typeof fetch;
    const response = await fetchImpl(`https://business-api.tiktok.com/open_api/v1.3${path}`, {
      method: "POST",
      headers: { "Access-Token": accessToken },
      body: form,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    if (isRecord(parsed) && "code" in parsed && parsed.code !== 0) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: typeof parsed.message === "string" ? parsed.message : "TikTok Ads rejected the request.",
      };
    }
    return {
      connector: "tiktok-ads",
      action,
      source: "connector",
      data: isRecord(parsed) && "data" in parsed ? parsed.data : parsed,
    };
  };
}

export const uploadAdVideo = createTikTokMultipartUpload("files.video.upload", "/file/video/ad/upload/", "video_file");
export const uploadAdImage = createTikTokMultipartUpload("files.image.upload", "/file/image/ad/upload/", "image_file");
export const uploadMusic = createTikTokMultipartUpload("files.music.upload", "/file/music/upload/", "music_file");
export const uploadTemporaryFile = createTikTokMultipartUpload("files.temporary.upload", "/file/temporarily/upload/", "file");
export const uploadCustomAudienceFile = createTikTokMultipartUpload("custom_audiences.file.upload", "/dmp/custom_audience/file/upload/", "file");
export const uploadCatalogProductSet = createTikTokMultipartUpload("catalogs.product_sets.upload", "/catalog/set/upload/", "file");
export const uploadBcImage = createTikTokMultipartUpload("bc.image.upload", "/bc/image/upload/", "image_file");
export const uploadPlayable = createTikTokMultipartUpload("playables.upload", "/playable/upload/", "playable_package");
export const uploadFileChunk = createTikTokMultipartUpload("files.transfer.upload", "/file/transfer/upload/", "file");
export const createOrganizationAccount = createTikTokMultipartUpload("bc.organization_accounts.create", "/bc/oa/create/", "profile_image");
export const uploadAccountVerification = createTikTokMultipartUpload(
  "account.verification.upload",
  "/account/verification/upload/",
  "image_file1",
  "image_file2",
);
