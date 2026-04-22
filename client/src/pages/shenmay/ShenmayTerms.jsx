import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import {
  TOKENS as T,
  Kicker,
  Display,
  PageShell,
} from "@/components/shenmay/ui/ShenmayUI";

const Section = ({ number, title, children }) => (
  <section style={{ marginBottom: 48 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 16 }}>
      <span style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: "0.16em", color: T.teal, textTransform: "uppercase" }}>
        {String(number).padStart(2, "0")}
      </span>
      <h2 style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 22, letterSpacing: "-0.02em", color: T.ink, margin: 0 }}>
        {title}
      </h2>
    </div>
    <div style={{ fontSize: 15, color: T.inkSoft, lineHeight: 1.7, letterSpacing: "-0.005em", display: "flex", flexDirection: "column", gap: 14 }}>
      {children}
    </div>
  </section>
);

const ShenmayTerms = () => (
  <PageShell>
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 44 }}>
        <Link to="/shenmay/signup" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 6, border: `1px solid ${T.paperEdge}`, color: T.ink, textDecoration: "none" }}>
          <ArrowLeft size={16} />
        </Link>
        <ShenmayWordmark size={22} />
      </div>

      <Kicker>Legal · Terms of Service</Kicker>
      <Display size={48} italic style={{ marginTop: 14 }}>The contract between us.</Display>
      <div style={{ marginTop: 16, fontSize: 13, color: T.mute, fontFamily: T.mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Last updated &nbsp;·&nbsp; March 11, 2026
      </div>

      <div style={{ height: 1, background: T.paperEdge, margin: "48px 0" }} />

      <Section number={1} title="Service description">
        <p style={{ margin: 0 }}>
          Shenmay AI ("the Service") is an AI-powered customer engagement platform provided by Pontén Solutions LLC. The Service enables businesses ("Tenants") to deploy conversational AI agents on their websites and digital properties to interact with their end customers.
        </p>
        <p style={{ margin: 0 }}>
          The Service includes, but is not limited to: AI agent configuration and deployment, customer conversation management, analytics and reporting dashboards, and integration tools. Pontén Solutions reserves the right to modify, update, or discontinue features of the Service at any time.
        </p>
      </Section>

      <Section number={2} title="Tenant responsibilities">
        <p style={{ margin: 0 }}>As a Tenant, you are responsible for:</p>
        <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Ensuring that all information provided to configure your AI agent is accurate and not misleading to your end customers.</li>
          <li>Obtaining all necessary rights, licenses, and consents before uploading customer data, product catalogs, or any other content to the Service.</li>
          <li>Complying with all applicable laws and regulations in the jurisdictions where your AI agent operates, including consumer protection and advertising standards.</li>
          <li>Monitoring your AI agent's interactions and promptly correcting any inaccurate or inappropriate responses.</li>
          <li>Maintaining the confidentiality of your account credentials and promptly notifying us of any unauthorized access.</li>
        </ul>
      </Section>

      <Section number={3} title="Data processing">
        <p style={{ margin: 0 }}>
          Pontén Solutions processes data on behalf of Tenants in the capacity of a data processor. Tenants remain the data controllers for all personal data uploaded to or collected through the Service.
        </p>
        <p style={{ margin: 0 }}>
          We process the following categories of data: Tenant account information (name, email, company details), end-customer conversation data (messages, metadata, interaction history), product and service catalogs uploaded by Tenants, and usage analytics.
        </p>
        <p style={{ margin: 0 }}>
          All data is encrypted in transit (TLS 1.2+) and at rest. Conversation data is stored in secure, SOC 2-compliant infrastructure. We do not sell, share, or use Tenant or end-customer data for any purpose other than providing and improving the Service.
        </p>
      </Section>

      <Section number={4} title="Data deletion & right to erasure">
        <p style={{ margin: 0 }}>
          Tenants may request deletion of their account and all associated data at any time by contacting&nbsp;{" "}
          <a href="mailto:support@pontensolutions.com" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40`, fontWeight: 500 }}>
            support@pontensolutions.com
          </a>.
        </p>
        <p style={{ margin: 0 }}>Upon receiving a verified deletion request, we will:</p>
        <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Delete all Tenant account data, AI agent configurations, and uploaded content within 30 days.</li>
          <li>Permanently remove all end-customer conversation data and personal information within 30 days.</li>
          <li>Provide written confirmation once the deletion process is complete.</li>
        </ul>
        <p style={{ margin: 0 }}>
          Tenants are responsible for fulfilling erasure requests from their own end customers by using the data management tools in the dashboard or by contacting our support team.
        </p>
      </Section>

      <Section number={5} title="Limitation of liability">
        <p style={{ margin: 0, fontStyle: "italic", color: T.ink, paddingLeft: 18, borderLeft: `2px solid ${T.teal}` }}>
          The Service is provided "as is" and "as available." Pontén Solutions makes no warranties, express or implied, regarding the accuracy, reliability, or suitability of AI-generated responses.
        </p>
        <p style={{ margin: 0 }}>
          To the maximum extent permitted by applicable law, Pontén Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising out of or related to the use of the Service.
        </p>
        <p style={{ margin: 0 }}>
          Our total aggregate liability for any claims arising from or related to the Service shall not exceed the amount paid by the Tenant in the twelve (12) months preceding the claim.
        </p>
      </Section>

      <Section number={6} title="Changes to these terms">
        <p style={{ margin: 0 }}>We may update these Terms of Service from time to time. When we make material changes, we will:</p>
        <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Notify all active Tenants via the email address associated with their account at least 14 days before the changes take effect.</li>
          <li>Display a prominent notice in the Shenmay AI dashboard.</li>
          <li>Update the "Last updated" date at the top of this page.</li>
        </ul>
        <p style={{ margin: 0 }}>
          Continued use of the Service after changes take effect constitutes acceptance of the revised terms. If you do not agree to the updated terms, you may terminate your account by contacting support.
        </p>
      </Section>

      <div style={{ height: 1, background: T.paperEdge, margin: "48px 0 28px" }} />
      <div style={{ textAlign: "center", fontSize: 12, color: T.mute, fontFamily: T.mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        © {new Date().getFullYear()} Pontén Solutions LLC ·&nbsp;{" "}
        <a href="mailto:support@pontensolutions.com" style={{ color: T.teal, textDecoration: "none" }}>support@pontensolutions.com</a>
      </div>
    </div>
  </PageShell>
);

export default ShenmayTerms;
