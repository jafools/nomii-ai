import { Link } from "react-router-dom";
import shenmayLogo from "@/assets/shenmay-full-dark.svg";
import { ArrowLeft } from "lucide-react";

const Section = ({ number, title, children }) => (
  <div className="mb-10">
    <h2 className="text-lg font-bold mb-3" style={{ color: "#1E3A5F" }}>
      {number}. {title}
    </h2>
    <div className="text-sm text-gray-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

const ShenmayTerms = () => (
  <div className="min-h-screen bg-[#FAFAFA]">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-10">
        <Link to="/nomii/signup" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} style={{ color: "#1E3A5F" }} />
        </Link>
        <img src={shenmayLogo} alt="Shenmay AI" className="h-7" />
      </div>

      <h1 className="text-3xl font-extrabold mb-2" style={{ color: "#1E3A5F" }}>
        Terms of Service
      </h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: March 11, 2026</p>

      <Section number={1} title="Service Description">
        <p>
          Shenmay AI ("the Service") is an AI-powered customer engagement platform provided by Pontén Solutions LLC. The Service enables businesses ("Tenants") to deploy conversational AI agents on their websites and digital properties to interact with their end customers.
        </p>
        <p>
          The Service includes, but is not limited to: AI agent configuration and deployment, customer conversation management, analytics and reporting dashboards, and integration tools. Pontén Solutions reserves the right to modify, update, or discontinue features of the Service at any time.
        </p>
      </Section>

      <Section number={2} title="Tenant Responsibilities">
        <p>
          As a Tenant, you are responsible for:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Ensuring that all information provided to configure your AI agent is accurate and not misleading to your end customers.</li>
          <li>Obtaining all necessary rights, licenses, and consents before uploading customer data, product catalogs, or any other content to the Service.</li>
          <li>Complying with all applicable laws and regulations in the jurisdictions where your AI agent operates, including consumer protection and advertising standards.</li>
          <li>Monitoring your AI agent's interactions and promptly correcting any inaccurate or inappropriate responses.</li>
          <li>Maintaining the confidentiality of your account credentials and promptly notifying us of any unauthorized access.</li>
        </ul>
      </Section>

      <Section number={3} title="Data Processing">
        <p>
          Pontén Solutions processes data on behalf of Tenants in the capacity of a data processor. Tenants remain the data controllers for all personal data uploaded to or collected through the Service.
        </p>
        <p>
          We process the following categories of data: Tenant account information (name, email, company details), end-customer conversation data (messages, metadata, interaction history), product and service catalogs uploaded by Tenants, and usage analytics.
        </p>
        <p>
          All data is encrypted in transit (TLS 1.2+) and at rest. Conversation data is stored in secure, SOC 2-compliant infrastructure. We do not sell, share, or use Tenant or end-customer data for any purpose other than providing and improving the Service.
        </p>
      </Section>

      <Section number={4} title="Data Deletion & Right to Erasure">
        <p>
          Tenants may request deletion of their account and all associated data at any time by contacting <a href="mailto:support@pontensolutions.com" className="font-semibold underline" style={{ color: "#1E3A5F" }}>support@pontensolutions.com</a>.
        </p>
        <p>
          Upon receiving a verified deletion request, we will:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Delete all Tenant account data, AI agent configurations, and uploaded content within 30 days.</li>
          <li>Permanently remove all end-customer conversation data and personal information within 30 days.</li>
          <li>Provide written confirmation once the deletion process is complete.</li>
        </ul>
        <p>
          Tenants are responsible for fulfilling erasure requests from their own end customers by using the data management tools in the dashboard or by contacting our support team.
        </p>
      </Section>

      <Section number={5} title="Limitation of Liability">
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." PONTÉN SOLUTIONS MAKES NO WARRANTIES, EXPRESS OR IMPLIED, REGARDING THE ACCURACY, RELIABILITY, OR SUITABILITY OF AI-GENERATED RESPONSES.
        </p>
        <p>
          To the maximum extent permitted by applicable law, Pontén Solutions shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising out of or related to the use of the Service.
        </p>
        <p>
          Our total aggregate liability for any claims arising from or related to the Service shall not exceed the amount paid by the Tenant in the twelve (12) months preceding the claim.
        </p>
      </Section>

      <Section number={6} title="Changes to These Terms">
        <p>
          We may update these Terms of Service from time to time. When we make material changes, we will:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Notify all active Tenants via the email address associated with their account at least 14 days before the changes take effect.</li>
          <li>Display a prominent notice in the Shenmay AI dashboard.</li>
          <li>Update the "Last updated" date at the top of this page.</li>
        </ul>
        <p>
          Continued use of the Service after changes take effect constitutes acceptance of the revised terms. If you do not agree to the updated terms, you may terminate your account by contacting support.
        </p>
      </Section>

      <div className="border-t border-gray-200 pt-8 mt-12 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Pontén Solutions LLC. All rights reserved. Questions? Contact{" "}
          <a href="mailto:support@pontensolutions.com" className="underline" style={{ color: "#1E3A5F" }}>support@pontensolutions.com</a>
        </p>
      </div>
    </div>
  </div>
);

export default ShenmayTerms;
