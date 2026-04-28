import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";

import CompanyProfile      from "./settings/CompanyProfile";
import ApiKeySection      from "./settings/ApiKeySection";
import WidgetSection       from "./settings/WidgetSection";
import ProductsSection     from "./settings/ProductsSection";
import AgentSoulSection    from "./settings/AgentSoulSection";
import DataApiSection      from "./settings/DataApiSection";
import WebhooksSection     from "./settings/WebhooksSection";
import LabelsSection       from "./settings/LabelsSection";
import ConnectorsSection   from "./settings/ConnectorsSection";
import EmailTemplatesSection from "./settings/EmailTemplatesSection";
import PrivacySection      from "./settings/PrivacySection";
import AnonymousOnlySection from "./settings/AnonymousOnlySection";

const ShenmaySettings = () => (
  <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px 72px" }}>
    <div style={{ marginBottom: 4 }}>
      <Kicker>Configuration</Kicker>
      <Display size={38} italic style={{ marginTop: 12 }}>Settings.</Display>
      <Lede>Manage your company, agent, widget, webhooks, and data access.</Lede>
    </div>
    <CompanyProfile />
    <ApiKeySection />
    <AgentSoulSection />
    <WidgetSection />
    <EmailTemplatesSection />
    <WebhooksSection />
    <DataApiSection />
    <ProductsSection />
    <LabelsSection />
    <ConnectorsSection />
    <PrivacySection />
    <AnonymousOnlySection />
  </div>
);

export default ShenmaySettings;
