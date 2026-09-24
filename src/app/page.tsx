import Image from "next/image";
import Link from "next/link";
import { Montserrat } from "next/font/google";
import {
  ArrowRight,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

import { LandingBackRedirect } from "@/components/layout/landing-back-redirect";
import { HomeNavigation } from "@/components/layout/home-navigation";
import DotField from "@/components/ui/dot-field";
import styles from "./home-page.module.css";
import logoImage from "../../images/logo.png";
import applicationImage from "../../images/screenshots/application.png";
import dashboardImage from "../../images/screenshots/admin_dashboard.png";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const researchAreas = [
  "Machine Learning and Data Mining",
  "Image Processing and Computer Vision",
  "Internet of Things",
  "Cryptography and Network Security",
  "High Performance Computing",
  "Parallel and Distributed Systems",
  "Computer Architecture and Embedded Systems",
  "Wearable Computing and Brain–Computer Interfacing",
] as const;

const lifecycleSteps = [
  ["Apply", "Submit your research interest and supporting documents."],
  ["Review", "Move through supervisor consent and departmental review."],
  ["Research", "Keep proposals, ethics, and progress records together."],
  ["Complete", "Coordinate thesis examination, corrections, and completion."],
] as const;

export default function HomePage() {
  return (
    <div className={`${styles.page} ${montserrat.className}`}>
      <LandingBackRedirect />
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>

      <HomeNavigation />

      <main id="main-content">
        <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-white px-5 py-20 text-black sm:px-6 sm:py-24">
          <div className="absolute inset-0">
            <div className="absolute inset-0 opacity-90">
              <DotField
                dotRadius={3}
                dotSpacing={14}
                bulgeStrength={72}
                glowRadius={180}
                cursorRadius={340}
                sparkle={false}
                waveAmplitude={0}
                gradientFrom="rgba(120, 120, 120, 0.24)"
                gradientTo="rgba(190, 190, 190, 0.14)"
                activeGradientStops={[
                  "rgba(239, 68, 68, 0.96)",
                  "rgba(244, 114, 182, 0.95)",
                  "rgba(96, 165, 250, 0.95)",
                  "rgba(168, 85, 247, 0.94)",
                ]}
                activeDotScale={2.45}
                idleEngagement={0.52}
                glowColor="transparent"
              />
            </div>
          </div>

          <div className="relative z-10 flex h-full w-full max-w-5xl flex-col items-center justify-center space-y-8 pt-12 text-center sm:space-y-10 sm:pt-16 lg:pt-10">
            <div className="flex justify-center">
              <Image
                src={logoImage}
                alt="Logo"
                width={132}
                height={132}
                className="h-24 w-24 object-contain drop-shadow-xl sm:h-32 sm:w-32 lg:h-36 lg:w-36"
                priority
              />
            </div>
            <h1 className={`${montserrat.className} relative -top-4 mx-auto max-w-5xl text-balance text-center text-[2.1rem] font-normal leading-[1.1] tracking-[-0.06em] text-[#111318] sm:-top-5 sm:text-[3.7rem] lg:-top-6 lg:text-[4.8rem]`}>
              Postgraduate Management Platform
            </h1>

            <Link
              href="/apply"
              className={`inline-flex items-center justify-center border-2 border-black rounded-full bg-black px-8 py-3 text-center text-white transition-all duration-200 hover:bg-white hover:text-black ${montserrat.className}`}
            >
              <span className="font-semibold tracking-wide text-lg">Apply Now</span>
            </Link>
          </div>
        </section>

        <section id="programmes" className={styles.programmeSection}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>Postgraduate research</p>
            <h2>Built for the full research journey.</h2>
            <p>
              The Department of Computer Engineering offers research-based
              M.Phil. and Ph.D. programmes centred on original research and a
              dissertation completed with the guidance of one or more supervisors.
            </p>
          </div>

          <div className={styles.programmeGrid}>
            <div className={`${styles.durationPanel} ${styles.slideFromLeft}`}>
              <div className={styles.durationHeading}>
                <span>Degree</span>
                <span>Full-time</span>
                <span>Part-time</span>
              </div>
              <div className={styles.durationRow}>
                <strong>M.Phil.</strong>
                <span>2 years</span>
                <span>3 years</span>
              </div>
              <div className={styles.durationRow}>
                <strong>Ph.D.</strong>
                <span>3 years</span>
                <span>4.5 years</span>
              </div>
              <a
                className={styles.sourceLink}
                href="https://www.ce.pdn.ac.lk/courses/postgraduate/"
                target="_blank"
                rel="noreferrer"
              >
                Programme details <ExternalLink aria-hidden="true" />
              </a>
            </div>

            <figure className={`${styles.productFrame} ${styles.slideFromRight}`}>
              <div className={styles.browserBar} aria-hidden="true">
                <span />
                <span />
                <span />
                <p>pglms / application</p>
              </div>
              <Image
                src={applicationImage}
                alt="The PGLMS research programme application form"
                sizes="(max-width: 900px) 92vw, 54vw"
              />
              <figcaption>
                Begin with one guided application and a recoverable draft.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="research" className={styles.researchSection}>
          <div className={styles.researchCanvas}>
            <div className={`${styles.researchCopy} ${styles.slideFromLeft}`}>
              <p className={styles.sectionKicker}>Fields of inquiry</p>
              <h2>Research that moves computing forward.</h2>
              <p>
                Explore a broad research environment spanning intelligent systems,
                secure infrastructure, connected devices, computing platforms, and
                human–computer interfaces.
              </p>
              <a
                href="https://www.ce.pdn.ac.lk/courses/postgraduate/"
                target="_blank"
                rel="noreferrer"
              >
                View every research area <ArrowRight aria-hidden="true" />
              </a>
            </div>

            <ul className={`${styles.researchList} ${styles.slideFromRight}`}>
              {researchAreas.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="lifecycle" className={styles.lifecycleSection}>
          <div className={styles.lifecycleGrid}>
            <figure className={`${styles.productFrame} ${styles.dashboardFrame} ${styles.slideFromLeft}`}>
              <div className={styles.browserBar} aria-hidden="true">
                <span />
                <span />
                <span />
                <p>pglms / lifecycle</p>
              </div>
              <Image
                src={dashboardImage}
                alt="PGLMS department dashboard showing postgraduate lifecycle work"
                sizes="(max-width: 900px) 92vw, 55vw"
              />
              <figcaption>
                One shared view keeps every role aligned from admission to completion.
              </figcaption>
            </figure>

            <div className={`${styles.lifecycleCopy} ${styles.slideFromRight}`}>
              <p className={styles.sectionKicker}>One connected lifecycle</p>
              <h2>Every milestone has a place.</h2>
              <ol>
                {lifecycleSteps.map(([title, description]) => (
                  <li key={title}>
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className={styles.closingSection} aria-labelledby="closing-heading">
          <div>
            <p className={styles.sectionKicker}>Your research starts here</p>
            <h2 id="closing-heading">Ready to begin?</h2>
          </div>
          <div className={styles.closingActions}>
            <Link href="/apply" className={styles.primaryAction}>
              Start an application <ArrowRight aria-hidden="true" />
            </Link>
            <a
              href="https://cerps.pdn.ac.lk/research-programmes/"
              target="_blank"
              rel="noreferrer"
              className={styles.secondaryAction}
            >
              CERPS programme information
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <div className={styles.footerGrid}>
          <div className={styles.footerIdentity}>
            <Image src={logoImage} alt="University of Peradeniya" width={72} height={72} />
            <div>
              <strong>Postgraduate Lifecycle Management System</strong>
              <p>Department of Computer Engineering</p>
              <p>Faculty of Engineering, University of Peradeniya</p>
            </div>
          </div>

          <div className={styles.footerColumn}>
            <h2>Explore</h2>
            <a href="#programmes">Research programmes</a>
            <a href="#research">Research areas</a>
            <Link href="/apply">Apply online</Link>
            <Link href="/login">Staff and student sign in</Link>
          </div>

          <div className={styles.footerColumn}>
            <h2>University links</h2>
            <a href="https://www.ce.pdn.ac.lk/" target="_blank" rel="noreferrer">
              Department of Computer Engineering
            </a>
            <a href="https://eng.pdn.ac.lk/" target="_blank" rel="noreferrer">
              Faculty of Engineering
            </a>
            <a href="https://cerps.pdn.ac.lk/" target="_blank" rel="noreferrer">
              CERPS
            </a>
          </div>

          <address className={styles.footerContact}>
            <h2>Contact</h2>
            <p>
              <MapPin aria-hidden="true" />
              <span>Peradeniya 20400, Sri Lanka</span>
            </p>
            <a href="mailto:headce@eng.pdn.ac.lk">
              <Mail aria-hidden="true" />
              headce@eng.pdn.ac.lk
            </a>
            <a href="tel:+94812393470">
              <Phone aria-hidden="true" />
              +94 81 239 3470
            </a>
          </address>
        </div>

        <div className={styles.footerBase}>
          <p>© 2026 University of Peradeniya. All rights reserved.</p>
          <a href="#main-content">Back to top</a>
        </div>
      </footer>
    </div>
  );
}
