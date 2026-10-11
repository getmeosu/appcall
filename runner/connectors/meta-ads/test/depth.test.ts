import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { depthHandlers } from "../src/depth";
import { readFileSync } from "node:fs";

const TOKEN = "EAAB-test-token";

const COVERAGE: Array<{ slug: string; operation: string; origin: boolean }> = [
  {
    "slug": "METAADS_COPY_AD_OBJECT",
    "operation": "ad_objects.copy",
    "origin": false
  },
  {
    "slug": "METAADS_CREATE_AD",
    "operation": "ads.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_AD_CREATIVE",
    "operation": "ad_creatives.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_AD_SET",
    "operation": "ad_sets.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_AD_VIDEO",
    "operation": "ad_videos.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_CAMPAIGN",
    "operation": "campaigns.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_CUSTOM_AUDIENCE",
    "operation": "custom_audiences.create",
    "origin": true
  },
  {
    "slug": "METAADS_CREATE_CUSTOM_CONVERSION",
    "operation": "custom_conversions.create",
    "origin": false
  },
  {
    "slug": "METAADS_CREATE_LEAD_FORM",
    "operation": "lead_forms.create",
    "origin": false
  },
  {
    "slug": "METAADS_DELETE_CAMPAIGN",
    "operation": "campaigns.delete",
    "origin": true
  },
  {
    "slug": "METAADS_GENERATE_AD_PREVIEWS",
    "operation": "ad_previews.generate",
    "origin": false
  },
  {
    "slug": "METAADS_GET_AD_ACCOUNTS",
    "operation": "ad_accounts.query",
    "origin": false
  },
  {
    "slug": "METAADS_GET_AD_CREATIVE",
    "operation": "ad_creatives.get",
    "origin": true
  },
  {
    "slug": "METAADS_GET_INSIGHTS",
    "operation": "insights.get",
    "origin": true
  },
  {
    "slug": "METAADS_GET_OBJECT",
    "operation": "objects.get",
    "origin": false
  },
  {
    "slug": "METAADS_GET_PAGE_ACCOUNTS",
    "operation": "pages.accounts.list",
    "origin": false
  },
  {
    "slug": "METAADS_GET_PIXEL_EVENT_STATS",
    "operation": "pixels.stats.get",
    "origin": false
  },
  {
    "slug": "METAADS_GET_USER",
    "operation": "users.me.get",
    "origin": false
  },
  {
    "slug": "METAADS_GET_VIDEO",
    "operation": "ad_videos.get",
    "origin": true
  },
  {
    "slug": "METAADS_LIST_ACTIVITIES",
    "operation": "activities.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_AD_ACCOUNT_PIXELS",
    "operation": "pixels.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_AD_CREATIVES",
    "operation": "ad_creatives.list",
    "origin": true
  },
  {
    "slug": "METAADS_LIST_AD_IMAGES",
    "operation": "ad_images.list",
    "origin": true
  },
  {
    "slug": "METAADS_LIST_AD_NETWORK_ANALYTICS",
    "operation": "ad_network_analytics.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_AD_NETWORK_ANALYTICS_RESULTS",
    "operation": "ad_network_analytics.results.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_ADS",
    "operation": "ads.query",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_AD_VIDEOS",
    "operation": "ad_videos.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_AGENCIES",
    "operation": "agencies.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_ASSIGNED_PAGES",
    "operation": "assigned_pages.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_ASSIGNED_USERS",
    "operation": "assigned_users.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_BUSINESS_AD_ACCOUNTS",
    "operation": "business_ad_accounts.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_BUSINESSES",
    "operation": "businesses.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_BUSINESS_INVOICES",
    "operation": "business_invoices.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CAMPAIGNS",
    "operation": "campaigns.query",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENT_AD_ACCOUNTS",
    "operation": "client_ad_accounts.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENT_APPS",
    "operation": "client_apps.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENT_INSTAGRAM_ASSETS",
    "operation": "client_instagram_assets.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENT_OFFSITE_SIGNAL_CONTAINERS",
    "operation": "client_offsite_signal_containers.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENT_PAGES",
    "operation": "client_pages.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CLIENTS",
    "operation": "clients.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_COLLABORATIVE_ADS_COLLABORATION_REQUESTS",
    "operation": "collaborative_ads.collaboration_requests.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_COLLABORATIVE_ADS_SUGGESTED_PARTNERS",
    "operation": "collaborative_ads.suggested_partners.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_COMMENTS",
    "operation": "comments.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_CUSTOM_AUDIENCES",
    "operation": "custom_audiences.list",
    "origin": true
  },
  {
    "slug": "METAADS_LIST_CUSTOM_CONVERSIONS",
    "operation": "custom_conversions.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_INITIATED_AUDIENCE_SHARING_REQUESTS",
    "operation": "audience_sharing.initiated.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_LEADS",
    "operation": "leads.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_MANAGED_PARTNER_ADS_FUNDING_SOURCE_DETAILS",
    "operation": "managed_partner_ads.funding_source_details.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_OWNED_APPS",
    "operation": "owned_apps.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_OWNED_BUSINESSES",
    "operation": "owned_businesses.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_OWNED_INSTAGRAM_ASSETS",
    "operation": "owned_instagram_assets.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_OWNED_OFFSITE_SIGNAL_CONTAINER_BUSINESS_OBJECTS",
    "operation": "owned_offsite_signal_containers.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_OWNED_PAGES",
    "operation": "owned_pages.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_CLIENT_AD_ACCOUNTS",
    "operation": "pending_client_ad_accounts.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_CLIENT_APPS",
    "operation": "pending_client_apps.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_CLIENT_PAGES",
    "operation": "pending_client_pages.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_OFFSITE_SIGNAL_CONTAINERS",
    "operation": "pending_offsite_signal_containers.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_OWNED_AD_ACCOUNTS",
    "operation": "pending_owned_ad_accounts.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_OWNED_PAGES",
    "operation": "pending_owned_pages.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_PENDING_USERS",
    "operation": "pending_users.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_RECEIVED_AUDIENCE_SHARING_REQUESTS",
    "operation": "audience_sharing.received.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_SUBSCRIBED_APPS",
    "operation": "subscribed_apps.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_SYSTEM_USERS",
    "operation": "system_users.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_TARGETING_SEARCH",
    "operation": "targeting.search",
    "origin": true
  },
  {
    "slug": "METAADS_LIST_VIDEO_TAGS",
    "operation": "video_tags.list",
    "origin": false
  },
  {
    "slug": "METAADS_LIST_VIDEO_THUMBNAILS",
    "operation": "video_thumbnails.list",
    "origin": false
  },
  {
    "slug": "METAADS_PREVIEW_AD_CREATIVE",
    "operation": "ad_creatives.preview",
    "origin": true
  },
  {
    "slug": "METAADS_READ_ADSETS",
    "operation": "ad_sets.query",
    "origin": false
  },
  {
    "slug": "METAADS_SEND_CONVERSION_EVENTS",
    "operation": "conversion_events.send",
    "origin": false
  },
  {
    "slug": "METAADS_UPDATE_AD_CREATIVE",
    "operation": "ad_creatives.update",
    "origin": true
  },
  {
    "slug": "METAADS_UPDATE_CAMPAIGN",
    "operation": "campaigns.update",
    "origin": true
  },
  {
    "slug": "METAADS_UPLOAD_AD_IMAGE",
    "operation": "ad_images.upload",
    "origin": true
  }
];

const CASES: Array<{
  operation: string;
  method: "GET" | "POST";
  encoding: "none" | "form" | "json";
  input: Record<string, unknown>;
  pathname: string;
  query: Record<string, string>;
  form: Record<string, string> | null;
  json: Record<string, unknown> | null;
}> = [
  {
    "operation": "businesses.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "fields": "id,name",
      "limit": 25
    },
    "pathname": "/v26.0/me/businesses",
    "query": {
      "fields": "id,name",
      "limit": "25"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pages.accounts.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/me/accounts",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "users.me.get",
    "method": "GET",
    "encoding": "none",
    "input": {
      "fields": "id,name"
    },
    "pathname": "/v26.0/me",
    "query": {
      "fields": "id,name"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_accounts.query",
    "method": "GET",
    "encoding": "none",
    "input": {
      "fields": "id,name,account_status",
      "limit": 25
    },
    "pathname": "/v26.0/me/adaccounts",
    "query": {
      "fields": "id,name,account_status",
      "limit": "25"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "campaigns.query",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "fields": "id,name,status",
      "limit": 25,
      "effectiveStatus": [
        "ACTIVE"
      ]
    },
    "pathname": "/v26.0/act_123456789/campaigns",
    "query": {
      "fields": "id,name,status",
      "limit": "25",
      "effective_status": "[\"ACTIVE\"]"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ads.query",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "act_123456789",
      "fields": "id,name,status",
      "limit": 10
    },
    "pathname": "/v26.0/act_123456789/ads",
    "query": {
      "fields": "id,name,status",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_videos.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "title": "Launch",
      "minWidth": 600,
      "limit": 5
    },
    "pathname": "/v26.0/act_123456789/advideos",
    "query": {
      "limit": "5",
      "title": "Launch",
      "min_width": "600"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pixels.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "fields": "id,name",
      "sortBy": "last_fired_time"
    },
    "pathname": "/v26.0/act_123456789/adspixels",
    "query": {
      "fields": "id,name",
      "sort_by": "last_fired_time"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "custom_conversions.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "fields": "id,name,custom_event_type"
    },
    "pathname": "/v26.0/act_123456789/customconversions",
    "query": {
      "fields": "id,name,custom_event_type"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "subscribed_apps.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "limit": 20
    },
    "pathname": "/v26.0/act_123456789/subscribed_apps",
    "query": {
      "limit": "20"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "activities.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "objectId": "act_123456789",
      "since": "1700000000",
      "limit": 5
    },
    "pathname": "/v26.0/act_123456789/activities",
    "query": {
      "limit": "5",
      "since": "1700000000"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "objects.get",
    "method": "GET",
    "encoding": "none",
    "input": {
      "objectId": "23851234567890123",
      "fields": "id,name,status"
    },
    "pathname": "/v26.0/23851234567890123",
    "query": {
      "fields": "id,name,status"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "comments.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "objectId": "99887766",
      "order": "reverse_chronological",
      "limit": 10
    },
    "pathname": "/v26.0/99887766/comments",
    "query": {
      "limit": "10",
      "order": "reverse_chronological"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "leads.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "sourceObjectId": "444555666",
      "fields": "id,created_time,field_data",
      "limit": 25
    },
    "pathname": "/v26.0/444555666/leads",
    "query": {
      "fields": "id,created_time,field_data",
      "limit": "25"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "video_tags.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "videoId": "55667788",
      "limit": 10
    },
    "pathname": "/v26.0/55667788/tags",
    "query": {
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "video_thumbnails.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "videoId": "55667788",
      "fields": "id,uri,is_preferred",
      "limit": 5
    },
    "pathname": "/v26.0/55667788/thumbnails",
    "query": {
      "fields": "id,uri,is_preferred",
      "limit": "5"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pixels.stats.get",
    "method": "GET",
    "encoding": "none",
    "input": {
      "pixelId": "99887766",
      "aggregation": "event",
      "eventName": "Purchase"
    },
    "pathname": "/v26.0/99887766/stats",
    "query": {
      "aggregation": "event",
      "event": "Purchase"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "assigned_pages.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessUserId": "13579",
      "fields": "id,name"
    },
    "pathname": "/v26.0/13579/assigned_pages",
    "query": {
      "fields": "id,name"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "assigned_users.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "assetId": "act_123456789",
      "businessId": "777888999",
      "limit": 25
    },
    "pathname": "/v26.0/act_123456789/assigned_users",
    "query": {
      "limit": "25",
      "business": "777888999"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "agencies.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/agencies",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "business_ad_accounts.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_ad_accounts",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "business_invoices.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10,
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    },
    "pathname": "/v26.0/777888999/business_invoices",
    "query": {
      "fields": "id,name",
      "limit": "10",
      "start_date": "2024-01-01",
      "end_date": "2024-01-31"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "client_ad_accounts.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/client_ad_accounts",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "client_apps.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/client_apps",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "client_instagram_assets.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/client_instagram_assets",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "client_offsite_signal_containers.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/client_offsite_signal_container_business_objects",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "client_pages.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/client_pages",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "clients.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/clients",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "collaborative_ads.collaboration_requests.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/collaborative_ads_collaboration_requests",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "collaborative_ads.suggested_partners.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/collaborative_ads_suggested_partners",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "audience_sharing.initiated.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/initiated_audience_sharing_requests",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "managed_partner_ads.funding_source_details.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/managed_partner_ads_funding_source_details",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "owned_apps.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_apps",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "owned_businesses.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_businesses",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "owned_instagram_assets.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_instagram_assets",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "owned_offsite_signal_containers.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_offsite_signal_container_business_objects",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "owned_pages.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/owned_pages",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_client_ad_accounts.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_client_ad_accounts",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_client_apps.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_client_apps",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_client_pages.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_client_pages",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_offsite_signal_containers.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_shared_offsite_signal_container_business_objects",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_owned_ad_accounts.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_owned_ad_accounts",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_owned_pages.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_owned_pages",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "pending_users.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/pending_users",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "audience_sharing.received.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/received_audience_sharing_requests",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "system_users.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10
    },
    "pathname": "/v26.0/777888999/system_users",
    "query": {
      "fields": "id,name",
      "limit": "10"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_network_analytics.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10,
      "metrics": [
        "fb_ad_network_imp",
        "fb_ad_network_click"
      ]
    },
    "pathname": "/v26.0/777888999/adnetworkanalytics",
    "query": {
      "fields": "id,name",
      "limit": "10",
      "metrics": "[\"fb_ad_network_imp\",\"fb_ad_network_click\"]"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_network_analytics.results.list",
    "method": "GET",
    "encoding": "none",
    "input": {
      "businessId": "777888999",
      "fields": "id,name",
      "limit": 10,
      "queryId": "q_123"
    },
    "pathname": "/v26.0/777888999/adnetworkanalytics_results",
    "query": {
      "fields": "id,name",
      "limit": "10",
      "query_ids": "[\"q_123\"]"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_sets.query",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "123456789",
      "fields": "id,name",
      "limit": 5,
      "effectiveStatus": [
        "ACTIVE"
      ],
      "isCompleted": false,
      "timeRangeSince": "2024-01-01",
      "timeRangeUntil": "2024-01-31"
    },
    "pathname": "/v26.0/act_123456789/adsets",
    "query": {
      "fields": "id,name",
      "limit": "5",
      "effective_status": "[\"ACTIVE\"]",
      "is_completed": "false",
      "time_range": "{\"since\":\"2024-01-01\",\"until\":\"2024-01-31\"}"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_previews.generate",
    "method": "GET",
    "encoding": "none",
    "input": {
      "adAccountId": "act_123456789",
      "creative": {
        "object_story_spec": {
          "page_id": "112233"
        }
      },
      "adFormat": "MOBILE_FEED_STANDARD",
      "productItemIds": [
        "p1"
      ]
    },
    "pathname": "/v26.0/act_123456789/generatepreviews",
    "query": {
      "creative": "{\"object_story_spec\":{\"page_id\":\"112233\"}}",
      "ad_format": "MOBILE_FEED_STANDARD",
      "product_item_ids": "[\"p1\"]"
    },
    "form": null,
    "json": null
  },
  {
    "operation": "ad_objects.copy",
    "method": "POST",
    "encoding": "form",
    "input": {
      "objectId": "23851234567890123",
      "objectType": "ad_set",
      "statusOption": "PAUSED",
      "deepCopy": true,
      "destinationParentId": "555",
      "renameOptions": {
        "rename_strategy": "ONLY_TOP_LEVEL_RENAME",
        "rename_prefix": "Copy "
      },
      "createDcoAdset": false
    },
    "pathname": "/v26.0/23851234567890123/copies",
    "query": {},
    "form": {
      "status_option": "PAUSED",
      "deep_copy": "true",
      "campaign_id": "555",
      "rename_options": "{\"rename_strategy\":\"ONLY_TOP_LEVEL_RENAME\",\"rename_prefix\":\"Copy \"}",
      "create_dco_adset": "false"
    },
    "json": null
  },
  {
    "operation": "custom_conversions.create",
    "method": "POST",
    "encoding": "form",
    "input": {
      "adAccountId": "123456789",
      "name": "Checkout",
      "customEventType": "PURCHASE",
      "rule": {
        "url": {
          "i_contains": "checkout"
        }
      },
      "defaultConversionValue": 12
    },
    "pathname": "/v26.0/act_123456789/customconversions",
    "query": {},
    "form": {
      "name": "Checkout",
      "custom_event_type": "PURCHASE",
      "rule": "{\"url\":{\"i_contains\":\"checkout\"}}",
      "default_conversion_value": "12"
    },
    "json": null
  },
  {
    "operation": "lead_forms.create",
    "method": "POST",
    "encoding": "form",
    "input": {
      "pageId": "1122334455",
      "name": "Spring leads",
      "questions": [
        {
          "type": "EMAIL",
          "key": "email"
        }
      ],
      "locale": "EN_US",
      "isOptimizedForQuality": true
    },
    "pathname": "/v26.0/1122334455/leadgen_forms",
    "query": {},
    "form": {
      "name": "Spring leads",
      "questions": "[{\"type\":\"EMAIL\",\"key\":\"email\"}]",
      "locale": "EN_US",
      "is_optimized_for_quality": "true"
    },
    "json": null
  },
  {
    "operation": "conversion_events.send",
    "method": "POST",
    "encoding": "json",
    "input": {
      "pixelOrDatasetId": "99887766",
      "events": [
        {
          "event_name": "Purchase",
          "event_time": 1710000000,
          "action_source": "website"
        }
      ],
      "testEventCode": "TEST123",
      "partnerAgent": "appcall"
    },
    "pathname": "/v26.0/99887766/events",
    "query": {},
    "form": null,
    "json": {
      "data": [
        {
          "event_name": "Purchase",
          "event_time": 1710000000,
          "action_source": "website"
        }
      ],
      "test_event_code": "TEST123",
      "partner_agent": "appcall"
    }
  }
];

function stubFetch(body: unknown) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function fixtureFor(operation: string): unknown {
  const name = operation.replaceAll(".", "_");
  return JSON.parse(readFileSync(new URL(`../fixtures/depth_${name}.json`, import.meta.url), "utf8"));
}

describe("meta-ads full depth", () => {
  test("covers every live Composio METAADS tool with an HTTP operation", () => {
    expect(COVERAGE).toHaveLength(72);
    const slugs = new Set(COVERAGE.map((row) => row.slug));
    expect(slugs.size).toBe(72);
    for (const row of COVERAGE) {
      expect(Object.hasOwn(manifest.operations, row.operation)).toBe(true);
      if (row.origin) expect(depthHandlers[row.operation]).toBeUndefined();
      else expect(typeof depthHandlers[row.operation]).toBe("function");
    }
  });

  test("action contracts keep titles, object schemas, and response budgets", () => {
    const ops = manifest.operations as Record<string, {
      kind?: string;
      title?: string;
      description?: string;
      inputSchema?: { type?: string };
      maxInputBytes?: number;
      maxResponseBytes?: number;
      sideEffect?: string;
    }>;
    for (const [id, op] of Object.entries(ops)) {
      expect(op.maxResponseBytes ?? 0).toBeGreaterThanOrEqual(op.maxInputBytes ?? 0);
      if (op.kind !== "action") continue;
      expect(op.title, id).toBeTruthy();
      expect(op.description, id).toBeTruthy();
      expect(op.inputSchema?.type, id).toBe("object");
    }
    expect(JSON.stringify(manifest).includes("Idempotent")).toBe(false);
  });

  for (const spec of CASES) {
    test(`${spec.operation} ${spec.method} ${spec.pathname}`, async () => {
      const fixture = fixtureFor(spec.operation);
      const { calls, impl } = stubFetch(fixture);
      const result = await depthHandlers[spec.operation]! ({ ...spec.input, accessToken: TOKEN, fetch: impl });
      expect(calls).toHaveLength(1);
      const request = calls[0]!;
      const url = new URL(request.url);
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.pathname).toBe(spec.pathname);
      expect(request.method).toBe(spec.method);
      expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      for (const [key, value] of Object.entries(spec.query)) {
        expect(url.searchParams.get(key)).toBe(value);
      }
      if (spec.method === "GET") {
        expect(request.headers.get("content-type")).toBeNull();
        expect(result.nextCursor).toBe("CURSOR");
      } else {
        const raw = await request.text();
        expect(raw.length).toBeGreaterThan(0);
        if (spec.encoding === "json") {
          expect(request.headers.get("content-type")).toBe("application/json");
          expect(JSON.parse(raw)).toEqual(spec.json);
        } else {
          expect(request.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
          const params = new URLSearchParams(raw);
          for (const [key, value] of Object.entries(spec.form ?? {})) expect(params.get(key)).toBe(value);
        }
        expect(result.id).toBe((fixture as { id: string }).id);
      }
      expect(result.connector).toBe("meta-ads");
      expect(result.action).toBe(spec.operation);
      expect(result.source).toBe("connector");
    });
  }

  function settle(run: () => unknown): Promise<unknown> {
    return Promise.resolve().then(run);
  }

  test("rejects path injection before fetching", async () => {
    const { calls, impl } = stubFetch({ data: [] });
    await expect(settle(() => depthHandlers["agencies.list"]!({ accessToken: TOKEN, businessId: "../evil", fetch: impl }))).rejects.toThrow(/businessId/);
    await expect(settle(() => depthHandlers["campaigns.query"]!({ accessToken: TOKEN, adAccountId: "act_../x", fetch: impl }))).rejects.toThrow(/adAccountId/);
    expect(calls).toHaveLength(0);
  });

  test("campaign copies reject a destination parent", async () => {
    const { calls, impl } = stubFetch({ id: "1" });
    await expect(settle(() => depthHandlers["ad_objects.copy"]!({
      accessToken: TOKEN,
      objectId: "11",
      objectType: "campaign",
      destinationParentId: "22",
      fetch: impl,
    }))).rejects.toThrow(/destinationParentId/);
    expect(calls).toHaveLength(0);
  });

  test("conversion events stay in test mode unless production is confirmed", async () => {
    const { calls, impl } = stubFetch({ events_received: 1 });
    await expect(settle(() => depthHandlers["conversion_events.send"]!({
      accessToken: TOKEN,
      pixelOrDatasetId: "99887766",
      events: [{ event_name: "Purchase" }],
      fetch: impl,
    }))).rejects.toThrow(/testEventCode/);
    expect(calls).toHaveLength(0);
    const ok = await depthHandlers["conversion_events.send"]!({
      accessToken: TOKEN,
      pixelOrDatasetId: "99887766",
      events: [{ event_name: "Purchase", event_time: 1, action_source: "website" }],
      confirmProduction: true,
      fetch: impl,
    });
    expect(ok.action).toBe("conversion_events.send");
    const body = JSON.parse(await calls[0]!.text());
    expect(body.test_event_code).toBeUndefined();
    expect(body.confirmProduction).toBeUndefined();
    expect(body.data).toHaveLength(1);
  });
});
