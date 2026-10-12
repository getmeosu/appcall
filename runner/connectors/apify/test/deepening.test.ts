import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import resourceFixture from "../fixtures/deepened_resource.json";
import listFixture from "../fixtures/deepened_list.json";
import itemsFixture from "../fixtures/deepened_items.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const added = ["actors.create", "actors.update", "actors.delete", "actors.webhooks.list", "actors.versions.list", "actors.versions.create", "actors.versions.get", "actors.versions.update", "actors.versions.delete", "actors.versions.env_vars.list", "actors.versions.env_vars.create", "actors.versions.env_vars.get", "actors.versions.env_vars.update", "actors.versions.env_vars.delete", "actors.builds.create", "actors.builds.list", "actors.builds.default", "actors.runs.last", "actors.runs.last.dataset_items", "actor.run_sync", "actor.run_sync_get", "actor.run_sync_get_dataset_items_get", "actor_builds.list", "actor_builds.get", "actor_builds.delete", "actor_builds.abort", "actor_builds.log", "actor_builds.openapi", "runs.delete", "runs.update", "runs.resurrect", "runs.list_user", "runs.dataset_items", "runs.default_dataset", "runs.default_key_value_store", "runs.default_request_queue", "tasks.create", "tasks.update", "tasks.delete", "tasks.runs.last", "tasks.runs.last.dataset_items", "tasks.runs.list", "tasks.webhooks.list", "tasks.input.get", "tasks.input.update", "task.run_sync", "task.run_sync_get", "task.run_sync_get_dataset_items_post", "datasets.update", "datasets.statistics", "key_value_stores.create", "key_value_stores.delete", "key_value_stores.update", "key_value_store.head_record", "request_queues.create", "request_queues.get", "request_queues.update", "request_queues.delete", "request_queues.head", "request_queues.head.lock", "request_queues.requests.list", "request_queues.requests.add", "request_queues.requests.get", "request_queues.requests.update", "request_queues.requests.delete", "request_queues.requests.lock.delete", "request_queues.requests.lock.prolong", "request_queues.requests.batch_add", "request_queues.requests.batch_delete", "request_queues.requests.unlock", "schedules.list", "schedules.create", "schedules.get", "schedules.update", "schedules.delete", "schedules.log", "webhooks.create", "webhooks.get", "webhooks.update", "webhooks.delete", "webhooks.test", "webhooks.dispatches.list", "webhook_dispatches.list", "webhook_dispatches.get", "users.get", "users.me.limits.get", "users.me.limits.update", "users.me.usage.monthly", "store.list", "discover.g2_products", "reports.carfax_by_vin", "reports.us_fuel_price_averages", "scrape.amazon_product_details", "scrape.amazon_reviews", "scrape.booking_reviews", "scrape.facebook_ads", "scrape.facebook_comments", "scrape.facebook_events", "scrape.facebook_group_posts", "scrape.facebook_pages", "scrape.facebook_photos", "scrape.facebook_posts", "scrape.facebook_reels", "scrape.facebook_reviews", "scrape.g2_reviews", "scrape.google_maps_places", "scrape.google_maps_reviews", "scrape.indeed_jobs", "scrape.instagram_comments", "scrape.instagram_hashtags", "scrape.instagram_mentions", "scrape.instagram_posts", "scrape.instagram_profiles", "scrape.instagram_reels", "scrape.linkedin_companies", "scrape.linkedin_company_employees", "scrape.linkedin_profile_posts", "scrape.linkedin_profiles", "scrape.snapchat_profiles", "scrape.snapchat_spotlight", "scrape.tik_tok_ads", "scrape.tik_tok_comments", "scrape.tik_tok_posts", "scrape.tik_tok_video", "scrape.tripadvisor_reviews", "scrape.trustpilot_reviews", "scrape.twitter_posts", "scrape.website_traffic_insights", "scrape.yelp_reviews", "scrape.youtube_comments", "scrape.youtube_videos", "scrape.youtube_video_transcripts", "scrape.zillow_property_details", "search.aliexpress_products", "search.amazon_products", "search.booking_properties", "search.eventbrite_events", "search.facebook_marketplace", "search.google", "search.google_images", "search.google_news", "search.google_shopping", "search.instagram", "search.jobs_across_sites", "search.linkedin_companies", "search.linkedin_jobs", "search.linkedin_posts", "search.linkedin_profiles", "search.linkedin_profiles_by_name", "search.linkedin_profiles_by_services", "search.local_fuel_prices", "search.tik_tok_users", "search.tripadvisor_places", "search.upwork_jobs", "search.yandex_market_products", "search.zillow_properties"] as const;
const restRoutes = [{"id": "actors.create", "method": "POST", "path": "/v2/actors", "input": {"name": "value"}, "status": 200}, {"id": "actors.update", "method": "PUT", "path": "/v2/actors/apify~web-scraper", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.delete", "method": "DELETE", "path": "/v2/actors/apify~web-scraper", "input": {"actorId": "apify~web-scraper"}, "status": 204}, {"id": "actors.webhooks.list", "method": "GET", "path": "/v2/actors/apify~web-scraper/webhooks", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.versions.list", "method": "GET", "path": "/v2/actors/apify~web-scraper/versions", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.versions.create", "method": "POST", "path": "/v2/actors/apify~web-scraper/versions", "input": {"actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.get", "method": "GET", "path": "/v2/actors/apify~web-scraper/versions/0.1", "input": {"actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.update", "method": "PUT", "path": "/v2/actors/apify~web-scraper/versions/0.1", "input": {"actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.delete", "method": "DELETE", "path": "/v2/actors/apify~web-scraper/versions/0.1", "input": {"actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 204}, {"id": "actors.versions.env_vars.list", "method": "GET", "path": "/v2/actors/apify~web-scraper/versions/0.1/env-vars", "input": {"actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.env_vars.create", "method": "POST", "path": "/v2/actors/apify~web-scraper/versions/0.1/env-vars", "input": {"name": "value", "value": "value", "actorId": "apify~web-scraper", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.env_vars.get", "method": "GET", "path": "/v2/actors/apify~web-scraper/versions/0.1/env-vars/MY_VAR", "input": {"actorId": "apify~web-scraper", "envVarName": "MY_VAR", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.env_vars.update", "method": "PUT", "path": "/v2/actors/apify~web-scraper/versions/0.1/env-vars/MY_VAR", "input": {"name": "value", "value": "value", "actorId": "apify~web-scraper", "envVarName": "MY_VAR", "versionNumber": "0.1"}, "status": 200}, {"id": "actors.versions.env_vars.delete", "method": "DELETE", "path": "/v2/actors/apify~web-scraper/versions/0.1/env-vars/MY_VAR", "input": {"actorId": "apify~web-scraper", "envVarName": "MY_VAR", "versionNumber": "0.1"}, "status": 204}, {"id": "actors.builds.create", "method": "POST", "path": "/v2/actors/apify~web-scraper/builds", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.builds.list", "method": "GET", "path": "/v2/actors/apify~web-scraper/builds", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.builds.default", "method": "GET", "path": "/v2/actors/apify~web-scraper/builds/default", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.runs.last", "method": "GET", "path": "/v2/actors/apify~web-scraper/runs/last", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actors.runs.last.dataset_items", "method": "GET", "path": "/v2/actors/apify~web-scraper/runs/last/dataset/items", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actor.run_sync", "method": "POST", "path": "/v2/actors/apify~web-scraper/run-sync", "input": {"input": {"example": true}, "actorId": "apify~web-scraper"}, "status": 200}, {"id": "actor.run_sync_get", "method": "GET", "path": "/v2/actors/apify~web-scraper/run-sync", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actor.run_sync_get_dataset_items_get", "method": "GET", "path": "/v2/actors/apify~web-scraper/run-sync-get-dataset-items", "input": {"actorId": "apify~web-scraper"}, "status": 200}, {"id": "actor_builds.list", "method": "GET", "path": "/v2/actor-builds", "input": {}, "status": 200}, {"id": "actor_builds.get", "method": "GET", "path": "/v2/actor-builds/soSkq9ekdmfOslopH", "input": {"buildId": "soSkq9ekdmfOslopH"}, "status": 200}, {"id": "actor_builds.delete", "method": "DELETE", "path": "/v2/actor-builds/soSkq9ekdmfOslopH", "input": {"buildId": "soSkq9ekdmfOslopH"}, "status": 204}, {"id": "actor_builds.abort", "method": "POST", "path": "/v2/actor-builds/soSkq9ekdmfOslopH/abort", "input": {"buildId": "soSkq9ekdmfOslopH"}, "status": 200}, {"id": "actor_builds.log", "method": "GET", "path": "/v2/actor-builds/soSkq9ekdmfOslopH/log", "input": {"buildId": "soSkq9ekdmfOslopH"}, "status": 200}, {"id": "actor_builds.openapi", "method": "GET", "path": "/v2/actor-builds/soSkq9ekdmfOslopH/openapi.json", "input": {"buildId": "soSkq9ekdmfOslopH"}, "status": 200}, {"id": "runs.delete", "method": "DELETE", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 204}, {"id": "runs.update", "method": "PUT", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T", "input": {"runId": "3KH8gEpp4d8uQSe8T", "statusMessage": "value"}, "status": 200}, {"id": "runs.resurrect", "method": "POST", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T/resurrect", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 200}, {"id": "runs.list_user", "method": "GET", "path": "/v2/actor-runs", "input": {}, "status": 200}, {"id": "runs.dataset_items", "method": "GET", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T/dataset/items", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 200}, {"id": "runs.default_dataset", "method": "GET", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T/dataset", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 200}, {"id": "runs.default_key_value_store", "method": "GET", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T/key-value-store", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 200}, {"id": "runs.default_request_queue", "method": "GET", "path": "/v2/actor-runs/3KH8gEpp4d8uQSe8T/request-queue", "input": {"runId": "3KH8gEpp4d8uQSe8T"}, "status": 200}, {"id": "tasks.create", "method": "POST", "path": "/v2/actor-tasks", "input": {"name": "value", "actId": "value"}, "status": 200}, {"id": "tasks.update", "method": "PUT", "path": "/v2/actor-tasks/janedoe~my-task", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "tasks.delete", "method": "DELETE", "path": "/v2/actor-tasks/janedoe~my-task", "input": {"actorTaskId": "janedoe~my-task"}, "status": 204}, {"id": "tasks.runs.last", "method": "GET", "path": "/v2/actor-tasks/janedoe~my-task/runs/last", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "tasks.runs.last.dataset_items", "method": "GET", "path": "/v2/actor-tasks/janedoe~my-task/runs/last/dataset/items", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "tasks.runs.list", "method": "GET", "path": "/v2/actor-tasks/janedoe~my-task/runs", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "tasks.webhooks.list", "method": "GET", "path": "/v2/actor-tasks/janedoe~my-task/webhooks", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "tasks.input.get", "method": "GET", "path": "/v2/actor-tasks/HG7ML7M8z78YcAPEB/input", "input": {"taskId": "HG7ML7M8z78YcAPEB"}, "status": 200}, {"id": "tasks.input.update", "method": "PUT", "path": "/v2/actor-tasks/HG7ML7M8z78YcAPEB/input", "input": {"input": {"example": true}, "taskId": "HG7ML7M8z78YcAPEB"}, "status": 200}, {"id": "task.run_sync", "method": "POST", "path": "/v2/actor-tasks/janedoe~my-task/run-sync", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "task.run_sync_get", "method": "GET", "path": "/v2/actor-tasks/janedoe~my-task/run-sync", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "task.run_sync_get_dataset_items_post", "method": "POST", "path": "/v2/actor-tasks/janedoe~my-task/run-sync-get-dataset-items", "input": {"actorTaskId": "janedoe~my-task"}, "status": 200}, {"id": "datasets.update", "method": "PUT", "path": "/v2/datasets/dataset-1", "input": {"name": "value", "datasetId": "dataset-1"}, "status": 200}, {"id": "datasets.statistics", "method": "GET", "path": "/v2/datasets/dataset-1/statistics", "input": {"datasetId": "dataset-1"}, "status": 200}, {"id": "key_value_stores.create", "method": "POST", "path": "/v2/key-value-stores", "input": {}, "status": 200}, {"id": "key_value_stores.delete", "method": "DELETE", "path": "/v2/key-value-stores/store-1", "input": {"storeId": "store-1"}, "status": 204}, {"id": "key_value_stores.update", "method": "PUT", "path": "/v2/key-value-stores/store-1", "input": {"storeId": "store-1"}, "status": 200}, {"id": "key_value_store.head_record", "method": "HEAD", "path": "/v2/key-value-stores/store-1/records/OUTPUT", "input": {"storeId": "store-1", "recordKey": "OUTPUT"}, "status": 200}, {"id": "request_queues.create", "method": "POST", "path": "/v2/request-queues", "input": {}, "status": 200}, {"id": "request_queues.get", "method": "GET", "path": "/v2/request-queues/queue-1", "input": {"queueId": "queue-1"}, "status": 200}, {"id": "request_queues.update", "method": "PUT", "path": "/v2/request-queues/queue-1", "input": {"name": "value", "queueId": "queue-1"}, "status": 200}, {"id": "request_queues.delete", "method": "DELETE", "path": "/v2/request-queues/queue-1", "input": {"queueId": "queue-1"}, "status": 204}, {"id": "request_queues.head", "method": "GET", "path": "/v2/request-queues/queue-1/head", "input": {"queueId": "queue-1"}, "status": 200}, {"id": "request_queues.head.lock", "method": "POST", "path": "/v2/request-queues/queue-1/head/lock", "input": {"queueId": "queue-1", "lockSecs": 1}, "status": 200}, {"id": "request_queues.requests.list", "method": "GET", "path": "/v2/request-queues/queue-1/requests", "input": {"queueId": "queue-1"}, "status": 200}, {"id": "request_queues.requests.add", "method": "POST", "path": "/v2/request-queues/queue-1/requests", "input": {"url": "value", "queueId": "queue-1"}, "status": 200}, {"id": "request_queues.requests.get", "method": "GET", "path": "/v2/request-queues/queue-1/requests/request-1", "input": {"queueId": "queue-1", "requestId": "request-1"}, "status": 200}, {"id": "request_queues.requests.update", "method": "PUT", "path": "/v2/request-queues/queue-1/requests/request-1", "input": {"id": "value", "url": "value", "queueId": "queue-1", "requestId": "request-1", "uniqueKey": "value"}, "status": 200}, {"id": "request_queues.requests.delete", "method": "DELETE", "path": "/v2/request-queues/queue-1/requests/request-1", "input": {"queueId": "queue-1", "requestId": "request-1"}, "status": 204}, {"id": "request_queues.requests.lock.delete", "method": "DELETE", "path": "/v2/request-queues/queue-1/requests/request-1/lock", "input": {"queueId": "queue-1", "clientKey": "value", "requestId": "request-1"}, "status": 204}, {"id": "request_queues.requests.lock.prolong", "method": "PUT", "path": "/v2/request-queues/queue-1/requests/request-1/lock", "input": {"queueId": "queue-1", "lockSecs": 1, "clientKey": "value", "requestId": "request-1"}, "status": 200}, {"id": "request_queues.requests.batch_add", "method": "POST", "path": "/v2/request-queues/queue-1/requests/batch", "input": {"queueId": "queue-1", "requests": [{"url": "https://example.com"}]}, "status": 200}, {"id": "request_queues.requests.batch_delete", "method": "DELETE", "path": "/v2/request-queues/queue-1/requests/batch", "input": {"queueId": "queue-1", "requests": [{"url": "https://example.com"}]}, "status": 204}, {"id": "request_queues.requests.unlock", "method": "POST", "path": "/v2/request-queues/queue-1/requests/unlock", "input": {"queueId": "queue-1"}, "status": 200}, {"id": "schedules.list", "method": "GET", "path": "/v2/schedules", "input": {}, "status": 200}, {"id": "schedules.create", "method": "POST", "path": "/v2/schedules", "input": {"isEnabled": true, "isExclusive": true, "cronExpression": "value"}, "status": 200}, {"id": "schedules.get", "method": "GET", "path": "/v2/schedules/schedule-1", "input": {"scheduleId": "schedule-1"}, "status": 200}, {"id": "schedules.update", "method": "PUT", "path": "/v2/schedules/schedule-1", "input": {"scheduleId": "schedule-1"}, "status": 200}, {"id": "schedules.delete", "method": "DELETE", "path": "/v2/schedules/schedule-1", "input": {"scheduleId": "schedule-1"}, "status": 204}, {"id": "schedules.log", "method": "GET", "path": "/v2/schedules/schedule-1/log", "input": {"scheduleId": "schedule-1"}, "status": 200}, {"id": "webhooks.create", "method": "POST", "path": "/v2/webhooks", "input": {"condition": {"example": true}, "eventTypes": ["value"], "requestUrl": "value"}, "status": 200}, {"id": "webhooks.get", "method": "GET", "path": "/v2/webhooks/webhook-1", "input": {"webhookId": "webhook-1"}, "status": 200}, {"id": "webhooks.update", "method": "PUT", "path": "/v2/webhooks/webhook-1", "input": {"webhookId": "webhook-1"}, "status": 200}, {"id": "webhooks.delete", "method": "DELETE", "path": "/v2/webhooks/webhook-1", "input": {"webhookId": "webhook-1"}, "status": 204}, {"id": "webhooks.test", "method": "POST", "path": "/v2/webhooks/webhook-1/test", "input": {"webhookId": "webhook-1"}, "status": 200}, {"id": "webhooks.dispatches.list", "method": "GET", "path": "/v2/webhooks/webhook-1/dispatches", "input": {"webhookId": "webhook-1"}, "status": 200}, {"id": "webhook_dispatches.list", "method": "GET", "path": "/v2/webhook-dispatches", "input": {}, "status": 200}, {"id": "webhook_dispatches.get", "method": "GET", "path": "/v2/webhook-dispatches/dispatch-1", "input": {"dispatchId": "dispatch-1"}, "status": 200}, {"id": "users.get", "method": "GET", "path": "/v2/users/user-1", "input": {"userId": "user-1"}, "status": 200}, {"id": "users.me.limits.get", "method": "GET", "path": "/v2/users/me/limits", "input": {}, "status": 200}, {"id": "users.me.limits.update", "method": "PUT", "path": "/v2/users/me/limits", "input": {}, "status": 200}, {"id": "users.me.usage.monthly", "method": "GET", "path": "/v2/users/me/usage/monthly", "input": {}, "status": 200}, {"id": "store.list", "method": "GET", "path": "/v2/store", "input": {}, "status": 200}] as Array<{
  id: string;
  method: string;
  path: string;
  input: Record<string, unknown>;
  status: number;
}>;
const scrapeRoutes = [{"id": "discover.g2_products", "actor": "fatihtahta~g2-scraper", "input": {"searchQuery": "value"}}, {"id": "reports.carfax_by_vin", "actor": "easytools~carfax-report-by-vin", "input": {"vinCodes": "value", "maxTotalChargeUsd": 1}}, {"id": "reports.us_fuel_price_averages", "actor": "crawlerbros~fuel-prices-scraper", "input": {}}, {"id": "scrape.amazon_product_details", "actor": "delicious_zebu~amazon-product-details-scraper", "input": {"products": [{"url": "https://example.com"}]}}, {"id": "scrape.amazon_reviews", "actor": "axesso_data~amazon-reviews-scraper", "input": {"products": [{"url": "https://example.com"}]}}, {"id": "scrape.booking_reviews", "actor": "voyager~booking-reviews-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_ads", "actor": "apify~facebook-ads-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_comments", "actor": "apify~facebook-comments-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_events", "actor": "apify~facebook-events-scraper", "input": {}}, {"id": "scrape.facebook_group_posts", "actor": "apify~facebook-groups-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_pages", "actor": "apify~facebook-pages-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_photos", "actor": "apify~facebook-photos-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_posts", "actor": "apify~facebook-posts-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_reels", "actor": "apify~facebook-reels-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.facebook_reviews", "actor": "apify~facebook-reviews-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.g2_reviews", "actor": "azzouzana~g2-scraper", "input": {"productUrls": ["value"]}}, {"id": "scrape.google_maps_places", "actor": "damilo~google-maps-scraper", "input": {"query": "value", "location": "value"}}, {"id": "scrape.google_maps_reviews", "actor": "compass~google-maps-reviews-scraper", "input": {}}, {"id": "scrape.indeed_jobs", "actor": "valig~indeed-jobs-scraper", "input": {}}, {"id": "scrape.instagram_comments", "actor": "apify~instagram-comment-scraper", "input": {"directUrls": ["value"]}}, {"id": "scrape.instagram_hashtags", "actor": "apify~instagram-hashtag-scraper", "input": {"hashtags": ["value"]}}, {"id": "scrape.instagram_mentions", "actor": "apify~instagram-tagged-scraper", "input": {"username": ["value"]}}, {"id": "scrape.instagram_posts", "actor": "apify~instagram-post-scraper", "input": {"username": ["value"]}}, {"id": "scrape.instagram_profiles", "actor": "apify~instagram-profile-scraper", "input": {"usernames": ["value"]}}, {"id": "scrape.instagram_reels", "actor": "apify~instagram-reel-scraper", "input": {"username": ["value"]}}, {"id": "scrape.linkedin_companies", "actor": "harvestapi~linkedin-company", "input": {}}, {"id": "scrape.linkedin_company_employees", "actor": "harvestapi~linkedin-company-employees", "input": {}}, {"id": "scrape.linkedin_profile_posts", "actor": "harvestapi~linkedin-profile-posts", "input": {}}, {"id": "scrape.linkedin_profiles", "actor": "harvestapi~linkedin-profile-scraper", "input": {}}, {"id": "scrape.snapchat_profiles", "actor": "automation-lab~snapchat-scraper", "input": {"usernames": ["value"]}}, {"id": "scrape.snapchat_spotlight", "actor": "tri_angle~snapchat-spotlight-scraper", "input": {"spotlightUrls": ["value"]}}, {"id": "scrape.tik_tok_ads", "actor": "lexis-solutions~tiktok-ads-scraper", "input": {}}, {"id": "scrape.tik_tok_comments", "actor": "clockworks~tiktok-comments-scraper", "input": {"postURLs": ["value"]}}, {"id": "scrape.tik_tok_posts", "actor": "apidojo~tiktok-scraper", "input": {}}, {"id": "scrape.tik_tok_video", "actor": "clockworks~tiktok-video-scraper", "input": {"postURLs": ["value"]}}, {"id": "scrape.tripadvisor_reviews", "actor": "maxcopell~tripadvisor-reviews", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.trustpilot_reviews", "actor": "casper~trustpilot-reviews-scraper", "input": {"companyUrls": ["value"]}}, {"id": "scrape.twitter_posts", "actor": "apidojo~tweet-scraper", "input": {"searchTerms": ["value"]}}, {"id": "scrape.website_traffic_insights", "actor": "radeance~similarweb-scraper", "input": {"urls": ["value"]}}, {"id": "scrape.yelp_reviews", "actor": "web_wanderer~yelp-reviews-scraper", "input": {}}, {"id": "scrape.youtube_comments", "actor": "streamers~youtube-comments-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "scrape.youtube_videos", "actor": "streamers~youtube-scraper", "input": {}}, {"id": "scrape.youtube_video_transcripts", "actor": "starvibe~youtube-video-transcript", "input": {}}, {"id": "scrape.zillow_property_details", "actor": "maxcopell~zillow-detail-scraper", "input": {}}, {"id": "search.aliexpress_products", "actor": "khadinakbar~aliexpress-all-in-one-scraper", "input": {"searchQuery": "value"}}, {"id": "search.amazon_products", "actor": "axesso_data~amazon-search-scraper", "input": {"searches": [{"url": "https://example.com"}]}}, {"id": "search.booking_properties", "actor": "voyager~booking-scraper", "input": {}}, {"id": "search.eventbrite_events", "actor": "aitorsm~eventbrite", "input": {"maxTotalChargeUsd": 1}}, {"id": "search.facebook_marketplace", "actor": "apify~facebook-marketplace-scraper", "input": {"startUrls": [{"url": "https://example.com"}]}}, {"id": "search.google", "actor": "apify~google-search-scraper", "input": {"queries": "value"}}, {"id": "search.google_images", "actor": "hooli~google-images-scraper", "input": {"queries": ["value"]}}, {"id": "search.google_news", "actor": "data_xplorer~google-news-scraper-fast", "input": {}}, {"id": "search.google_shopping", "actor": "burbn~google-shopping-scraper", "input": {"searchQuery": "value"}}, {"id": "search.instagram", "actor": "apify~instagram-search-scraper", "input": {"search": "value"}}, {"id": "search.jobs_across_sites", "actor": "agentx~all-jobs-scraper", "input": {"keyword": "value", "platforms": ["value"]}}, {"id": "search.linkedin_companies", "actor": "harvestapi~linkedin-company-search", "input": {"searchQuery": "value"}}, {"id": "search.linkedin_jobs", "actor": "harvestapi~linkedin-job-search", "input": {}}, {"id": "search.linkedin_posts", "actor": "harvestapi~linkedin-post-search", "input": {"searchQueries": ["value"]}}, {"id": "search.linkedin_profiles", "actor": "harvestapi~linkedin-profile-search", "input": {}}, {"id": "search.linkedin_profiles_by_name", "actor": "harvestapi~linkedin-profile-search-by-name", "input": {}}, {"id": "search.linkedin_profiles_by_services", "actor": "harvestapi~linkedin-profile-search-by-services", "input": {}}, {"id": "search.local_fuel_prices", "actor": "johnvc~fuelprices", "input": {"search": "value", "maxTotalChargeUsd": 1}}, {"id": "search.tik_tok_users", "actor": "clockworks~tiktok-user-search-scraper", "input": {"searchQueries": ["value"]}}, {"id": "search.tripadvisor_places", "actor": "maxcopell~tripadvisor", "input": {}}, {"id": "search.upwork_jobs", "actor": "neatrat~upwork-job-scraper", "input": {"query": "value"}}, {"id": "search.yandex_market_products", "actor": "zen-studio~yandex-market-scraper-parser", "input": {"query": "value"}}, {"id": "search.zillow_properties", "actor": "maxcopell~zillow-api-scraper", "input": {"searchUrls": ["value"]}}] as Array<{
  id: string;
  actor: string;
  input: Record<string, unknown>;
}>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apify composio deepening", () => {
  test("compiles every added Composio operation into an HTTP handler", () => {
    for (const key of added) {
      expect(actions[key], key).toBeTypeOf("function");
    }
  });

  test("does not compile handwritten operations that have no request block", () => {
    expect(actions["actors.list"]).toBeUndefined();
    expect(actions["healthcheck"]).toBeUndefined();
    expect(actions["actors.options"]).toBeUndefined();
  });

  test("fails closed without calling Apify when no apiKey is present", async () => {
    // PLAT-NOCRED-1: a valid input without a credential fails closed.
    await expect(Promise.resolve().then(() => actions["actors.create"]!({ name: "demo-actor" }))).rejects.toMatchObject({ ok: false, code: "MISSING_CREDENTIAL" });
  });

  test("rejects missing required fields as INVALID_ACTION_INPUT", async () => {
    await expect(actions["actors.delete"]!({ apiKey: "tok" })).rejects.toMatchObject({
      ok: false,
      code: "INVALID_ACTION_INPUT",
    });
  });

  for (const route of restRoutes) {
    test(`${route.id} calls ${route.method} ${route.path}`, async () => {
      const requests: Request[] = [];
      const body = route.path.includes("/items") && route.method === "GET"
        ? itemsFixture
        : route.id.includes(".list") || route.id.endsWith("s.list")
          ? listFixture
          : resourceFixture;
      const result = await actions[route.id]!({
        apiKey: "apify_api_test",
        ...route.input,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(input, init));
          if (route.status === 204) return new Response(null, { status: 204 });
          return jsonResponse(body, route.status);
        },
      });
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url);
      expect(url.pathname).toBe(route.path);
      expect(requests[0].method).toBe(route.method);
      expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
      const sentBody = await requests[0].clone().text();
      const hasBody = sentBody.length > 0;
      if (route.method === "GET" || route.method === "HEAD" || (route.method === "DELETE" && route.id !== "request_queues.requests.batch_delete")) {
        expect(hasBody).toBe(false);
        expect(requests[0].headers.get("Content-Type")).toBeNull();
      } else if (hasBody) {
        expect(requests[0].headers.get("Content-Type")).toBe("application/json");
      }
      expect(result.connector).toBe("apify");
      expect(result.action).toBe(route.id);
      expect(result.source).toBe("provider");
    });
  }

  for (const route of scrapeRoutes) {
    test(`${route.id} runs Actor ${route.actor} synchronously`, async () => {
      const requests: Request[] = [];
      const result = await actions[route.id]!({
        apiKey: "apify_api_test",
        ...route.input,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(new Request(input, init));
          return jsonResponse(itemsFixture);
        },
      });
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url);
      expect(url.pathname).toBe(`/v2/acts/${route.actor}/run-sync-get-dataset-items`);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].headers.get("Content-Type")).toBe("application/json");
      expect(result.action).toBe(route.id);
      expect(result.source).toBe("provider");
    });
  }

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(actions["schedules.list"]!({
      apiKey: "tok",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });

  test("creates a schedule with the documented JSON body", async () => {
    const requests: Request[] = [];
    await actions["schedules.create"]!({
      apiKey: "tok",
      isEnabled: true,
      isExclusive: true,
      cronExpression: "* * * * *",
      name: "nightly",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return jsonResponse(resourceFixture, 201);
      },
    });
    expect(new URL(requests[0].url).pathname).toBe("/v2/schedules");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      isEnabled: true,
      isExclusive: true,
      cronExpression: "* * * * *",
      name: "nightly",
    });
  });

  test("GET schedules.list is body-less and omits JSON Content-Type", async () => {
    const requests: Request[] = [];
    await actions["schedules.list"]!({
      apiKey: "tok",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return jsonResponse(listFixture);
      },
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Content-Type")).toBeNull();
    expect(await requests[0].text()).toBe("");
  });

  test("DELETE actors.delete is body-less and omits JSON Content-Type", async () => {
    const requests: Request[] = [];
    await actions["actors.delete"]!({
      apiKey: "tok",
      actorId: "apify~web-scraper",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Content-Type")).toBeNull();
    expect(await requests[0].text()).toBe("");
  });
});
