import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import styles from "@/app/(auth)/login/login-page.module.css";
import { BrandRibbons } from "@/components/layout/brand-ribbons";
import logoImage from "../../../images/logo.png";

export function LoginNavigation() {
  return (
    <header className={styles.siteHeader}>
      <nav className={styles.navbar} aria-label="Login page navigation">
        <Link className={styles.brand} href="/" aria-label="PGSMS home">
          <Image src={logoImage} alt="" width={42} height={42} priority />
          <span>
            <strong>PGSMS</strong>
            <small>Computer Engineering</small>
          </span>
        </Link>

        <div className={styles.navigationActions}>
          <Link className={styles.backLink} href="/">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
          <Link className={styles.applyLink} href="/apply">
            Apply now
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </nav>
      <BrandRibbons placement="header" />
    </header>
  );
}
