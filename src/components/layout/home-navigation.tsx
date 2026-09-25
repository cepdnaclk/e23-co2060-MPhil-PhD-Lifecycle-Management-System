"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import styles from "@/app/home-page.module.css";
import { BrandRibbons } from "@/components/layout/brand-ribbons";
import { ScrollAwareHeader } from "@/components/layout/scroll-aware-header";
import logoImage from "../../../images/logo.png";

export function HomeNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);
  const navigateToSection = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const sectionId = event.currentTarget.hash.slice(1);
    closeMenu();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    window.history.replaceState(null, "", `#${sectionId}`);
  };

  return (
    <ScrollAwareHeader className={styles.siteHeader} pinned={isMenuOpen}>
      <nav className={styles.navbar} aria-label="Primary navigation">
        <Link className={styles.brand} href="/" aria-label="PGSMS home">
          <Image src={logoImage} alt="" width={42} height={42} priority />
          <span>
            <strong>PGSMS</strong>
            <small>Computer Engineering</small>
          </span>
        </Link>

        <div className={styles.desktopNavigation}>
          <a href="#programmes" onClick={navigateToSection}>Programmes</a>
          <a href="#research" onClick={navigateToSection}>Research</a>
          <a href="#student-journey" onClick={navigateToSection}>Student Journey</a>
          <Link href="/apply">Apply</Link>
        </div>

        <Link href="/login" className={styles.signInButton}>
          <span className={styles.signInButtonLabel}>Sign In</span>
        </Link>

        <div className={styles.mobileNavigation}>
          <button
            className={styles.mobileNavigationButton}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="home-mobile-navigation"
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span>{isMenuOpen ? "Close" : "Menu"}</span>
          </button>
          {isMenuOpen ? (
            <div id="home-mobile-navigation" className={styles.mobileNavigationPanel}>
              <a href="#programmes" onClick={navigateToSection}>Programmes</a>
              <a href="#research" onClick={navigateToSection}>Research</a>
              <a href="#student-journey" onClick={navigateToSection}>Student journey</a>
              <Link href="/apply">Apply now</Link>
              <Link href="/login">Sign in</Link>
            </div>
          ) : null}
        </div>
      </nav>
      <BrandRibbons placement="header" />
    </ScrollAwareHeader>
  );
}
