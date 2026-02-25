/* eslint-disable react/no-unescaped-entities */
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "Privacy Policy - CartBoost" }];
};

export default function Privacy() {
  return (
    <div style={{
      maxWidth: "800px",
      margin: "40px auto",
      padding: "40px 20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: "1.6",
      color: "#333"
    }}>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated: February 25, 2026</strong></p>

      <p>CartBoost (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the CartBoost Free Shipping Bar app (the &quot;App&quot;) for the Shopify platform. This Privacy Policy explains how we collect, use, store, and protect information when merchants install and use our App.</p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Store Information</h3>
      <p>When you install CartBoost, we collect your Shopify store domain and authentication credentials (OAuth access token) necessary for the App to function. This information is provided by Shopify during the installation process.</p>

      <h3>1.2 A/B Testing Analytics Data</h3>
      <p>We collect anonymous analytics events from your storefront, including:</p>
      <ul>
        <li>Bar impressions (which variant was displayed)</li>
        <li>Add-to-cart actions detected while the bar is active</li>
      </ul>
      <p>These events are fully anonymous. We do <strong>not</strong> collect or store any personal information about your store's customers, including names, email addresses, IP addresses, or browsing history.</p>

      <h3>1.3 Billing Information</h3>
      <p>Subscription billing is handled entirely by Shopify. We store only your current plan tier (free, pro, or premium) for feature gating purposes. We do not collect or store payment card details.</p>

      <h2>2. How We Use the Information</h2>
      <ul>
        <li>To provide and operate the App's core functionality (displaying free shipping bars and running A/B tests)</li>
        <li>To display performance analytics in your CartBoost dashboard</li>
        <li>To manage your subscription plan</li>
        <li>To improve the App based on aggregate, anonymized usage patterns</li>
      </ul>

      <h2>3. Data Sharing</h2>
      <p>We do <strong>not</strong> sell, rent, or share your data with third parties for marketing purposes. Your data may be processed by the following service providers solely to operate the App:</p>
      <ul>
        <li><strong>Vercel</strong> - Application hosting (servers located in the United States)</li>
        <li><strong>PostgreSQL database provider</strong> - Database hosting (servers located in the United States)</li>
        <li><strong>Shopify</strong> - Platform provider (as required by the Shopify API)</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>We retain your data for as long as the App is installed on your store. When you uninstall CartBoost:</p>
      <ul>
        <li>All A/B test data, analytics events, and plan information are deleted immediately upon uninstall.</li>
        <li>Any remaining session data is purged within 48 hours as part of Shopify's mandatory shop redaction process.</li>
      </ul>

      <h2>5. Data Security</h2>
      <p>We implement industry-standard security measures to protect your data, including:</p>
      <ul>
        <li>HTTPS encryption for all data in transit</li>
        <li>Encrypted database connections</li>
        <li>OAuth 2.0 authentication for all Shopify API interactions</li>
        <li>App Proxy signature verification for storefront API endpoints</li>
      </ul>

      <h2>6. Cookies and Tracking</h2>
      <p>The CartBoost storefront widget does not set cookies or use browser storage (localStorage, sessionStorage) on your customers' devices. Variant assignment is randomized on each page load and is not persisted.</p>

      <h2>7. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the following rights regarding your data:</p>
      <ul>
        <li><strong>Access</strong> - Request a copy of the data we store about your shop</li>
        <li><strong>Correction</strong> - Request correction of inaccurate data</li>
        <li><strong>Deletion</strong> - Request deletion of your data (or uninstall the App)</li>
        <li><strong>Portability</strong> - Request an export of your data in a standard format</li>
        <li><strong>Objection</strong> - Object to specific processing of your data</li>
      </ul>
      <p>These rights apply under GDPR (EU/EEA), UK GDPR, CCPA (California), PIPEDA (Canada), and similar data protection regulations.</p>

      <h2>8. Children's Privacy</h2>
      <p>CartBoost is a business tool for Shopify merchants and is not directed at children under 13. We do not knowingly collect data from children.</p>

      <h2>9. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify installed merchants of material changes via the App dashboard or email.</p>

      <h2>10. Contact Us</h2>
      <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:</p>
      <p>Email: support@getcartboost.com</p>
    </div>
  );
}
