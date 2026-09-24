import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { BrandRibbons } from "@/components/layout/brand-ribbons";
import logoImage from "../../../images/logo.png";

import styles from "./public-page-navigation.module.css";

type PublicPageNavigationProps = {
  ariaLabel?: string;
  backHref?: string;
  backLabel?: string;
  primaryHref: string;
  primaryLabel: string;
};

export function PublicPageNavigation({
  ariaLabel = "Public page navigation",
  backHref = "/",
  backLabel = "Back",
  primaryHref,
  primaryLabel,
}: PublicPageNavigationProps) {
  return (
    <header className={styles.siteHeader}>
      <nav className={styles.navbar} aria-label={ariaLabel}>
        <Link className={styles.brand} href="/" aria-label="PGSMS home">
          <Image src={logoImage} alt="" width={42} height={42} priority />
          <span>
            <strong>PGSMS</strong>
            <small>Computer Engineering</small>
          </span>
        </Link>

        <div className={styles.navigationActions}>
          <Link className={styles.backLink} href={backHref}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Link>
          <Link className={styles.primaryLink} href={primaryHref}>
            {primaryLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </nav>
      <BrandRibbons placement="header" />
    </header>
  );
}
