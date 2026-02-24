import type { MetaFunction } from "react-router";
# 1. Create the privacy route file
cat > app/routes/privacy.tsx << 'EOF'
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
      <p><strong>Last updated: February 23, 2026</strong></p>

      <p>CartBoost ("we", "us", or "our") operates the CartBoost Free Shipping Bar app. This Privacy Policy explains how we collect, use, and protect information when merchants install and use our App.</p>

      <h2>Information We Collect</h2>
      <p>We collect minimal data:</p>
      <ul>
        <li><strong>Store Information</strong>: Your Shopify store domain and basic settings (required for the App to function).</li>
        <li><strong>A/B Testing Data</strong> (optional): Anonymous events such as which variant was shown and add-to-cart actions.</li>
      </ul>
      <p>We do <strong>not</strong> collect personal customer data from your store visitors.</p>

      <h2>How We Use the Information</h2>
      <p>We use the information to provide the App, enable A/B testing, show performance metrics, and improve the product.</p>

      <h2>Data Security</h2>
      <p>We use reasonable security measures to protect your data.</p>

      <h2>Your Rights</h2>
      <p>You can request access, correction, or deletion of your data by contacting us at support@getcartboost.com.</p>

      <h2>Contact Us</h2>
      <p>Email: support@getcartboost.com</p>
    </div>
  );
}
