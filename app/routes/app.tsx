import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { authenticate } from '../shopify.server';
import { useEffect } from 'react';

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Stubbed metrics - replace with real data later
  const metrics = {
    installs: 1,
    aovLift: 15,
    proSubscribers: 0,
    premiumSubscribers: 0
  };
  return json({ shop: session.shop, metrics });
};

export default function App() {
  const { shop, metrics } = useLoaderData();

  return (
    <div style={{ padding: '20px' }}>
      <h1>Welcome to CartBoost Free Shipping Bar for {shop}</h1>
      <p>Boost your AOV with urgency tools.</p>

      <h2>Overview</h2>
      <p>Your bar is installed on 1 store. Customize in the Theme Editor.</p>
      <a href={`https://${shop}/admin/themes/current/editor`} target="_blank" style={{ color: '#007bff', textDecoration: 'none' }}>Open Theme Editor</a>

      <h2>Metrics</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tr>
          <th style={tableStyle}>Installs</th>
          <th style={tableStyle}>AOV Lift</th>
          <th style={tableStyle}>Pro Subscribers</th>
          <th style={tableStyle}>Premium Subscribers</th>
        </tr>
        <tr>
          <td style={tableStyle}>{metrics.installs}</td>
          <td style={tableStyle}>{metrics.aovLift}%</td>
          <td style={tableStyle}>{metrics.proSubscribers}</td>
          <td style={tableStyle}>{metrics.premiumSubscribers}</td>
        </tr>
      </table>

      <h2>Global Settings</h2>
      <p>Coming soon: Default threshold, API keys, etc.</p>

      <h2>Billing & Upgrade</h2>
      <p>Upgrade to unlock Pro ($7.99/mo) or Premium ($10.99/mo) features.</p>
      <button style={buttonStyle} onClick={() => window.open('https://admin.shopify.com/store/' + shop + '/apps/324811030529/billing', '_blank')}>Upgrade to Pro ($7.99/mo)</button>
      <button style={buttonStyle} onClick={() => window.open('https://admin.shopify.com/store/' + shop + '/apps/324811030529/billing', '_blank')}>Upgrade to Premium ($10.99/mo)</button>
    </div>
  );
}

const tableStyle = {
  border: '1px solid #ddd',
  padding: '8px',
  textAlign: 'left'
};

const buttonStyle = {
  background: '#007bff',
  color: 'white',
  padding: '10px 20px',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  marginRight: '10px'
};