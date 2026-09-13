import { describe, expect, test } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { defaultConnectorRegistry } from "../../src/registry";
import ably from "../../../../runner/connectors/ably/manifest.json";
import ablyControl from "../../../../runner/connectors/ably-control/manifest.json";
import airbrake from "../../../../runner/connectors/airbrake/manifest.json";
import bugsnag from "../../../../runner/connectors/bugsnag/manifest.json";
import contentful from "../../../../runner/connectors/contentful/manifest.json";
import pagerduty from "../../../../runner/connectors/pagerduty/manifest.json";
import pingdom from "../../../../runner/connectors/pingdom/manifest.json";
import storyblok from "../../../../runner/connectors/storyblok/manifest.json";
import bunnycdn from "../../../../runner/connectors/bunnycdn/manifest.json";
import statuspage from "../../../../runner/connectors/statuspage/manifest.json";
import newRelic from "../../../../runner/connectors/new-relic/manifest.json";
import postmark from "../../../../runner/connectors/postmark/manifest.json";
import mailjet from "../../../../runner/connectors/mailjet/manifest.json";
import pipedrive from "../../../../runner/connectors/pipedrive/manifest.json";
import sentry from "../../../../runner/connectors/sentry/manifest.json";
import algolia from "../../../../runner/connectors/algolia/manifest.json";
import intercom from "../../../../runner/connectors/intercom/manifest.json";
import mailerlite from "../../../../runner/connectors/mailerlite/manifest.json";
import breathe from "../../../../runner/connectors/breathe/manifest.json";
import chartmogul from "../../../../runner/connectors/chartmogul/manifest.json";
import amplitude from "../../../../runner/connectors/amplitude/manifest.json";
import anydb from "../../../../runner/connectors/anydb/manifest.json";
import breezyHr from "../../../../runner/connectors/breezy-hr/manifest.json";
import checkly from "../../../../runner/connectors/checkly/manifest.json";
import mailersend from "../../../../runner/connectors/mailersend/manifest.json";
import emailoctopus from "../../../../runner/connectors/emailoctopus/manifest.json";
import omnisend from "../../../../runner/connectors/omnisend/manifest.json";
import readme from "../../../../runner/connectors/readme/manifest.json";
import configcat from "../../../../runner/connectors/configcat/manifest.json";
import codacy from "../../../../runner/connectors/codacy/manifest.json";
import statuscake from "../../../../runner/connectors/statuscake/manifest.json";
import cronitor from "../../../../runner/connectors/cronitor/manifest.json";
import plausibleAnalytics from "../../../../runner/connectors/plausible-analytics/manifest.json";
import sendfox from "../../../../runner/connectors/sendfox/manifest.json";
import uptimerobot from "../../../../runner/connectors/uptimerobot/manifest.json";
import acculynx from "../../../../runner/connectors/acculynx/manifest.json";
import gem from "../../../../runner/connectors/gem/manifest.json";
import formstack from "../../../../runner/connectors/formstack/manifest.json";
import companycam from "../../../../runner/connectors/companycam/manifest.json";
import clicksend from "../../../../runner/connectors/clicksend/manifest.json";
import gtmetrix from "../../../../runner/connectors/gtmetrix/manifest.json";
import giftUp from "../../../../runner/connectors/gift-up/manifest.json";
import elevenlabs from "../../../../runner/connectors/elevenlabs/manifest.json";
import deepgram from "../../../../runner/connectors/deepgram/manifest.json";
import gumroad from "../../../../runner/connectors/gumroad/manifest.json";
import booqable from "../../../../runner/connectors/booqable/manifest.json";
import beeminder from "../../../../runner/connectors/beeminder/manifest.json";
import activeTrail from "../../../../runner/connectors/active-trail/manifest.json";
import affinity from "../../../../runner/connectors/affinity/manifest.json";
import paymo from "../../../../runner/connectors/paymo/manifest.json";
import abyssale from "../../../../runner/connectors/abyssale/manifest.json";
import certn from "../../../../runner/connectors/certn/manifest.json";
import baremetrics from "../../../../runner/connectors/baremetrics/manifest.json";
import timecamp from "../../../../runner/connectors/timecamp/manifest.json";
import bigmailer from "../../../../runner/connectors/bigmailer/manifest.json";
import ayrshare from "../../../../runner/connectors/ayrshare/manifest.json";
import betterProposals from "../../../../runner/connectors/better-proposals/manifest.json";
import aircall from "../../../../runner/connectors/aircall/manifest.json";
import clerk from "../../../../runner/connectors/clerk/manifest.json";
import courier from "../../../../runner/connectors/courier/manifest.json";
import instatus from "../../../../runner/connectors/instatus/manifest.json";
import aftership from "../../../../runner/connectors/aftership/manifest.json";
import avoma from "../../../../runner/connectors/avoma/manifest.json";
import apiBible from "../../../../runner/connectors/api-bible/manifest.json";
import bestbuy from "../../../../runner/connectors/bestbuy/manifest.json";
import coingecko from "../../../../runner/connectors/coingecko/manifest.json";
import agentMail from "../../../../runner/connectors/agent-mail/manifest.json";
import agenty from "../../../../runner/connectors/agenty/manifest.json";
import alphaVantage from "../../../../runner/connectors/alpha-vantage/manifest.json";
import balldontlieWorldcup from "../../../../runner/connectors/balldontlie-worldcup/manifest.json";
import brex from "../../../../runner/connectors/brex/manifest.json";
import bugHerd from "../../../../runner/connectors/bug-herd/manifest.json";
import grafana from "../../../../runner/connectors/grafana/manifest.json";
import giphy from "../../../../runner/connectors/giphy/manifest.json";
import coderabbit from "../../../../runner/connectors/coderabbit/manifest.json";
import drata from "../../../../runner/connectors/drata/manifest.json";
import fly from "../../../../runner/connectors/fly/manifest.json";
import envoy from "../../../../runner/connectors/envoy/manifest.json";
import felt from "../../../../runner/connectors/felt/manifest.json";
import fluxguard from "../../../../runner/connectors/fluxguard/manifest.json";
import jobnimbus from "../../../../runner/connectors/jobnimbus/manifest.json";
import freshteam from "../../../../runner/connectors/freshteam/manifest.json";
import hrPartner from "../../../../runner/connectors/hr-partner/manifest.json";
import chattermill from "../../../../runner/connectors/chattermill/manifest.json";
import dailybot from "../../../../runner/connectors/dailybot/manifest.json";
import faraday from "../../../../runner/connectors/faraday/manifest.json";
import cats from "../../../../runner/connectors/cats/manifest.json";
import fireberry from "../../../../runner/connectors/fireberry/manifest.json";
import givebutter from "../../../../runner/connectors/givebutter/manifest.json";
import gleap from "../../../../runner/connectors/gleap/manifest.json";
import gamma from "../../../../runner/connectors/gamma/manifest.json";
import feathery from "../../../../runner/connectors/feathery/manifest.json";
import clearout from "../../../../runner/connectors/clearout/manifest.json";
import clickmeeting from "../../../../runner/connectors/clickmeeting/manifest.json";
import helpdesk from "../../../../runner/connectors/helpdesk/manifest.json";
import dnsFilter from "../../../../runner/connectors/dns-filter/manifest.json";
import crossref from "../../../../runner/connectors/crossref/manifest.json";
import daffy from "../../../../runner/connectors/daffy/manifest.json";
import glyphic from "../../../../runner/connectors/glyphic/manifest.json";
import eventzilla from "../../../../runner/connectors/eventzilla/manifest.json";
import esignaturesIo from "../../../../runner/connectors/esignatures-io/manifest.json";
import jumpseller from "../../../../runner/connectors/jumpseller/manifest.json";
import heyreach from "../../../../runner/connectors/heyreach/manifest.json";
import heyzine from "../../../../runner/connectors/heyzine/manifest.json";
import klipfolio from "../../../../runner/connectors/klipfolio/manifest.json";
import itGlue from "../../../../runner/connectors/it-glue/manifest.json";
import jiminny from "../../../../runner/connectors/jiminny/manifest.json";
import kaleido from "../../../../runner/connectors/kaleido/manifest.json";
import callingly from "../../../../runner/connectors/callingly/manifest.json";
import chargeblast from "../../../../runner/connectors/chargeblast/manifest.json";
import commpeak from "../../../../runner/connectors/commpeak/manifest.json";
import contactout from "../../../../runner/connectors/contactout/manifest.json";
import happyScribe from "../../../../runner/connectors/happy-scribe/manifest.json";
import headout from "../../../../runner/connectors/headout/manifest.json";
import financialModelingPrep from "../../../../runner/connectors/financial-modeling-prep/manifest.json";
import eodhdApis from "../../../../runner/connectors/eodhd-apis/manifest.json";
import circle from "../../../../runner/connectors/circle/manifest.json";
import intelliprint from "../../../../runner/connectors/intelliprint/manifest.json";
import genpage from "../../../../runner/connectors/genpage/manifest.json";
import apiSports from "../../../../runner/connectors/api-sports/manifest.json";
import chatarmin from "../../../../runner/connectors/chatarmin/manifest.json";
import cratedbCloud from "../../../../runner/connectors/cratedb-cloud/manifest.json";
import everhour from "../../../../runner/connectors/everhour/manifest.json";
import mailosaur from "../../../../runner/connectors/mailosaur/manifest.json";
import mailsoftly from "../../../../runner/connectors/mailsoftly/manifest.json";
import mailtrap from "../../../../runner/connectors/mailtrap/manifest.json";
import maintainx from "../../../../runner/connectors/maintainx/manifest.json";
import manus from "../../../../runner/connectors/manus/manifest.json";
import meetGeek from "../../../../runner/connectors/meet-geek/manifest.json";
import memberstack from "../../../../runner/connectors/memberstack/manifest.json";
import nango from "../../../../runner/connectors/nango/manifest.json";
import nethunt from "../../../../runner/connectors/nethunt/manifest.json";
import neverbounce from "../../../../runner/connectors/neverbounce/manifest.json";
import niftyimages from "../../../../runner/connectors/niftyimages/manifest.json";
import ninjapear from "../../../../runner/connectors/ninjapear/manifest.json";
import nozbeTeams from "../../../../runner/connectors/nozbe-teams/manifest.json";
import nusiiProposals from "../../../../runner/connectors/nusii-proposals/manifest.json";
import nyneAi from "../../../../runner/connectors/nyne-ai/manifest.json";
import octopusDeploy from "../../../../runner/connectors/octopus-deploy/manifest.json";
import openstatus from "../../../../runner/connectors/openstatus/manifest.json";
import ordinal from "../../../../runner/connectors/ordinal/manifest.json";
import paddle from "../../../../runner/connectors/paddle/manifest.json";
import pinecone from "../../../../runner/connectors/pinecone/manifest.json";
import planetscale from "../../../../runner/connectors/planetscale/manifest.json";
import planhat from "../../../../runner/connectors/planhat/manifest.json";
import plunk from "../../../../runner/connectors/plunk/manifest.json";
import polar from "../../../../runner/connectors/polar/manifest.json";
import postalytics from "../../../../runner/connectors/postalytics/manifest.json";
import postgrid from "../../../../runner/connectors/postgrid/manifest.json";
import precoro from "../../../../runner/connectors/precoro/manifest.json";
import rawg from "../../../../runner/connectors/rawg/manifest.json";
import referralhero from "../../../../runner/connectors/referralhero/manifest.json";
import replyIo from "../../../../runner/connectors/reply-io/manifest.json";
import respondIo from "../../../../runner/connectors/respond-io/manifest.json";
import retently from "../../../../runner/connectors/retently/manifest.json";
import revenuecat from "../../../../runner/connectors/revenuecat/manifest.json";
import ringgAi from "../../../../runner/connectors/ringg-ai/manifest.json";
import roboflow from "../../../../runner/connectors/roboflow/manifest.json";
import semanticScholar from "../../../../runner/connectors/semantic-scholar/manifest.json";
import sender from "../../../../runner/connectors/sender/manifest.json";
import simplesat from "../../../../runner/connectors/simplesat/manifest.json";
import sitespeakai from "../../../../runner/connectors/sitespeakai/manifest.json";
import openweatherApi from "../../../../runner/connectors/openweather-api/manifest.json";
import saasCustomDomains from "../../../../runner/connectors/saas-custom-domains/manifest.json";
import ghost from "../../../../runner/connectors/ghost/manifest.json";
import griptape from "../../../../runner/connectors/griptape/manifest.json";
import heyy from "../../../../runner/connectors/heyy/manifest.json";
import kommo from "../../../../runner/connectors/kommo/manifest.json";
import kustomer from "../../../../runner/connectors/kustomer/manifest.json";
import langsmith from "../../../../runner/connectors/langsmith/manifest.json";
import laposta from "../../../../runner/connectors/laposta/manifest.json";
import laravelCloud from "../../../../runner/connectors/laravel-cloud/manifest.json";
import lattice from "../../../../runner/connectors/lattice/manifest.json";
import lightfield from "../../../../runner/connectors/lightfield/manifest.json";
import listennotes from "../../../../runner/connectors/listennotes/manifest.json";
import loyverse from "../../../../runner/connectors/loyverse/manifest.json";
import missive from "../../../../runner/connectors/missive/manifest.json";
import mistralAi from "../../../../runner/connectors/mistral-ai/manifest.json";
import modjoAi from "../../../../runner/connectors/modjo-ai/manifest.json";
import mxToolbox from "../../../../runner/connectors/mx-toolbox/manifest.json";
import parma from "../../../../runner/connectors/parma/manifest.json";
import pdfCo from "../../../../runner/connectors/pdf-co/manifest.json";
import perigon from "../../../../runner/connectors/perigon/manifest.json";
import permitIo from "../../../../runner/connectors/permit-io/manifest.json";
import processStreet from "../../../../runner/connectors/process-street/manifest.json";
import productive from "../../../../runner/connectors/productive/manifest.json";
import qlty from "../../../../runner/connectors/qlty/manifest.json";
import quaderno from "../../../../runner/connectors/quaderno/manifest.json";
import quentn from "../../../../runner/connectors/quentn/manifest.json";
import quipteams from "../../../../runner/connectors/quipteams/manifest.json";
import raindrop from "../../../../runner/connectors/raindrop/manifest.json";
import raisely from "../../../../runner/connectors/raisely/manifest.json";
import sling from "../../../../runner/connectors/sling/manifest.json";
import stannp from "../../../../runner/connectors/stannp/manifest.json";
import stormboard from "../../../../runner/connectors/stormboard/manifest.json";
import n17track from "../../../../runner/connectors/17track/manifest.json";
import n7Shifts from "../../../../runner/connectors/7-shifts/manifest.json";
import ablefy from "../../../../runner/connectors/ablefy/manifest.json";
import accredibleCertificates from "../../../../runner/connectors/accredible-certificates/manifest.json";
import acuityScheduling from "../../../../runner/connectors/acuity-scheduling/manifest.json";
import adafruitIo from "../../../../runner/connectors/adafruit-io/manifest.json";
import addressfinder from "../../../../runner/connectors/addressfinder/manifest.json";
import addresszen from "../../../../runner/connectors/addresszen/manifest.json";
import adyen from "../../../../runner/connectors/adyen/manifest.json";
import affinda from "../../../../runner/connectors/affinda/manifest.json";
import agentql from "../../../../runner/connectors/agentql/manifest.json";
import agiled from "../../../../runner/connectors/agiled/manifest.json";
import agility from "../../../../runner/connectors/agility/manifest.json";
import agora from "../../../../runner/connectors/agora/manifest.json";
import ahrefs from "../../../../runner/connectors/ahrefs/manifest.json";
import aimfox from "../../../../runner/connectors/aimfox/manifest.json";
import airfocus from "../../../../runner/connectors/airfocus/manifest.json";
import aivoov from "../../../../runner/connectors/aivoov/manifest.json";
import alchemy from "../../../../runner/connectors/alchemy/manifest.json";
import algoDocs from "../../../../runner/connectors/algo-docs/manifest.json";
import alpaca from "../../../../runner/connectors/alpaca/manifest.json";
import altTextAi from "../../../../runner/connectors/alt-text-ai/manifest.json";
import altoviz from "../../../../runner/connectors/altoviz/manifest.json";
import amara from "../../../../runner/connectors/amara/manifest.json";
import ambientWeather from "../../../../runner/connectors/ambient-weather/manifest.json";
import ambivo from "../../../../runner/connectors/ambivo/manifest.json";
import amilia from "../../../../runner/connectors/amilia/manifest.json";
import anchorBrowser from "../../../../runner/connectors/anchor-browser/manifest.json";
import anrok from "../../../../runner/connectors/anrok/manifest.json";
import anthropic from "../../../../runner/connectors/anthropic/manifest.json";
import anthropicAdmin from "../../../../runner/connectors/anthropic-admin/manifest.json";
import anymailFinder from "../../../../runner/connectors/anymail-finder/manifest.json";
import apiVoid from "../../../../runner/connectors/api-void/manifest.json";
import apiflash from "../../../../runner/connectors/apiflash/manifest.json";
import apipieAi from "../../../../runner/connectors/apipie-ai/manifest.json";
import appcues from "../../../../runner/connectors/appcues/manifest.json";
import appstleSubscriptions from "../../../../runner/connectors/appstle-subscriptions/manifest.json";
import appveyor from "../../../../runner/connectors/appveyor/manifest.json";
import arcgisOnline from "../../../../runner/connectors/arcgis-online/manifest.json";
import asinDataApi from "../../../../runner/connectors/asin-data-api/manifest.json";
import assemblyai from "../../../../runner/connectors/assemblyai/manifest.json";
import atlasSo from "../../../../runner/connectors/atlas-so/manifest.json";
import attention from "../../../../runner/connectors/attention/manifest.json";
import autobound from "../../../../runner/connectors/autobound/manifest.json";
import autom from "../../../../runner/connectors/autom/manifest.json";
import avochato from "../../../../runner/connectors/avochato/manifest.json";
import bamboohr from "../../../../runner/connectors/bamboohr/manifest.json";
import bannerbear from "../../../../runner/connectors/bannerbear/manifest.json";
import baselinker from "../../../../runner/connectors/baselinker/manifest.json";
import basin from "../../../../runner/connectors/basin/manifest.json";
import beaconchain from "../../../../runner/connectors/beaconchain/manifest.json";
import beamer from "../../../../runner/connectors/beamer/manifest.json";
import benzinga from "../../../../runner/connectors/benzinga/manifest.json";
import bettercontact from "../../../../runner/connectors/bettercontact/manifest.json";
import bidsketch from "../../../../runner/connectors/bidsketch/manifest.json";
import bigCommerce from "../../../../runner/connectors/big-commerce/manifest.json";
import bigml from "../../../../runner/connectors/bigml/manifest.json";
import bird from "../../../../runner/connectors/bird/manifest.json";
import bitly from "../../../../runner/connectors/bitly/manifest.json";
import bitrise from "../../../../runner/connectors/bitrise/manifest.json";
import blandAi from "../../../../runner/connectors/bland-ai/manifest.json";
import blazeMeterFunctional from "../../../../runner/connectors/blaze-meter-functional/manifest.json";
import blazeMeterPerformance from "../../../../runner/connectors/blaze-meter-performance/manifest.json";
import blazeMeterServiceVirtualization from "../../../../runner/connectors/blaze-meter-service-virtualization/manifest.json";
import bloomerang from "../../../../runner/connectors/bloomerang/manifest.json";
import boldsign from "../../../../runner/connectors/boldsign/manifest.json";
import bolna from "../../../../runner/connectors/bolna/manifest.json";
import boloforms from "../../../../runner/connectors/boloforms/manifest.json";
import bookingmood from "../../../../runner/connectors/bookingmood/manifest.json";
import botStar from "../../../../runner/connectors/bot-star/manifest.json";
import botpress from "../../../../runner/connectors/botpress/manifest.json";
import botsonic from "../../../../runner/connectors/botsonic/manifest.json";
import bouncer from "../../../../runner/connectors/bouncer/manifest.json";
import boxhero from "../../../../runner/connectors/boxhero/manifest.json";
import brandfetch from "../../../../runner/connectors/brandfetch/manifest.json";
import breeze from "../../../../runner/connectors/breeze/manifest.json";
import brightData from "../../../../runner/connectors/bright-data/manifest.json";
import browseAi from "../../../../runner/connectors/browse-ai/manifest.json";
import browserUse from "../../../../runner/connectors/browser-use/manifest.json";
import browserbase from "../../../../runner/connectors/browserbase/manifest.json";
import browserstack from "../../../../runner/connectors/browserstack/manifest.json";
import bugbug from "../../../../runner/connectors/bugbug/manifest.json";
import builderIo from "../../../../runner/connectors/builder-io/manifest.json";
import buildium from "../../../../runner/connectors/buildium/manifest.json";
import businessmap from "../../../../runner/connectors/businessmap/manifest.json";
import callpage from "../../../../runner/connectors/callpage/manifest.json";
import campaignCleaner from "../../../../runner/connectors/campaign-cleaner/manifest.json";
import cardly from "../../../../runner/connectors/cardly/manifest.json";
import certifier from "../../../../runner/connectors/certifier/manifest.json";
import chargebee from "../../../../runner/connectors/chargebee/manifest.json";
import chaserhq from "../../../../runner/connectors/chaserhq/manifest.json";
import checkConnector from "../../../../runner/connectors/check/manifest.json";
import chorus from "../../../../runner/connectors/chorus/manifest.json";
import cin7Core from "../../../../runner/connectors/cin7-core/manifest.json";
import cincopa from "../../../../runner/connectors/cincopa/manifest.json";
import ciscoMeraki from "../../../../runner/connectors/cisco-meraki/manifest.json";
import cockroachLabs from "../../../../runner/connectors/cockroach-labs/manifest.json";
import conductor from "../../../../runner/connectors/conductor/manifest.json";
import dailyConnector from "../../../../runner/connectors/daily/manifest.json";
import databox from "../../../../runner/connectors/databox/manifest.json";
import dataforb2b from "../../../../runner/connectors/dataforb2b/manifest.json";
import digistore24 from "../../../../runner/connectors/digistore24/manifest.json";
import discolike from "../../../../runner/connectors/discolike/manifest.json";
import dixa from "../../../../runner/connectors/dixa/manifest.json";
import dovetail from "../../../../runner/connectors/dovetail/manifest.json";
import espocrm from "../../../../runner/connectors/espocrm/manifest.json";
import fellow from "../../../../runner/connectors/fellow/manifest.json";
import fern from "../../../../runner/connectors/fern/manifest.json";
import firehydrant from "../../../../runner/connectors/firehydrant/manifest.json";
import formbricks from "../../../../runner/connectors/formbricks/manifest.json";
import goody from "../../../../runner/connectors/goody/manifest.json";
import haveibeenpwned from "../../../../runner/connectors/haveibeenpwned/manifest.json";
import heartbeat from "../../../../runner/connectors/heartbeat/manifest.json";
import honeycomb from "../../../../runner/connectors/honeycomb/manifest.json";
import hotspotsystem from "../../../../runner/connectors/hotspotsystem/manifest.json";
import imagekit from "../../../../runner/connectors/imagekit/manifest.json";
import instabot from "../../../../runner/connectors/instabot/manifest.json";
import interzoid from "../../../../runner/connectors/interzoid/manifest.json";
import lifx from "../../../../runner/connectors/lifx/manifest.json";
import lodgify from "../../../../runner/connectors/lodgify/manifest.json";
import loyjoy from "../../../../runner/connectors/loyjoy/manifest.json";
import monicaCrm from "../../../../runner/connectors/monica-crm/manifest.json";
import moorcheh from "../../../../runner/connectors/moorcheh/manifest.json";
import nasdaq from "../../../../runner/connectors/nasdaq/manifest.json";
import needle from "../../../../runner/connectors/needle/manifest.json";
import nextDns from "../../../../runner/connectors/next-dns/manifest.json";
import ongage from "../../../../runner/connectors/ongage/manifest.json";
import polygonIo from "../../../../runner/connectors/polygon-io/manifest.json";
import practitest from "../../../../runner/connectors/practitest/manifest.json";
import supadata from "../../../../runner/connectors/supadata/manifest.json";
import supportbee from "../../../../runner/connectors/supportbee/manifest.json";
import surveyMonkey from "../../../../runner/connectors/survey-monkey/manifest.json";
import talenox from "../../../../runner/connectors/talenox/manifest.json";
import talentlms from "../../../../runner/connectors/talentlms/manifest.json";
import tapfiliate from "../../../../runner/connectors/tapfiliate/manifest.json";
import taxjar from "../../../../runner/connectors/taxjar/manifest.json";
import terraform from "../../../../runner/connectors/terraform/manifest.json";
import theDogApi from "../../../../runner/connectors/the-dog-api/manifest.json";
import theOfficialBoard from "../../../../runner/connectors/the-official-board/manifest.json";
import timelink from "../../../../runner/connectors/timelink/manifest.json";
import tomba from "../../../../runner/connectors/tomba/manifest.json";
import torii from "../../../../runner/connectors/torii/manifest.json";
import tremendous from "../../../../runner/connectors/tremendous/manifest.json";
import truvera from "../../../../runner/connectors/truvera/manifest.json";
import turso from "../../../../runner/connectors/turso/manifest.json";
import twelveData from "../../../../runner/connectors/twelve-data/manifest.json";
import vbout from "../../../../runner/connectors/vbout/manifest.json";
import waiverforever from "../../../../runner/connectors/waiverforever/manifest.json";
import webscraperIo from "../../../../runner/connectors/webscraper-io/manifest.json";
import whop from "../../../../runner/connectors/whop/manifest.json";
import workast from "../../../../runner/connectors/workast/manifest.json";
import workos from "../../../../runner/connectors/workos/manifest.json";
import workpath from "../../../../runner/connectors/workpath/manifest.json";
import wpMaps from "../../../../runner/connectors/wp-maps/manifest.json";
import zixflow from "../../../../runner/connectors/zixflow/manifest.json";
import zylvie from "../../../../runner/connectors/zylvie/manifest.json";

const installed = [
  ["ably", ably],
  ["ably-control", ablyControl],
  ["airbrake", airbrake],
  ["bugsnag", bugsnag],
  ["contentful", contentful],
  ["pagerduty", pagerduty],
  ["pingdom", pingdom],
  ["storyblok", storyblok],
  ["bunnycdn", bunnycdn],
  ["statuspage", statuspage],
  ["new-relic", newRelic],
  ["postmark", postmark],
  ["mailjet", mailjet],
  ["pipedrive", pipedrive],
  ["sentry", sentry],
  ["algolia", algolia],
  ["intercom", intercom],
  ["mailerlite", mailerlite],
  ["breathe", breathe],
  ["chartmogul", chartmogul],
  ["amplitude", amplitude],
  ["anydb", anydb],
  ["breezy-hr", breezyHr],
  ["checkly", checkly],
  ["mailersend", mailersend],
  ["emailoctopus", emailoctopus],
  ["omnisend", omnisend],
  ["readme", readme],
  ["configcat", configcat],
  ["codacy", codacy],
  ["statuscake", statuscake],
  ["cronitor", cronitor],
  ["plausible-analytics", plausibleAnalytics],
  ["sendfox", sendfox],
  ["uptimerobot", uptimerobot],
  ["acculynx", acculynx],
  ["gem", gem],
  ["formstack", formstack],
  ["companycam", companycam],
  ["clicksend", clicksend],
  ["gtmetrix", gtmetrix],
  ["gift-up", giftUp],
  ["elevenlabs", elevenlabs],
  ["deepgram", deepgram],
  ["gumroad", gumroad],
  ["booqable", booqable],
  ["beeminder", beeminder],
  ["active-trail", activeTrail],
  ["affinity", affinity],
  ["paymo", paymo],
  ["abyssale", abyssale],
  ["certn", certn],
  ["baremetrics", baremetrics],
  ["timecamp", timecamp],
  ["bigmailer", bigmailer],
  ["ayrshare", ayrshare],
  ["better-proposals", betterProposals],
  ["aircall", aircall],
  ["clerk", clerk],
  ["courier", courier],
  ["instatus", instatus],
  ["aftership", aftership],
  ["avoma", avoma],
  ["api-bible", apiBible],
  ["bestbuy", bestbuy],
  ["coingecko", coingecko],
  ["agent-mail", agentMail],
  ["agenty", agenty],
  ["alpha-vantage", alphaVantage],
  ["balldontlie-worldcup", balldontlieWorldcup],
  ["brex", brex],
  ["bug-herd", bugHerd],
  ["grafana", grafana],
  ["giphy", giphy],
  ["coderabbit", coderabbit],
  ["drata", drata],
  ["fly", fly],
  ["envoy", envoy],
  ["felt", felt],
  ["fluxguard", fluxguard],
  ["jobnimbus", jobnimbus],
  ["freshteam", freshteam],
  ["hr-partner", hrPartner],
  ["chattermill", chattermill],
  ["dailybot", dailybot],
  ["faraday", faraday],
  ["cats", cats],
  ["fireberry", fireberry],
  ["givebutter", givebutter],
  ["gleap", gleap],
  ["gamma", gamma],
  ["feathery", feathery],
  ["clearout", clearout],
  ["clickmeeting", clickmeeting],
  ["helpdesk", helpdesk],
  ["dns-filter", dnsFilter],
  ["crossref", crossref],
  ["daffy", daffy],
  ["glyphic", glyphic],
  ["eventzilla", eventzilla],
  ["esignatures-io", esignaturesIo],
  ["jumpseller", jumpseller],
  ["heyreach", heyreach],
  ["heyzine", heyzine],
  ["klipfolio", klipfolio],
  ["it-glue", itGlue],
  ["jiminny", jiminny],
  ["kaleido", kaleido],
  ["callingly", callingly],
  ["chargeblast", chargeblast],
  ["commpeak", commpeak],
  ["contactout", contactout],
  ["happy-scribe", happyScribe],
  ["headout", headout],
  ["financial-modeling-prep", financialModelingPrep],
  ["eodhd-apis", eodhdApis],
  ["circle", circle],
  ["intelliprint", intelliprint],
  ["genpage", genpage],
  ["api-sports", apiSports],
  ["chatarmin", chatarmin],
  ["cratedb-cloud", cratedbCloud],
  ["everhour", everhour],
  ["mailosaur", mailosaur],
  ["mailsoftly", mailsoftly],
  ["mailtrap", mailtrap],
  ["maintainx", maintainx],
  ["manus", manus],
  ["meet-geek", meetGeek],
  ["memberstack", memberstack],
  ["nango", nango],
  ["nethunt", nethunt],
  ["neverbounce", neverbounce],
  ["niftyimages", niftyimages],
  ["ninjapear", ninjapear],
  ["nozbe-teams", nozbeTeams],
  ["nusii-proposals", nusiiProposals],
  ["nyne-ai", nyneAi],
  ["octopus-deploy", octopusDeploy],
  ["openstatus", openstatus],
  ["ordinal", ordinal],
  ["paddle", paddle],
  ["pinecone", pinecone],
  ["planetscale", planetscale],
  ["planhat", planhat],
  ["plunk", plunk],
  ["polar", polar],
  ["postalytics", postalytics],
  ["postgrid", postgrid],
  ["precoro", precoro],
  ["rawg", rawg],
  ["referralhero", referralhero],
  ["reply-io", replyIo],
  ["respond-io", respondIo],
  ["retently", retently],
  ["revenuecat", revenuecat],
  ["ringg-ai", ringgAi],
  ["roboflow", roboflow],
  ["semantic-scholar", semanticScholar],
  ["sender", sender],
  ["simplesat", simplesat],
  ["sitespeakai", sitespeakai],
  ["openweather-api", openweatherApi],
  ["saas-custom-domains", saasCustomDomains],
  ["ghost", ghost],
  ["griptape", griptape],
  ["heyy", heyy],
  ["kommo", kommo],
  ["kustomer", kustomer],
  ["langsmith", langsmith],
  ["laposta", laposta],
  ["laravel-cloud", laravelCloud],
  ["lattice", lattice],
  ["lightfield", lightfield],
  ["listennotes", listennotes],
  ["loyverse", loyverse],
  ["missive", missive],
  ["mistral-ai", mistralAi],
  ["modjo-ai", modjoAi],
  ["mx-toolbox", mxToolbox],
  ["parma", parma],
  ["pdf-co", pdfCo],
  ["perigon", perigon],
  ["permit-io", permitIo],
  ["process-street", processStreet],
  ["productive", productive],
  ["qlty", qlty],
  ["quaderno", quaderno],
  ["quentn", quentn],
  ["quipteams", quipteams],
  ["raindrop", raindrop],
  ["raisely", raisely],
  ["sling", sling],
  ["stannp", stannp],
  ["stormboard", stormboard],
  ["17track", n17track],
  ["7-shifts", n7Shifts],
  ["ablefy", ablefy],
  ["accredible-certificates", accredibleCertificates],
  ["acuity-scheduling", acuityScheduling],
  ["adafruit-io", adafruitIo],
  ["addressfinder", addressfinder],
  ["addresszen", addresszen],
  ["adyen", adyen],
  ["affinda", affinda],
  ["agentql", agentql],
  ["agiled", agiled],
  ["agility", agility],
  ["agora", agora],
  ["ahrefs", ahrefs],
  ["aimfox", aimfox],
  ["airfocus", airfocus],
  ["aivoov", aivoov],
  ["alchemy", alchemy],
  ["algo-docs", algoDocs],
  ["alpaca", alpaca],
  ["alt-text-ai", altTextAi],
  ["altoviz", altoviz],
  ["amara", amara],
  ["ambient-weather", ambientWeather],
  ["ambivo", ambivo],
  ["amilia", amilia],
  ["anchor-browser", anchorBrowser],
  ["anrok", anrok],
  ["anthropic", anthropic],
  ["anthropic-admin", anthropicAdmin],
  ["anymail-finder", anymailFinder],
  ["api-void", apiVoid],
  ["apiflash", apiflash],
  ["apipie-ai", apipieAi],
  ["appcues", appcues],
  ["appstle-subscriptions", appstleSubscriptions],
  ["appveyor", appveyor],
  ["arcgis-online", arcgisOnline],
  ["asin-data-api", asinDataApi],
  ["assemblyai", assemblyai],
  ["atlas-so", atlasSo],
  ["attention", attention],
  ["autobound", autobound],
  ["autom", autom],
  ["avochato", avochato],
  ["bamboohr", bamboohr],
  ["bannerbear", bannerbear],
  ["baselinker", baselinker],
  ["basin", basin],
  ["beaconchain", beaconchain],
  ["beamer", beamer],
  ["benzinga", benzinga],
  ["bettercontact", bettercontact],
  ["bidsketch", bidsketch],
  ["big-commerce", bigCommerce],
  ["bigml", bigml],
  ["bird", bird],
  ["bitly", bitly],
  ["bitrise", bitrise],
  ["bland-ai", blandAi],
  ["blaze-meter-functional", blazeMeterFunctional],
  ["blaze-meter-performance", blazeMeterPerformance],
  ["blaze-meter-service-virtualization", blazeMeterServiceVirtualization],
  ["bloomerang", bloomerang],
  ["boldsign", boldsign],
  ["bolna", bolna],
  ["boloforms", boloforms],
  ["bookingmood", bookingmood],
  ["bot-star", botStar],
  ["botpress", botpress],
  ["botsonic", botsonic],
  ["bouncer", bouncer],
  ["boxhero", boxhero],
  ["brandfetch", brandfetch],
  ["breeze", breeze],
  ["bright-data", brightData],
  ["browse-ai", browseAi],
  ["browser-use", browserUse],
  ["browserbase", browserbase],
  ["browserstack", browserstack],
  ["bugbug", bugbug],
  ["builder-io", builderIo],
  ["buildium", buildium],
  ["businessmap", businessmap],
  ["callpage", callpage],
  ["campaign-cleaner", campaignCleaner],
  ["cardly", cardly],
  ["certifier", certifier],
  ["chargebee", chargebee],
  ["chaserhq", chaserhq],
  ["check", checkConnector],
  ["chorus", chorus],
  ["cin7-core", cin7Core],
  ["cincopa", cincopa],
  ["cisco-meraki", ciscoMeraki],
  ["cockroach-labs", cockroachLabs],
  ["conductor", conductor],
  ["daily", dailyConnector],
  ["databox", databox],
  ["dataforb2b", dataforb2b],
  ["digistore24", digistore24],
  ["discolike", discolike],
  ["dixa", dixa],
  ["dovetail", dovetail],
  ["espocrm", espocrm],
  ["fellow", fellow],
  ["fern", fern],
  ["firehydrant", firehydrant],
  ["formbricks", formbricks],
  ["goody", goody],
  ["haveibeenpwned", haveibeenpwned],
  ["heartbeat", heartbeat],
  ["honeycomb", honeycomb],
  ["hotspotsystem", hotspotsystem],
  ["imagekit", imagekit],
  ["instabot", instabot],
  ["interzoid", interzoid],
  ["lifx", lifx],
  ["lodgify", lodgify],
  ["loyjoy", loyjoy],
  ["monica-crm", monicaCrm],
  ["moorcheh", moorcheh],
  ["nasdaq", nasdaq],
  ["needle", needle],
  ["next-dns", nextDns],
  ["ongage", ongage],
  ["polygon-io", polygonIo],
  ["practitest", practitest],
  ["supadata", supadata],
  ["supportbee", supportbee],
  ["survey-monkey", surveyMonkey],
  ["talenox", talenox],
  ["talentlms", talentlms],
  ["tapfiliate", tapfiliate],
  ["taxjar", taxjar],
  ["terraform", terraform],
  ["the-dog-api", theDogApi],
  ["the-official-board", theOfficialBoard],
  ["timelink", timelink],
  ["tomba", tomba],
  ["torii", torii],
  ["tremendous", tremendous],
  ["truvera", truvera],
  ["turso", turso],
  ["twelve-data", twelveData],
  ["vbout", vbout],
  ["waiverforever", waiverforever],
  ["webscraper-io", webscraperIo],
  ["whop", whop],
  ["workast", workast],
  ["workos", workos],
  ["workpath", workpath],
  ["wp-maps", wpMaps],
  ["zixflow", zixflow],
  ["zylvie", zylvie],
] as const;

describe("curated recipe install", () => {
  test("installed identities do not introduce registry drift", () => {
    for (const [key] of installed) {
      const registered = defaultConnectorRegistry.describe(key);
      if (registered) expect(registered.key).toBe(key);
    }
  });

  test("installed manifests preserve recipe operations and strict flags", async () => {
    for (const [key, manifest] of installed) {
      const recipeKey = key.replaceAll("-", "_");
      const recipe = await Bun.file(`scripts/connector-gen/openconnector/recipes/${recipeKey}/recipe.json`).json();
      expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
      expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
      expect({ ...manifest.provenance?.source, url: manifest.provenance?.source?.url?.replace(/\.git$/, "") }).toEqual({ url: recipe.source.url.replace(/\.git$/, ""), revision: recipe.source.revision });
      expect(recipe.manifest.evidence).toEqual(manifest.evidence);
      expect(recipe.manifest.provenance).toEqual(manifest.provenance);
      if (key === "pagerduty") expect(manifest.auth.setup.fields[0].label).toContain("personal user token");
      for (const operation of Object.values(manifest.operations) as Array<Record<string, unknown>>) {
        expect(operation.enforceOutputSchema).toBe(true);
        expect(operation.responseFormat).toBe("json");
        expect(operation.validationMode).toBe("strict-generated");
      }
    }
  });

  test("replays every installed recipe fixture case", async () => {
    for (const [key, manifest] of installed) {
      const recipeKey = key.replaceAll("-", "_");
      const dir = `runner/connectors/${key}`;
      const cases = loadFixtureCases(`${dir}/fixtures/cases`);
      const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.every((run) => run.status === "passed")).toBe(true);
      expect(new Set(cases.map((fixture) => fixture.operation))).toEqual(new Set(Object.keys(manifest.operations)));
      expect(recipeKey).toBeTruthy();
    }
  });
});
