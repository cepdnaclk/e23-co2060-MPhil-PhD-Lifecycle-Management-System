import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { LoginNavigation } from "@/components/layout/login-navigation";
import { SimpleSiteFooter } from "@/components/layout/simple-site-footer";

import styles from "./login-page.module.css";

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <LoginNavigation />

      <main className={styles.main}>
        <section className={styles.formSection} aria-label="Sign in">
          <div className={styles.formWrap}>
            <Suspense fallback={<div className={styles.formFallback}>Loading sign-in form...</div>}>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </main>

      <SimpleSiteFooter />
    </div>
  );
}
