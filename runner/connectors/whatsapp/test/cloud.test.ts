import { describe, expect, test } from "bun:test";
import getMessageFixture from "../fixtures/get_message.json";
import templatesFixture from "../fixtures/templates.json";
import mediaFixture from "../fixtures/media.json";
import mediaUploadFixture from "../fixtures/media_upload.json";
import mediaDeleteFixture from "../fixtures/media_delete.json";
import sendAudioFixture from "../fixtures/send_audio.json";
import sendVideoFixture from "../fixtures/send_video.json";
import businessProfileFixture from "../fixtures/business_profile.json";
import phoneNumberFixture from "../fixtures/phone_number.json";
import {
  validateGetMessageInput, createGetMessageClient,
  validateListTemplatesInput, createListTemplatesClient,
  validateGetMediaInput, createGetMediaClient,
  validateUploadMediaInput, createUploadMediaClient,
  validateDeleteMediaInput, createDeleteMediaClient,
  validateSendAudioInput, createSendAudioClient,
  validateSendVideoInput, createSendVideoClient,
  validateGetBusinessProfileInput, createGetBusinessProfileClient,
  validateUpdateBusinessProfileInput, createUpdateBusinessProfileClient,
  validateGetPhoneNumberInput, createGetPhoneNumberClient,
} from "../src/cloud";
import {
  getMessage, listTemplates, getMedia, uploadMedia, deleteMedia,
  sendAudio, sendVideo, getBusinessProfile, updateBusinessProfile, getPhoneNumber,
} from "../src/actions";
import manifest from "../manifest.json";

describe("whatsapp depth slice", () => {
  test("bumps the connector to a minor version for the new surface", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  test("declares the depth-slice action keys with object input schemas", () => {
    for (const key of [
      "messages.get",
      "templates.list",
      "media.get",
      "media.upload",
      "media.delete",
      "messages.sendAudio",
      "messages.sendVideo",
      "businessProfile.get",
      "businessProfile.update",
      "phoneNumbers.get",
    ]) {
      const operation = (manifest.operations as Record<string, Record<string, unknown>>)[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind).toBe("action");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(String(operation.description).length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
    }
  });

  test("messages.get fetches a Graph message node", async () => {
    expect(() => validateGetMessageInput({ phoneNumberId: "123" })).toThrow("messageId is required");
    const requests: Request[] = [];
    const client = createGetMessageClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(getMessageFixture);
      },
    });
    const result = await client.getMessage({ phoneNumberId: "123456789", messageId: getMessageFixture.id });
    expect(requests[0]!.url).toBe(`https://graph.facebook.com/v25.0/${getMessageFixture.id}`);
    expect(requests[0]!.method).toBe("GET");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toEqual(getMessageFixture);
  });

  test("templates.list reads WABA message templates", async () => {
    expect(() => validateListTemplatesInput({ phoneNumberId: "123" })).toThrow("wabaId is required");
    const requests: Request[] = [];
    const client = createListTemplatesClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(templatesFixture);
      },
    });
    const result = await client.listTemplates({ phoneNumberId: "123456789", wabaId: "WABA123", limit: 20 });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v25.0/WABA123/message_templates");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.templates).toEqual(templatesFixture.data);
  });

  test("media.get returns metadata without fetching CDN bytes", async () => {
    const requests: Request[] = [];
    const client = createGetMediaClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(mediaFixture);
      },
    });
    const result = await client.getMedia({ phoneNumberId: "123456789", mediaId: "123456789012345" });
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v25.0/123456789012345");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.media).toEqual(mediaFixture);
      expect(JSON.stringify(result)).not.toContain("lookaside");
    }
  });

  test("media.upload posts multipart form data and returns a media id", async () => {
    const fileBase64 = Buffer.from("hello-audio").toString("base64");
    expect(() => validateUploadMediaInput({ phoneNumberId: "123", filename: "a.ogg", mimeType: "audio/ogg" })).toThrow();
    const requests: Request[] = [];
    const client = createUploadMediaClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(mediaUploadFixture);
      },
    });
    const result = await client.uploadMedia({
      phoneNumberId: "123456789",
      filename: "voice.ogg",
      mimeType: "audio/ogg",
      fileBase64,
    });
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v25.0/123456789/media");
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.headers.get("content-type") ?? "").toContain("multipart/form-data");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mediaId).toBe(mediaUploadFixture.id);
  });

  test("media.delete deletes an uploaded media id", async () => {
    const requests: Request[] = [];
    const client = createDeleteMediaClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(mediaDeleteFixture);
      },
    });
    const result = await client.deleteMedia({ phoneNumberId: "123456789", mediaId: "123456789012345" });
    expect(requests[0]!.method).toBe("DELETE");
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v25.0/123456789012345");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.success).toBe(true);
  });

  test("messages.sendAudio and messages.sendVideo post link payloads", async () => {
    const audioRequests: Request[] = [];
    const audioClient = createSendAudioClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        audioRequests.push(new Request(input, init));
        return Response.json(sendAudioFixture);
      },
    });
    const audio = await audioClient.sendAudio({
      phoneNumberId: "123456789",
      to: "15551234567",
      audioUrl: "https://example.com/voice.ogg",
    });
    expect(await audioRequests[0]!.json()).toMatchObject({
      messaging_product: "whatsapp",
      type: "audio",
      audio: { link: "https://example.com/voice.ogg" },
    });
    expect(audio.ok).toBe(true);

    const videoRequests: Request[] = [];
    const videoClient = createSendVideoClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        videoRequests.push(new Request(input, init));
        return Response.json(sendVideoFixture);
      },
    });
    const video = await videoClient.sendVideo({
      phoneNumberId: "123456789",
      to: "15551234567",
      videoUrl: "https://example.com/clip.mp4",
      caption: "clip",
    });
    expect(await videoRequests[0]!.json()).toMatchObject({
      type: "video",
      video: { link: "https://example.com/clip.mp4", caption: "clip" },
    });
    expect(video.ok).toBe(true);
  });

  test("businessProfile.get and update read/write the Cloud API profile", async () => {
    const getRequests: Request[] = [];
    const getClient = createGetBusinessProfileClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        getRequests.push(new Request(input, init));
        return Response.json(businessProfileFixture);
      },
    });
    const profile = await getClient.getBusinessProfile({ phoneNumberId: "123456789" });
    expect(getRequests[0]!.url).toContain("/v25.0/123456789/whatsapp_business_profile");
    expect(profile.ok).toBe(true);
    if (profile.ok) expect(profile.profile).toEqual(businessProfileFixture.data[0]);

    const updateRequests: Request[] = [];
    const updateClient = createUpdateBusinessProfileClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        updateRequests.push(new Request(input, init));
        return Response.json({ success: true });
      },
    });
    const updated = await updateClient.updateBusinessProfile({
      phoneNumberId: "123456789",
      about: "Acme support",
    });
    expect(updateRequests[0]!.method).toBe("POST");
    expect(await updateRequests[0]!.json()).toMatchObject({
      messaging_product: "whatsapp",
      about: "Acme support",
    });
    expect(updated.ok).toBe(true);
  });

  test("phoneNumbers.get reads the phone number resource", async () => {
    const requests: Request[] = [];
    const client = createGetPhoneNumberClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(phoneNumberFixture);
      },
    });
    const result = await client.getPhoneNumber({ phoneNumberId: "123456789" });
    expect(requests[0]!.url).toStartWith("https://graph.facebook.com/v25.0/123456789");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.phoneNumber).toEqual(phoneNumberFixture);
  });

  test("action wrappers mark connector-owned output without a token", () => {
    expect(getMessage({ phoneNumberId: "123456789", messageId: "wamid.1" })).toMatchObject({
      connector: "whatsapp",
      action: "messages.get",
      source: "connector",
    });
    expect(listTemplates({ phoneNumberId: "123456789", wabaId: "WABA123" })).toMatchObject({
      action: "templates.list",
      source: "connector",
    });
    expect(getMedia({ phoneNumberId: "123456789", mediaId: "1" })).toMatchObject({ action: "media.get" });
    expect(uploadMedia({
      phoneNumberId: "123456789",
      filename: "voice.ogg",
      mimeType: "audio/ogg",
      fileBase64: Buffer.from("x").toString("base64"),
    })).toMatchObject({ action: "media.upload" });
    expect(deleteMedia({ phoneNumberId: "123456789", mediaId: "1" })).toMatchObject({ action: "media.delete" });
    expect(sendAudio({ phoneNumberId: "123456789", to: "15551234567", audioUrl: "https://example.com/a.ogg" })).toMatchObject({
      action: "messages.sendAudio",
    });
    expect(sendVideo({ phoneNumberId: "123456789", to: "15551234567", videoUrl: "https://example.com/v.mp4" })).toMatchObject({
      action: "messages.sendVideo",
    });
    expect(getBusinessProfile({ phoneNumberId: "123456789" })).toMatchObject({ action: "businessProfile.get" });
    expect(updateBusinessProfile({ phoneNumberId: "123456789", about: "hi" })).toMatchObject({
      action: "businessProfile.update",
    });
    expect(getPhoneNumber({ phoneNumberId: "123456789" })).toMatchObject({ action: "phoneNumbers.get" });
  });
});
