use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Manifest {
    pub key: String,
    pub name: String,
    pub version: String,
    pub runtime: String,
    pub visibility: String,
    pub categories: Vec<String>,
    pub auth: AuthConfig,
    pub network: NetworkConfig,
    pub operations: BTreeMap<String, Operation>,
    pub models: Vec<String>,
    pub icon_url: String,
}
impl Manifest {
    pub fn is_public(&self) -> bool {
        self.visibility.is_empty() || self.visibility == "public"
    }
    pub fn has_category(&self, category: &str) -> bool {
        let wanted = category.trim().to_lowercase();
        !wanted.is_empty()
            && self
                .categories
                .iter()
                .any(|c| c.trim().to_lowercase() == wanted)
    }

    /// Registrable provider host used for identity, never an API/CDN label.
    pub fn brand_host(&self) -> Option<String> {
        self.network
            .allowed_hosts
            .iter()
            .filter_map(|host| brand_host(host))
            .next()
            .or_else(|| host_from_url(&self.auth.setup.docs_url))
            .or_else(|| {
                self.auth.oauth.as_ref().and_then(|oauth| {
                    [&oauth.authorize_url, &oauth.token_url]
                        .into_iter()
                        .find_map(|url| host_from_url(url))
                })
            })
            .or_else(|| {
                PRODUCT_HOSTS
                    .iter()
                    .find(|(key, _)| *key == self.key)
                    .map(|(_, host)| (*host).to_owned())
            })
    }

    /// HTTPS icon address. Prefers an explicit manifest URL, then a curated
    /// provider icon, otherwise the provider's own `/favicon.ico`.
    pub fn resolved_icon_url(&self) -> Option<String> {
        let explicit = self.icon_url.trim();
        if !explicit.is_empty() {
            return Some(explicit.to_owned());
        }
        if let Ok(index) =
            PROVIDER_ICON_OVERRIDES.binary_search_by_key(&self.key.as_str(), |(key, _)| *key)
        {
            return Some(PROVIDER_ICON_OVERRIDES[index].1.to_owned());
        }
        Some(match self.brand_host() {
            Some(host) => format!("https://{host}/favicon.ico"),
            None => FIRST_PARTY_ICON.to_owned(),
        })
    }
}

const FIRST_PARTY_ICON: &str = "https://github.com/getmeosu.png";

const PRODUCT_HOSTS: &[(&str, &str)] = &[
    ("confluence", "atlassian.com"),
    ("gitlab", "gitlab.com"),
    ("lemmy", "join-lemmy.org"),
    ("mastodon", "joinmastodon.org"),
    ("wordpress", "wordpress.org"),
];

// Published connector brand icons for APIs whose own hosts do not serve a
// suitable logo. URLs come from provider homepages or integration catalogs and
// were checked as image responses. Keep this sorted; explicit manifest URLs
// take precedence.
const PROVIDER_ICON_OVERRIDES: &[(&str, &str)] = &[
    ("17track", "https://res.17track.net/global-v2/imgs/oauth_image/apple_touch_152x152.png"),
    ("ably", "https://ably.com/favicon.svg"),
    ("abyssale", "https://cdn.prod.website-files.com/672b6e17b837fe6d8ed6a300/6786ac20451b8df002cdfc31_Favicon%2032x32.png"),
    ("accredible-certificates", "https://cdn.prod.website-files.com/65f2558d9f3ac6c64f1b8bb1/661af3f6ce45512f8d8360b0_Favicon-256.png"),
    ("active-trail", "https://www.activetrail.com/wp-content/themes/activetrail_new/images/favicon_new.ico"),
    ("addressfinder", "https://addressfinder.com/_next/static/media/apple-touch.1deae2ab.png"),
    ("addresszen", "https://addresszen.com/favicon.svg"),
    ("adyen", "https://www.adyen.com/icon.svg"),
    ("agentql", "https://www.agentql.com/favicon/favicon-512x512.png"),
    ("agiled", "https://agiled.app/favicon.ico?favicon.0b3bf435.ico"),
    ("agility", "https://pipedream.com/s.v0/app_E7h24B/logo/orig"),
    ("agora", "https://cdn.prod.website-files.com/660affa848e8af81bdd03909/66c71fa4c832213b24f804b9_webclip.png"),
    ("ahrefs", "https://pipedream.com/s.v0/app_13GhDY/logo/orig"),
    ("airbrake", "https://cdn.prod.website-files.com/627981c6e9ed95388efb41ab/6320ead9f8aee1525ce2184c_profile%20A%20orange%202.png"),
    ("airfocus", "https://airfocus.com/icons/icon-512x512.png?v=23206af13918f4ec72b2582ef7d0e3c7"),
    ("aivoov", "https://aivoov.com/assets/images/icons/apple-touch-icon-144-precomposed.png"),
    ("alchemy", "https://media.alchemy.com/1699253173-alchemy-logo.svg"),
    ("algolia", "https://cdn.activepieces.com/pieces/algolia.png"),
    ("alpaca", "https://files.alpaca.markets/webassets/apple-touch-icon.png"),
    ("alpha-vantage", "https://www.alphavantage.co/static/img/favicon.ico"),
    ("alt-text-ai", "https://cdn.activepieces.com/pieces/alt-text-ai.png"),
    ("amara", "https://static.amara.org/53ccd5a5/img/apple-touch-icon.png"),
    ("ambivo", "https://media.ambivo.com/web_ambivo_6a938096/media/6aa4b1192967678ea6b3c96e/ambivo-site-icon.png"),
    ("amplitude", "https://pipedream.com/s.v0/app_XBxh84/logo/orig"),
    ("anchor-browser", "https://cdn.prod.website-files.com/68e76a236cc487333075990b/68e76a236cc487333075996a_webclip.png"),
    ("anrok", "https://cdn.prod.website-files.com/6a21f79213f446e3c87533b9/6a319bfa8cef9e2decaef6ab_webclip.png"),
    ("anydb", "https://www.anydb.com/images/apple-touch-icon.png"),
    ("api-sports", "https://pipedream.com/s.v0/app_1M0hWz/logo/orig"),
    ("appcues", "https://cdn.prod.website-files.com/6a3458f1671a8f55edaa1863/6a4525ad4b26717fdcc19e78_workspaceicon.png"),
    ("appstle-subscriptions", "https://appstle.com/wp-content/uploads/2021/03/Appstle-Favicon.png"),
    ("ashby", "https://cdn.activepieces.com/pieces/ashby.png"),
    ("asin-data-api", "https://trajectdata.com/wp-content/uploads/2024/08/cropped-traject-profile-192x192.webp"),
    ("attention", "https://cdn.prod.website-files.com/66c6eb8376ae25cee9273195/66e009849f76b63bc43dc3e8_Webclip.png"),
    ("autobound", "https://www.autobound.ai/apple-icon?714a9acd369609a6"),
    ("autom", "https://www.autom.dev/icon.png?icon.031x~1_ht8sln.png"),
    ("avochato", "https://assets.avochato.com/assets/favicon-256-c559d43ca09866bf7c0c7b91b1acaf829cf744c697b90bee18adc0edb440e46f.ico"),
    ("avoma", "https://cdn.activepieces.com/pieces/avoma.png"),
    ("bannerbear", "https://cdn.activepieces.com/pieces/bannerbear.png"),
    ("baremetrics", "https://cdn.activepieces.com/pieces/baremetrics.png"),
    ("baselinker", "https://base.com/assets/images/favicons/base.com/android-icon-512x512.png"),
    ("basin", "https://usebasin.com/assets/favicon-2feb1d6a0d5241da50e0c6ce377835be3b6f3be7dec80a40a074f1a20d32d165.png"),
    ("beaconchain", "https://docs.beaconcha.in/mintlify-assets/_mintlify/favicons/bitflyexplorergmbh/ql_f-FKhQdaMtpRp/_generated/favicon/android-chrome-192x192.png"),
    ("beamer", "https://cdn.activepieces.com/pieces/beamer.png"),
    ("beehiiv", "https://cdn.activepieces.com/pieces/beehiiv.png"),
    ("better-proposals", "https://betterproposals.io/2/img/icons/favicon_144.png"),
    ("better-stack", "https://betterstack.com/assets/favicon-64296699.png"),
    ("bettercontact", "https://bettercontact.rocks/assets/bettercontact-mark.png"),
    ("big-commerce", "https://cdn.activepieces.com/pieces/bigcommerce.png"),
    ("bigmailer", "https://www.bigmailer.io/wp-content/uploads/2023/09/cropped-bigmailer_favicon-192x192.png"),
    ("bigml", "https://static.bigml.com/static/favicon.ico?v=2"),
    ("bitly", "https://cdn.activepieces.com/pieces/bitly.png"),
    ("blaze-meter-functional", "https://www.blazemeter.com/themes/custom/p4base/assets/favicons/blz/android-chrome-512x512.png"),
    ("blaze-meter-performance", "https://www.blazemeter.com/themes/custom/p4base/assets/favicons/blz/android-chrome-512x512.png"),
    ("bloomerang", "https://cdn.prod.website-files.com/696e28ecf85c5265341ed1b9/696e2936b6bedac51f7e32e2_bloomerang-256.png"),
    ("boloforms", "https://www.boloforms.com/_next/static/media/logo.a7bd82db.svg"),
    ("bot-star", "https://botstar.com/src/assets/favicons/android-chrome-512x512.png?v=2c002a9f44aff48f867b09b7d4b629d5"),
    ("botsonic", "https://cdn.prod.website-files.com/65e6ec2daf39c088fe6cd402/65e89bc0a967c0e47d3476b8_Frame%201116605940.svg"),
    ("bouncer", "https://www.usebouncer.com/wp-content/uploads/2024/09/cropped-bouncer_ICONA_owal-1-192x192.png"),
    ("boxhero", "https://framerusercontent.com/images/2Z7lPX9m1fn334fcoH0yF8jhk.png"),
    ("breathe", "https://www.breathehr.com/hubfs/Breathe%20logo%20website%20favicon%2048%20x%2048-1.png"),
    ("breeze", "https://cdn.prod.website-files.com/63e2e08df72ab98959f09628/63fcebcb62c1d7476b9118c2_webclip.png"),
    ("breezy-hr", "https://cdn.prod.website-files.com/6127d83f257132e4fe0bddc6/620bbab0cc5dd2869894749c_breezyhr-icon-large.png"),
    ("brevo", "https://www.brevo.com/favicon.ico"),
    ("bright-data", "https://cdn.zapier.com/img/developer_cli/84086990f445c1d3bfd1a0ca4df1fff0_2.png?size=64x64"),
    ("browse-ai", "https://cdn.activepieces.com/pieces/browse-ai.png"),
    ("bug-herd", "https://cdn.prod.website-files.com/5f348cefc28f73bfbed5b00a/5f348cefc28f732fc1d5b077_bug_logo.png"),
    ("bugsnag", "https://imagedelivery.net/PVooPtpJE-25QaNkbEuXvw/19ef04f9-e12a-4978-585b-3e57e97f3000/public"),
    ("buildium", "https://www.buildium.com/wp-content/uploads/2017/06/Buildium-favicon.png"),
    ("businessmap", "https://businessmap.io/images/favicon.ico"),
    ("caldav", "https://www.icloud.com/favicon.ico"),
    ("callingly", "https://callingly.com/img/pricing/cropped-Callingly_Logomark_FullColor2-192x192.png"),
    ("callpage", "https://www.callpage.io/images/favicon.ico"),
    ("canny", "https://cdn.activepieces.com/pieces/canny.png"),
    ("capsule-crm", "https://cdn.activepieces.com/pieces/capsule-crm.png"),
    ("cats", "https://catsone.com/wp-content/uploads/2020/05/cropped-white-mark-gradient-bg-2-192x192.png"),
    ("certifier", "https://certifier.io/favicon/apple-touch-icon.png"),
    ("certn", "https://certn.co/wp-content/uploads/2026/05/cropped-logo-social-192x192.png"),
    ("chargeblast", "https://www.chargeblast.com/favicon.png?any=param"),
    ("chartmogul", "https://chartmogul.com/-/brand/icon-180.png?v=cEfSdoDQ4L"),
    ("chaserhq", "https://www.chaserhq.com/hubfs/Chaser%20logo%20600x600-100.jpg"),
    ("chattermill", "https://cdn.prod.website-files.com/6a36b907304a6968500f05b9/6a5c013f8b3b5aba0f4ba4b8_62c29071261b697fe42f048a_Webclip.png"),
    ("check", "https://cdn.prod.website-files.com/66bc5326faf12d39519ab28f/66bc53ab898100af8617a01e_Frame%20(2).png"),
    ("chorus", "https://cdn.zapier.com/img/developer_cli/2373949cd4937dc6f016c8061cd7451a_2.png?size=32x32"),
    ("cin7-core", "https://www.cin7.com/hubfs/image/logo/cin7/cin7-favicon-2023.jpeg"),
    ("cisco-meraki", "https://pipedream.com/s.v0/app_mqehJj/logo/orig"),
    ("clearout", "https://cdn.activepieces.com/pieces/clearout.png"),
    ("clerk", "https://clerk.com/v2/favicon.ico"),
    ("clickmeeting", "https://sc.stat-cdn.com/content/uploads/2025/07/cropped-apple-touch-icon-1-192x192.webp"),
    ("cockroach-labs", "https://www.cockroachlabs.com/icon1.png?38190d312b196e2c"),
    ("coda", "https://cdn.activepieces.com/pieces/coda.png"),
    ("codacy", "https://cdn.prod.website-files.com/696e13606c58a2cfbf96ace3/69917f7c1127be0de2bfff25_webclip.png"),
    ("commpeak", "https://www.commpeak.com/favicon.ico"),
    ("companycam", "https://cdn.companycam.com/dist/img/site/favicon-96x96-2021.png"),
    ("conductor", "https://www.conductor.com/favicons/apple-touch-icon.png"),
    ("cratedb-cloud", "https://console.cratedb.cloud/favicon.png"),
    ("cronitor", "https://cdn.cronitor.io/static/img/favicon.4a228b95944f.png"),
    ("daffy", "https://www.daffy.org/apple-touch-icon/180.png"),
    ("daily", "https://www.daily.co/icon.png?icon.3apzgf19zqf4s.png"),
    ("discolike", "https://discolike.com/images/favicon-light.png"),
    ("discord", "https://cdn.activepieces.com/pieces/discord.png"),
    ("dixa", "https://cdn.prod.website-files.com/694a79a0b33f026ed61a478b/6a4caeea3cb10dcecacaaa17_logo%20dark.jpeg"),
    ("dribbble", "https://dribbble.com/images/favicon-64x64.png"),
    ("dropbox", "https://cdn.activepieces.com/pieces/dropbox.png"),
    ("espocrm", "https://www.espocrm.com/images/favicon-96x96.png"),
    ("eventzilla", "https://www.eventzilla.net/wp-content/uploads/2024/10/eventzillanewfavicon.svg"),
    ("everhour", "https://cdn.activepieces.com/pieces/everhour.png"),
    ("feathery", "https://cdn.activepieces.com/pieces/feathery.png"),
    ("featurebase", "https://www.featurebase.app/favicon.svg"),
    ("fellow", "https://cdn.activepieces.com/pieces/fellow.png"),
    ("felt", "https://cdn.prod.website-files.com/610b3b739dae2ec5c91c8b4a/6a8325c9b7a2ad4d09566df8_felt-favicon-256.png"),
    ("fern", "https://framerusercontent.com/images/IhCJwFNg7BYPiaWQJd7h1hnvqk.svg"),
    ("fireberry", "https://cdn.activepieces.com/pieces/fireberry.png"),
    ("float", "https://cdn.prod.website-files.com/65efdf52a39c7b2ca4035c98/661dd6199c1807ddb7360905_icon-256x256.png"),
    ("folk", "https://cdn.activepieces.com/pieces/folk.png"),
    ("formstack", "https://cdn.activepieces.com/pieces/formstack.png"),
    ("freshdesk", "https://cdn.activepieces.com/pieces/freshdesk.png"),
    ("freshsales", "https://cdn.activepieces.com/pieces/freshsales.png"),
    ("freshteam", "https://developers.freshteam.com/images/favicon.ico"),
    ("gamma", "https://cdn.activepieces.com/pieces/gamma.png"),
    ("gem", "https://www.gem.com/webassets/fav.png"),
    ("ghost", "https://docs.ghost.org/images/74e0ffae-ghost-logo-orb.png"),
    ("gleap", "https://www.gleap.ai/favicon.svg"),
    ("glyphic", "https://www.goairspeed.com/images/favicon.svg"),
    ("goody", "https://assets.ongoody.com/assets/logo192-c68c5a8fd1f3e40ba74befb418534556fde080b14ac5eb3b08fadf486b3f680d.png"),
    ("google-ads", "https://business.google.com/static/images/google-favicon-180.png"),
    ("google-workspace", "https://www.gstatic.com/images/branding/googleg_gradient/1x/googleg_gradient_standard_20dp.png"),
    ("googlemeet", "https://www.gstatic.com/images/branding/productlogos/meet_2026/v2/web/192px.svg"),
    ("griptape", "https://cdn.activepieces.com/pieces/griptape.png"),
    ("hashnode", "https://hashnode.com/icon0.svg?icon0.3077b4da.svg"),
    ("headout", "https://www.headout.com/static/favicons/favicon-1024x1024.png"),
    ("heartbeat", "https://cdn.activepieces.com/pieces/heartbeat.png"),
    ("helpscout", "https://cdn.activepieces.com/pieces/help-scout.png"),
    ("heyreach", "https://cdn.prod.website-files.com/6a295ff72cf042cd2bb5d03a/6a2961140e583986f645e176_HQ-Favicon-1000x1000.png"),
    ("hr-partner", "https://www.hrpartner.io/img/apple-touch-icon-114x114.png"),
    ("hubspot", "https://cdn.activepieces.com/pieces/hubspot.png"),
    ("instagram-standalone", "https://static.xx.fbcdn.net/rsrc.php/y_/r/x53xeSDtIeM.webp"),
    ("intelliprint", "https://cdn.sanity.io/images/qcghmu1m/production/e6961d036f832b81763c71fc8c3cbd9e7c74fe23-128x128.png?w=32&h=32&fit=max&auto=format"),
    ("intercom", "https://cdn.activepieces.com/pieces/intercom.png"),
    ("interzoid", "https://interzoid.com/public/images/interzoid-icon.png"),
    ("it-glue", "https://www.itglue.com/wp-content/uploads/cropped-logomark-itglue-black@4x-192x192.png"),
    ("jiminny", "https://cdn.prod.website-files.com/68c8ef0efabcba7ebad59e0f/68cbdec884e60d8954721fa9_webclip.png"),
    ("jobnimbus", "https://webappui.jobnimbus.com/images/favicon.png?v=1.3"),
    ("jumpseller", "https://jumpseller.com/images/brand/jumpseller-logo-26.svg"),
    ("klaviyo", "https://cdn.activepieces.com/pieces/klaviyo.png"),
    ("kustomer", "https://cdn.activepieces.com/pieces/kustomer.png"),
    ("laposta", "https://framerusercontent.com/images/TZJqfBpO8eRBIVylvfHWa5iHQ.png"),
    ("laravel-cloud", "https://laravel.com/images/cloud/apple-touch-icon-light.png"),
    ("lattice", "https://cdn.prod.website-files.com/64ad6f1aef87635bd23449f1/66cc32ff351ef8f537c817c9_lattice-webclip-256.png"),
    ("lemmy", "https://join-lemmy.org/static/assets/icons/favicon.svg"),
    ("lever", "https://cdn.activepieces.com/pieces/lever.png"),
    ("lifx", "https://www.lifx.com/cdn/shop/files/lifx.png?crop=center&height=32&v=1772566359&width=32"),
    ("linkedin", "https://cdn.activepieces.com/pieces/linkedin.png"),
    ("linkedin-ads", "https://cdn.zapier.com/img/developer/82e76b99c17c252653cee811b4e46123.png?size=32x32"),
    ("listennotes", "https://www.listennotes.com/static/v4/img/logo/apple-touch-icon.png"),
    ("lodgify", "https://cdn.prod.website-files.com/6a0183d56ceb2deec6fd2e8c/6a0183d56ceb2deec6fd3218_webclip%20(1).svg"),
    ("loops", "https://cdn.activepieces.com/pieces/loops.png"),
    ("loyjoy", "https://www.loyjoy.com/apple-touch-icon.png"),
    ("mailerlite", "https://cdn.activepieces.com/pieces/mailer-lite.png"),
    ("mailersend", "https://www.mailersend.com/img/containers/favicon/apple-touch-icon.png/94e539193bb716b3a3d57fe5e3805022.png"),
    ("mailosaur", "https://mailosaur.com/favicon/apple-touch-icon.png"),
    ("maintainx", "https://cdn.prod.website-files.com/65ae6673d2c6ecb99ee249d1/6614e79c93cd2cbe7d24bace_webClip-9.png"),
    ("mastodon", "https://cdn.activepieces.com/pieces/mastodon.png"),
    ("meet-geek", "https://cdn.prod.website-files.com/63af97f08f22087ab0e44f0a/63bcb98e8eab05a5e0004c20_MeetGeek%20Webclip.png"),
    ("memberstack", "https://www.memberstack.com/favicon.ico?favicon.2a-xmi3hoj5hj.ico"),
    ("mixpanel", "https://cdn.activepieces.com/pieces/mixpanel.png"),
    ("modjo-ai", "https://cdn.prod.website-files.com/66be0d765321aefa523a062f/68d298e2ccb2a814fa008e65_Group%20(8).png"),
    ("new-relic", "https://pipedream.com/s.v0/app_1YMhVQ/logo/orig"),
    ("ninjapear", "https://nubela.co/assets/images/logomark.svg"),
    ("notion", "https://cdn.activepieces.com/pieces/notion.png"),
    ("nozbe-teams", "https://nozbe.com/images/base/favicon/196x196.png"),
    ("nusii-proposals", "https://nusii.com/images/favicon.ico"),
    ("nyne-ai", "https://images.mindcloud.co/apps/icons/nyne-ai_1776859837917.png?auto=format%2Ccompress&fit=max&h=384&q=75&w=384"),
    ("octopus-deploy", "https://octopus.com/octopus-public/images/(global)/apple-touch-icon.png"),
    ("parma", "https://www.parma.ai/images/webclip.png"),
    ("perigon", "https://perigon.io/apple-touch-icon.png"),
    ("planhat", "https://framerusercontent.com/images/Ryii4s5qcjHmFMxKyur3Yasiv8.png"),
    ("plausible-analytics", "https://dashboardicons.com/api/icons/external/simpleicons/plausibleanalytics/brand.png"),
    ("plunk", "https://cdn.activepieces.com/pieces/plunk.png"),
    ("polygon-io", "https://massive.com/brands/favicon-massive.png"),
    ("postalytics", "https://cdn-dnili.nitrocdn.com/RYgOpzWWSRYjdAFBrxpYmSLGTPsKUeEf/assets/images/optimized/rev-2ad5514/www.postalytics.com/wp-content/uploads/2017/07/cropped-postalytics-icon-192x192.png"),
    ("precoro", "https://precoro.com/build/images/apple-touch-icon.tE3_lUJ_.png"),
    ("process-street", "https://www.process.st/wp-content/themes/koombea/icons/favicon-194x194.png"),
    ("productive", "https://cdn.prod.website-files.com/69273e1d1bd1fcfcff2fe0d4/692d4e1ddbb0bdee9e624f23_68bd8252212540550b46f92f_webclip.png"),
    ("qlty", "https://qlty.sh/site-assets/qlty-webclip.png"),
    ("quentn", "https://quentn.com/assets/q_180x180.png"),
    ("quickbooks", "https://cdn.activepieces.com/pieces/quickbooks.png"),
    ("quipteams", "https://cdn.prod.website-files.com/6602d7b13a07ddf1faf45071/664fbfa57432e559c83b458c_output-onlinepngtools%20(18).png"),
    ("raisely", "https://cdn.prod.website-files.com/68f6c4a3bcdca22a4de5c375/694f53c6b17a8dac90621ef3_faviconV2-256.png"),
    ("referralhero", "https://cdn.prod.website-files.com/5bd46dbb79b649c10ddb501e/5c93ae116d7dd03dea9822a6_R%20copy.png"),
    ("resend", "https://cdn.activepieces.com/pieces/resend.png"),
    ("revenuecat", "https://www.revenuecat.com/favicon/favicon.png"),
    ("ringg-ai", "https://www.ringg.ai/favicon.ico?favicon.0as-kfawhwor2.ico"),
    ("roboflow", "https://cdn.prod.website-files.com/5f6bc60e665f54545a1e52a5/610d3ee6a089f7b63d8a6151_256.png"),
    ("rollbar", "https://framerusercontent.com/images/qTJivTcYNcnAWnr9sUB8W3ooZA.png"),
    ("saas-custom-domains", "https://saascustomdomains.com/favicon.svg"),
    ("salesflare", "https://app.salesflare.com/images/fav/favicon-192x192.png?v=2"),
    ("saleshandy", "https://cdn.zapier.com/img/developer_cli/d020518bdc4c0ce2f80ca7dfefe816a1.png?size=32x32"),
    ("sender", "https://cdn.activepieces.com/pieces/sender.png"),
    ("sendfox", "https://cdn.activepieces.com/pieces/sendfox.png"),
    ("sentry", "https://pipedream.com/s.v0/app_XywheN/logo/orig"),
    ("shopify", "https://cdn.activepieces.com/pieces/shopify.png"),
    ("shortcut", "https://www.shortcut.com/favicons/production/apple-touch-icon.png"),
    ("simple-analytics", "https://pipedream.com/s.v0/app_mWnh4v/logo/orig"),
    ("simplesat", "https://cdn.prod.website-files.com/69835c4172c253147f762dca/6a4f65a806b7e597901b774a_simplesat-icon.png"),
    ("stannp", "https://www.stannp.com/favicon.ico"),
    ("statuspage", "https://www.atlassian.com/apple-touch-icon.png"),
    ("tapfiliate", "https://cdn.activepieces.com/pieces/tapfiliate.png"),
    ("taxjar", "https://www.taxjar.com/wp-content/themes/TaxJar/assets/images/apple-icon-touch.png"),
    ("terraform", "https://www.datocms-assets.com/2885/1774300442-tf_product_identity.svg"),
    ("threads", "https://static.cdninstagram.com/rsrc.php/yP/r/0Qa-AOmHi0c.ico"),
    ("tiktok-ads", "https://business.tiktok.com/favicon.ico"),
    ("timelink", "https://timelink.io/themes/timelink/assets/images/timelink_bookmark_signet_ivory.png"),
    ("truvera", "https://truvera.io/favicon.png"),
    ("twelve-data", "https://twelvedata.com/build/favicons/favicon-512.png"),
    ("typeform", "https://cdn.activepieces.com/pieces/typeform.png"),
    ("unipile", "https://www.unipile.com/wp-content/uploads/2020/12/cropped-favicon-300x300.png"),
    ("woocommerce", "https://cdn.activepieces.com/pieces/woocommerce.png"),
    ("workast", "https://www.workast.com/assets/icons/icon-512x512.png?v=13ef3f0cfb1743819baadd68fe617602"),
    ("workpath", "https://cdn.prod.website-files.com/5dc2f8d7ea14a892a3808af7/630de2415edb520b2d489aa6_256x256.png"),
    ("wp-maps", "https://wpmaps.com/wp-content/themes/wpm/images/wp-maps-logo-fav.ico"),
];

fn host_from_url(value: &str) -> Option<String> {
    url::Url::parse(value.trim())
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .and_then(|host| brand_host(&host))
}

const SERVICE_LABELS: &[&str] = &[
    "api", "apis", "api2", "app", "apps", "rest", "graph", "hooks", "hook", "webhook", "webhooks",
    "events", "event", "ws", "wss", "www", "m", "mobile", "cdn", "static", "upload", "uploads",
    "files", "file", "media",
];

fn brand_host(host: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.contains('/') || host.contains(':') {
        return None;
    }
    let host = host.strip_prefix("*.").unwrap_or(&host);
    let mut labels: Vec<&str> = host
        .split('.')
        .filter(|label| !label.is_empty() && *label != "*" && !label.contains('{'))
        .collect();
    while labels.len() > 2 && SERVICE_LABELS.contains(&labels[0]) {
        labels.remove(0);
    }
    let valid = labels.len() >= 2
        && labels.iter().all(|label| {
            let bytes = label.as_bytes();
            !bytes.is_empty()
                && bytes[0] != b'-'
                && bytes[bytes.len() - 1] != b'-'
                && bytes
                    .iter()
                    .all(|b| b.is_ascii_alphanumeric() || *b == b'-')
        });
    valid.then(|| labels.join("."))
}

#[cfg(test)]
mod icon_override_tests {
    use super::{Manifest, PROVIDER_ICON_OVERRIDES};
    use std::path::Path;

    #[test]
    fn provider_icon_overrides_are_sorted_unique_https_urls() {
        assert_eq!(
            PROVIDER_ICON_OVERRIDES.len(),
            220,
            "the current public catalog has 220 previously broken visible connector icons"
        );

        let mut previous = None;
        for (key, value) in PROVIDER_ICON_OVERRIDES {
            assert!(!key.is_empty(), "provider icon key must not be empty");
            assert!(
                previous.is_none_or(|previous| previous < *key),
                "provider icon keys must be strictly sorted and unique"
            );
            assert!(
                value.starts_with("https://"),
                "provider icon URL for {key} must use HTTPS"
            );
            previous = Some(*key);
        }
    }

    #[test]
    fn explicit_manifest_icon_precedes_provider_icon_override() {
        let manifest = Manifest {
            key: "ably".to_owned(),
            icon_url: "https://assets.example.test/ably.svg".to_owned(),
            ..Default::default()
        };

        assert_eq!(
            manifest.resolved_icon_url().as_deref(),
            Some("https://assets.example.test/ably.svg")
        );
    }

    #[test]
    fn every_provider_icon_override_resolves_for_a_public_connector() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/connectors");
        let registry = crate::Registry::load(root).expect("connector registry loads");

        for (key, expected_url) in PROVIDER_ICON_OVERRIDES {
            let connector = registry
                .public_list()
                .find(|connector| connector.manifest().key == *key)
                .unwrap_or_else(|| panic!("curated icon key {key} must name a public connector"));
            assert_eq!(
                connector.manifest().resolved_icon_url().as_deref(),
                Some(*expected_url),
                "curated icon for {key} must be used by its public connector"
            );
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub type_: String,
    pub scopes: Vec<String>,
    pub setup: SetupConfig,
    pub oauth: Option<OAuthConfig>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OAuthConfig {
    pub authorize_url: String,
    pub token_url: String,
    pub pkce: bool,
    pub supports_refresh: bool,
    pub client_auth: String,
    pub version: String,
    pub extra_auth_params: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupConfig {
    pub mode: String,
    pub fields: Vec<SetupField>,
    pub help: String,
    pub docs_url: String,
    pub routes: Vec<SetupRoute>,
    pub derive: Vec<DeriveField>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupField {
    pub key: String,
    pub label: String,
    pub required: bool,
    pub secret: bool,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SetupRoute {
    pub id: String,
    pub label: String,
    pub fields: Vec<SetupField>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DeriveField {
    pub field: String,
    pub kind: String,
    pub from: Vec<String>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NetworkConfig {
    pub allowed_hosts: Vec<String>,
    pub egress: String,
}
impl NetworkConfig {
    pub fn makes_outbound_calls(&self) -> bool {
        self.egress != "none"
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OperationKind {
    Action,
    Sync,
    Webhook,
    #[default]
    Unknown,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SideEffect {
    Read,
    Write,
    Destructive,
}
/// Manifest effect policy for mutating connector ops.
/// `Reconcile` means the runner observes post-write state via `reconcile`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum EffectPolicy {
    #[default]
    None,
    Idempotent,
    Reconcile,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Operation {
    pub kind: OperationKind,
    pub timeout_ms: i64,
    pub max_input_bytes: i64,
    pub max_response_bytes: i64,
    pub title: String,
    pub description: String,
    pub input_schema: Option<Value>,
    pub output_schema: Option<Value>,
    pub sample: Option<Value>,
    pub side_effect: String,
    pub effect_policy: EffectPolicy,
    pub reconcile: String,
}
impl Operation {
    pub fn has_tool_schema(&self) -> bool {
        self.kind == OperationKind::Action
            && !self.description.trim().is_empty()
            && self.input_schema.as_ref().is_some_and(Value::is_object)
    }
    pub fn side_effect_kind(&self) -> SideEffect {
        match self.side_effect.as_str() {
            "read" => SideEffect::Read,
            "destructive" => SideEffect::Destructive,
            _ => SideEffect::Write,
        }
    }
    pub fn is_read_only(&self) -> bool {
        self.side_effect_kind() == SideEffect::Read
    }
    pub fn is_destructive(&self) -> bool {
        self.side_effect_kind() == SideEffect::Destructive
    }
}
