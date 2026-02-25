import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  if (shop) {
    // Only forward Shopify-standard params to prevent open redirect abuse
    const safe = new URLSearchParams();
    for (const key of ["shop", "host", "hmac", "timestamp", "embedded"]) {
      const val = url.searchParams.get(key);
      if (val) safe.set(key, val);
    }
    throw redirect(`/app?${safe.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>CartBoost — Smarter Free Shipping Bars</h1>
        <p className={styles.text}>
          Boost conversions with A/B-tested free shipping bars that adapt to your customers.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>A/B Testing</strong>. Automatically test bar variants and
            find what converts best.
          </li>
          <li>
            <strong>Real-Time Analytics</strong>. Track impressions and
            conversions with a live dashboard.
          </li>
          <li>
            <strong>One-Click Setup</strong>. Install, customize your bar, and
            go live in minutes.
          </li>
        </ul>
      </div>
    </div>
  );
}
