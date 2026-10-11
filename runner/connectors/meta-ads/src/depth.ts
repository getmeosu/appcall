import { createMetaClient } from "./http";

// Graph v26.0 reads and writes that the origin handlers do not cover.
// Ad account ids accept a bare number or act_{id}. Other ids stay numeric
// so a campaign id is not rewritten into an ad account path.

type IdKind = "me" | "act" | "numeric" | "any";
type QueryAs = "str" | "num" | "bool" | "json" | "id_list";
type QueryField = { from: string; wire: string; as: QueryAs; required?: boolean };
type DepthSpec = {
  operation: string;
  idKind: IdKind;
  idField: string;
  edge: string;
  query: QueryField[];
};

const SPECS = [
  {
    "operation": "businesses.list",
    "idKind": "me",
    "idField": "",
    "edge": "businesses",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pages.accounts.list",
    "idKind": "me",
    "idField": "",
    "edge": "accounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "users.me.get",
    "idKind": "me",
    "idField": "",
    "edge": "",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "ad_accounts.query",
    "idKind": "me",
    "idField": "",
    "edge": "adaccounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "campaigns.query",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "campaigns",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "effectiveStatus",
        "wire": "effective_status",
        "as": "json",
        "required": false
      }
    ]
  },
  {
    "operation": "ads.query",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "ads",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "ad_videos.list",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "advideos",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "title",
        "wire": "title",
        "as": "str",
        "required": false
      },
      {
        "from": "maxWidth",
        "wire": "max_width",
        "as": "num",
        "required": false
      },
      {
        "from": "minWidth",
        "wire": "min_width",
        "as": "num",
        "required": false
      },
      {
        "from": "maxHeight",
        "wire": "max_height",
        "as": "num",
        "required": false
      },
      {
        "from": "minHeight",
        "wire": "min_height",
        "as": "num",
        "required": false
      },
      {
        "from": "maxLength",
        "wire": "max_length",
        "as": "num",
        "required": false
      },
      {
        "from": "minLength",
        "wire": "min_length",
        "as": "num",
        "required": false
      },
      {
        "from": "maxAspectRatio",
        "wire": "max_aspect_ratio",
        "as": "num",
        "required": false
      },
      {
        "from": "minAspectRatio",
        "wire": "min_aspect_ratio",
        "as": "num",
        "required": false
      }
    ]
  },
  {
    "operation": "pixels.list",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "adspixels",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "sortBy",
        "wire": "sort_by",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "custom_conversions.list",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "customconversions",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "subscribed_apps.list",
    "idKind": "act",
    "idField": "adAccountId",
    "edge": "subscribed_apps",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "activities.list",
    "idKind": "any",
    "idField": "objectId",
    "edge": "activities",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "since",
        "wire": "since",
        "as": "str",
        "required": false
      },
      {
        "from": "until",
        "wire": "until",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "objects.get",
    "idKind": "any",
    "idField": "objectId",
    "edge": "",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "datePreset",
        "wire": "date_preset",
        "as": "str",
        "required": false
      },
      {
        "from": "timeRange",
        "wire": "time_range",
        "as": "json",
        "required": false
      },
      {
        "from": "updatedSince",
        "wire": "updated_since",
        "as": "num",
        "required": false
      }
    ]
  },
  {
    "operation": "comments.list",
    "idKind": "numeric",
    "idField": "objectId",
    "edge": "comments",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "order",
        "wire": "order",
        "as": "str",
        "required": false
      },
      {
        "from": "filter",
        "wire": "filter",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "leads.list",
    "idKind": "numeric",
    "idField": "sourceObjectId",
    "edge": "leads",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "video_tags.list",
    "idKind": "numeric",
    "idField": "videoId",
    "edge": "tags",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "video_thumbnails.list",
    "idKind": "numeric",
    "idField": "videoId",
    "edge": "thumbnails",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pixels.stats.get",
    "idKind": "numeric",
    "idField": "pixelId",
    "edge": "stats",
    "query": [
      {
        "from": "aggregation",
        "wire": "aggregation",
        "as": "str",
        "required": false
      },
      {
        "from": "startTime",
        "wire": "start_time",
        "as": "str",
        "required": false
      },
      {
        "from": "endTime",
        "wire": "end_time",
        "as": "str",
        "required": false
      },
      {
        "from": "eventName",
        "wire": "event",
        "as": "str",
        "required": false
      },
      {
        "from": "eventSource",
        "wire": "event_source",
        "as": "str",
        "required": false
      },
      {
        "from": "agent",
        "wire": "agent",
        "as": "str",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "assigned_pages.list",
    "idKind": "numeric",
    "idField": "businessUserId",
    "edge": "assigned_pages",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "assigned_users.list",
    "idKind": "any",
    "idField": "assetId",
    "edge": "assigned_users",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "businessId",
        "wire": "business",
        "as": "str",
        "required": true
      }
    ]
  },
  {
    "operation": "agencies.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "agencies",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "business_ad_accounts.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_ad_accounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "business_invoices.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "business_invoices",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "type",
        "wire": "type",
        "as": "str",
        "required": false
      },
      {
        "from": "rootId",
        "wire": "root_id",
        "as": "str",
        "required": false
      },
      {
        "from": "invoiceId",
        "wire": "invoice_id",
        "as": "str",
        "required": false
      },
      {
        "from": "startDate",
        "wire": "start_date",
        "as": "str",
        "required": false
      },
      {
        "from": "endDate",
        "wire": "end_date",
        "as": "str",
        "required": false
      },
      {
        "from": "issueStartDate",
        "wire": "issue_start_date",
        "as": "str",
        "required": false
      },
      {
        "from": "issueEndDate",
        "wire": "issue_end_date",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "client_ad_accounts.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "client_ad_accounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "client_apps.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "client_apps",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "client_instagram_assets.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "client_instagram_assets",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "client_offsite_signal_containers.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "client_offsite_signal_container_business_objects",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "client_pages.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "client_pages",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "clients.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "clients",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "collaborative_ads.collaboration_requests.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "collaborative_ads_collaboration_requests",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "collaborative_ads.suggested_partners.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "collaborative_ads_suggested_partners",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "audience_sharing.initiated.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "initiated_audience_sharing_requests",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "managed_partner_ads.funding_source_details.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "managed_partner_ads_funding_source_details",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "owned_apps.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_apps",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "owned_businesses.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_businesses",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "owned_instagram_assets.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_instagram_assets",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "owned_offsite_signal_containers.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_offsite_signal_container_business_objects",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "owned_pages.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "owned_pages",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_client_ad_accounts.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_client_ad_accounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_client_apps.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_client_apps",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_client_pages.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_client_pages",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_offsite_signal_containers.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_shared_offsite_signal_container_business_objects",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_owned_ad_accounts.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_owned_ad_accounts",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_owned_pages.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_owned_pages",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "pending_users.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "pending_users",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "audience_sharing.received.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "received_audience_sharing_requests",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "system_users.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "system_users",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      }
    ]
  },
  {
    "operation": "ad_network_analytics.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "adnetworkanalytics",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "metrics",
        "wire": "metrics",
        "as": "json",
        "required": true
      }
    ]
  },
  {
    "operation": "ad_network_analytics.results.list",
    "idKind": "numeric",
    "idField": "businessId",
    "edge": "adnetworkanalytics_results",
    "query": [
      {
        "from": "fields",
        "wire": "fields",
        "as": "str",
        "required": false
      },
      {
        "from": "limit",
        "wire": "limit",
        "as": "num",
        "required": false
      },
      {
        "from": "after",
        "wire": "after",
        "as": "str",
        "required": false
      },
      {
        "from": "before",
        "wire": "before",
        "as": "str",
        "required": false
      },
      {
        "from": "queryId",
        "wire": "query_ids",
        "as": "id_list",
        "required": false
      }
    ]
  }
] as const satisfies readonly DepthSpec[];

type Auth = { accessToken: string; fetch?: typeof fetch };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function adAccountId(value: string, field = "adAccountId"): string {
  const raw = value.trim();
  const digits = raw.startsWith("act_") ? raw.slice(4) : raw;
  if (!/^\d+$/.test(digits)) throw new Error(`${field} must be numeric or act_{id}`);
  return `act_${digits}`;
}

function numericId(input: Record<string, unknown>, field: string): string {
  const value = requireString(input[field], field);
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be a numeric Graph id`);
  return value;
}

function anyId(input: Record<string, unknown>, field: string): string {
  const value = requireString(input[field], field);
  if (!/^(act_)?\d+$/.test(value)) throw new Error(`${field} must be a numeric Graph id`);
  return value;
}

function resourcePath(spec: DepthSpec, input: Record<string, unknown>): string {
  let base: string;
  if (spec.idKind === "me") base = "/me";
  else if (spec.idKind === "act") base = `/${adAccountId(requireString(input[spec.idField], spec.idField), spec.idField)}`;
  else if (spec.idKind === "numeric") base = `/${numericId(input, spec.idField)}`;
  else base = `/${anyId(input, spec.idField)}`;
  return spec.edge.length > 0 ? `${base}/${spec.edge}` : base;
}

function wireValue(value: unknown, as: QueryAs): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (as === "str") return typeof value === "string" ? value : undefined;
  if (as === "num") return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
  if (as === "bool") return typeof value === "boolean" ? String(value) : undefined;
  if (as === "json") {
    if (typeof value === "string") return value;
    if (typeof value === "object") return JSON.stringify(value);
    return undefined;
  }
  if (typeof value === "string" && value.length > 0) return JSON.stringify([value]);
  if (Array.isArray(value)) return JSON.stringify(value);
  return undefined;
}

function queryFrom(spec: DepthSpec, input: Record<string, unknown>): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const field of spec.query) {
    const value = input[field.from];
    if (field.required) {
      if (field.as === "json" && (!Array.isArray(value) || value.length === 0) && !isRecord(value)) {
        throw new Error(`${field.from} is required`);
      }
      if (field.as !== "json" && (value === undefined || value === null || value === "")) {
        throw new Error(`${field.from} is required`);
      }
    }
    const wired = wireValue(value, field.as);
    if (wired !== undefined) query[field.wire] = wired;
  }
  return query;
}

function handleError(result: { status: number; body: unknown }, label: string): never {
  const body = result.body;
  let message = `${label} failed with HTTP ${result.status}`;
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string" && body.error.message.length > 0) {
    message = body.error.message;
  }
  throw Object.assign(new Error(message), {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    status: result.status,
    providerError: body,
  });
}

async function graphGet(auth: Auth, operation: string, path: string, query: Record<string, string | undefined>): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  const url = qs ? `${path}?${qs}` : path;
  const result = await createMetaClient({ accessToken: auth.accessToken, fetch: auth.fetch, operation }).fetchJSON(url, {
    method: "GET",
  });
  if (result.status >= 200 && result.status < 300) return result.body;
  handleError(result, operation);
}

async function graphPostForm(auth: Auth, operation: string, path: string, fields: Record<string, unknown>): Promise<unknown> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") body.set(key, String(value));
    else body.set(key, JSON.stringify(value));
  }
  const result = await createMetaClient({ accessToken: auth.accessToken, fetch: auth.fetch, operation }).fetchJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (result.status >= 200 && result.status < 300) return result.body;
  handleError(result, operation);
}

async function graphPostJson(auth: Auth, operation: string, path: string, payload: Record<string, unknown>): Promise<unknown> {
  const result = await createMetaClient({ accessToken: auth.accessToken, fetch: auth.fetch, operation }).fetchJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (result.status >= 200 && result.status < 300) return result.body;
  handleError(result, operation);
}

function envelope(operation: string, body: unknown): Record<string, unknown> {
  const record = isRecord(body) ? body : undefined;
  const paging = record && isRecord(record.paging) ? record.paging : undefined;
  const cursors = paging && isRecord(paging.cursors) ? paging.cursors : undefined;
  const after = cursors && typeof cursors.after === "string" && cursors.after.length > 0 ? cursors.after : null;
  return {
    connector: "meta-ads",
    action: operation,
    source: "connector",
    data: body,
    id: record && typeof record.id === "string" ? record.id : undefined,
    nextCursor: after,
  };
}

function authOf(input: Record<string, unknown>): Auth {
  return { accessToken: requireString(input.accessToken, "accessToken"), fetch: input.fetch as typeof fetch | undefined };
}

async function executeSpec(input: unknown, spec: DepthSpec): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error(`${spec.operation} input must be an object`);
  const body = await graphGet(authOf(input), spec.operation, resourcePath(spec, input), queryFrom(spec, input));
  return envelope(spec.operation, body);
}

export function queryAdSets(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("ad_sets.query input must be an object");
  const path = `/${adAccountId(requireString(input.adAccountId, "adAccountId"))}/adsets`;
  const query: Record<string, string | undefined> = {};
  const fields = optionalString(input.fields);
  if (fields) query.fields = fields;
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) query.limit = String(input.limit);
  const after = optionalString(input.after);
  if (after) query.after = after;
  const datePreset = optionalString(input.datePreset);
  if (datePreset) query.date_preset = datePreset;
  if (typeof input.updatedSince === "number" && Number.isFinite(input.updatedSince)) query.updated_since = String(input.updatedSince);
  if (Array.isArray(input.effectiveStatus)) query.effective_status = JSON.stringify(input.effectiveStatus);
  if (typeof input.isCompleted === "boolean") query.is_completed = String(input.isCompleted);
  const since = optionalString(input.timeRangeSince);
  const until = optionalString(input.timeRangeUntil);
  if (since || until) {
    const range: Record<string, string> = {};
    if (since) range.since = since;
    if (until) range.until = until;
    query.time_range = JSON.stringify(range);
  }
  return graphGet(authOf(input), "ad_sets.query", path, query).then((body) => envelope("ad_sets.query", body));
}

export function generateAdPreviews(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("ad_previews.generate input must be an object");
  const path = `/${adAccountId(requireString(input.adAccountId, "adAccountId"))}/generatepreviews`;
  if (!isRecord(input.creative)) throw new Error("creative is required");
  const adFormat = requireString(input.adFormat, "adFormat");
  const query: Record<string, string | undefined> = {
    creative: JSON.stringify(input.creative),
    ad_format: adFormat,
  };
  if (isRecord(input.post)) query.post = JSON.stringify(input.post);
  if (typeof input.width === "number" && Number.isFinite(input.width)) query.width = String(input.width);
  if (typeof input.height === "number" && Number.isFinite(input.height)) query.height = String(input.height);
  for (const [from, wire] of [
    ["locale", "locale"],
    ["startDate", "start_date"],
    ["endDate", "end_date"],
    ["renderType", "render_type"],
    ["placePageId", "place_page_id"],
    ["creativeFeature", "creative_feature"],
    ["dynamicAssetLabel", "dynamic_asset_label"],
  ] as const) {
    const value = optionalString(input[from]);
    if (value) query[wire] = value;
  }
  if (Array.isArray(input.productItemIds)) query.product_item_ids = JSON.stringify(input.productItemIds);
  if (isRecord(input.dynamicCreativeSpec)) query.dynamic_creative_spec = JSON.stringify(input.dynamicCreativeSpec);
  if (isRecord(input.dynamicCustomization)) query.dynamic_customization = JSON.stringify(input.dynamicCustomization);
  return graphGet(authOf(input), "ad_previews.generate", path, query).then((body) => envelope("ad_previews.generate", body));
}

export function copyAdObject(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("ad_objects.copy input must be an object");
  const objectType = requireString(input.objectType, "objectType");
  if (objectType !== "campaign" && objectType !== "ad_set" && objectType !== "ad") {
    throw new Error("objectType must be campaign, ad_set, or ad");
  }
  const destination = optionalString(input.destinationParentId);
  if (objectType === "campaign" && destination) {
    throw new Error("destinationParentId is not supported for campaign copies");
  }
  const payload: Record<string, unknown> = {};
  const statusOption = optionalString(input.statusOption);
  if (statusOption) payload.status_option = statusOption;
  if (typeof input.deepCopy === "boolean") payload.deep_copy = input.deepCopy;
  const start = optionalString(input.startTime);
  if (start && objectType !== "ad") payload.start_time = start;
  const end = optionalString(input.endTime);
  if (end && objectType !== "ad") payload.end_time = end;
  if (isRecord(input.renameOptions)) payload.rename_options = input.renameOptions;
  if (objectType === "ad_set") {
    if (typeof input.createDcoAdset === "boolean") payload.create_dco_adset = input.createDcoAdset;
    if (destination) payload.campaign_id = destination;
  }
  if (objectType === "ad") {
    if (isRecord(input.creativeParameters)) payload.creative_parameters = input.creativeParameters;
    if (destination) payload.adset_id = destination;
  }
  if (objectType === "campaign") {
    if (isRecord(input.parameterOverrides)) payload.parameter_overrides = input.parameterOverrides;
    if (typeof input.migrateToAdvantagePlus === "boolean") payload.migrate_to_advantage_plus = input.migrateToAdvantagePlus;
  }
  const path = `/${anyId(input, "objectId")}/copies`;
  return graphPostForm(authOf(input), "ad_objects.copy", path, payload).then((body) => envelope("ad_objects.copy", body));
}

export function createCustomConversion(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("custom_conversions.create input must be an object");
  const payload: Record<string, unknown> = { name: requireString(input.name, "name") };
  const description = optionalString(input.description);
  if (description) payload.description = description;
  if (isRecord(input.rule)) payload.rule = input.rule;
  if (isRecord(input.advancedRule)) payload.advanced_rule = input.advancedRule;
  const eventSourceId = optionalString(input.eventSourceId);
  if (eventSourceId) payload.event_source_id = eventSourceId;
  const customEventType = optionalString(input.customEventType);
  if (customEventType) payload.custom_event_type = customEventType;
  const actionSourceType = optionalString(input.actionSourceType);
  if (actionSourceType) payload.action_source_type = actionSourceType;
  if (typeof input.defaultConversionValue === "number" && Number.isFinite(input.defaultConversionValue)) {
    payload.default_conversion_value = input.defaultConversionValue;
  }
  const path = `/${adAccountId(requireString(input.adAccountId, "adAccountId"))}/customconversions`;
  return graphPostForm(authOf(input), "custom_conversions.create", path, payload).then((body) => envelope("custom_conversions.create", body));
}

export function createLeadForm(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("lead_forms.create input must be an object");
  if (!Array.isArray(input.questions) || input.questions.length === 0) throw new Error("questions is required");
  const payload: Record<string, unknown> = {
    name: requireString(input.name, "name"),
    questions: input.questions,
  };
  const locale = optionalString(input.locale);
  if (locale) payload.locale = locale;
  const followUp = optionalString(input.followUpActionUrl);
  if (followUp) payload.follow_up_action_url = followUp;
  for (const [from, wire] of [
    ["contextCard", "context_card"],
    ["privacyPolicy", "privacy_policy"],
    ["thankYouPage", "thank_you_page"],
    ["customDisclaimer", "custom_disclaimer"],
    ["trackingParameters", "tracking_parameters"],
  ] as const) {
    if (isRecord(input[from])) payload[wire] = input[from];
  }
  if (typeof input.isOptimizedForQuality === "boolean") payload.is_optimized_for_quality = input.isOptimizedForQuality;
  if (typeof input.shouldEnforceWorkEmail === "boolean") payload.should_enforce_work_email = input.shouldEnforceWorkEmail;
  if (typeof input.blockDisplayForNonTargetedViewer === "boolean") {
    payload.block_display_for_non_targeted_viewer = input.blockDisplayForNonTargetedViewer;
  }
  const path = `/${numericId(input, "pageId")}/leadgen_forms`;
  return graphPostForm(authOf(input), "lead_forms.create", path, payload).then((body) => envelope("lead_forms.create", body));
}

export function sendConversionEvents(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error("conversion_events.send input must be an object");
  if (!Array.isArray(input.events) || input.events.length === 0) throw new Error("events is required");
  const testEventCode = optionalString(input.testEventCode);
  if (!testEventCode && input.confirmProduction !== true) {
    throw new Error("conversion_events.send requires testEventCode unless confirmProduction is true");
  }
  const payload: Record<string, unknown> = { data: input.events };
  if (testEventCode) payload.test_event_code = testEventCode;
  const partnerAgent = optionalString(input.partnerAgent);
  if (partnerAgent) payload.partner_agent = partnerAgent;
  const uploadId = optionalString(input.uploadId);
  if (uploadId) payload.upload_id = uploadId;
  const uploadTag = optionalString(input.uploadTag);
  if (uploadTag) payload.upload_tag = uploadTag;
  const uploadSource = optionalString(input.uploadSource);
  if (uploadSource) payload.upload_source = uploadSource;
  const namespaceId = optionalString(input.namespaceId);
  if (namespaceId) payload.namespace_id = namespaceId;
  const path = `/${numericId(input, "pixelOrDatasetId")}/events`;
  return graphPostJson(authOf(input), "conversion_events.send", path, payload).then((body) => envelope("conversion_events.send", body));
}

const genericHandlers = Object.fromEntries(
  SPECS.map((spec) => [spec.operation, (input: unknown) => executeSpec(input, spec)]),
);

export const depthHandlers: Record<string, (input: unknown) => Promise<Record<string, unknown>>> = {
  ...genericHandlers,
  "ad_sets.query": queryAdSets,
  "ad_previews.generate": generateAdPreviews,
  "ad_objects.copy": copyAdObject,
  "custom_conversions.create": createCustomConversion,
  "lead_forms.create": createLeadForm,
  "conversion_events.send": sendConversionEvents,
};
