import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { preload } from "react-dom";
import { Plus_Jakarta_Sans, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import SmoothScroll from "../components/SmoothScroll";
import CursorReticle from "../components/CursorReticle";
import MemProbe from "../components/MemProbe";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./evolution.css";

// Absolute-URL base for canonical links, OG/Twitter images, and the sitemap.
// Env var wins on Vercel previews; falls back to the production domain.
const RAW_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://abdussami.dev";
// Ensure an absolute URL: prepend https:// if the env var omits the protocol.
const SITE_URL = /^https?:\/\//i.test(RAW_SITE_URL) ? RAW_SITE_URL : `https://${RAW_SITE_URL}`;

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  // 300 was loaded but never referenced anywhere in globals.css or TSX
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Abdus Sami: Cloud Native Backend Engineer",
  description:
    "Abdus Sami's portfolio: secure, scalable backend systems with Django, DRF, PostgreSQL, Docker, and AWS.",
  keywords: [
    "Abdus Sami",
    "backend engineer",
    "Django developer",
    "Django REST Framework",
    "PostgreSQL",
    "REST API developer",
    "Docker",
    "AWS EC2",
    "cloud native backend",
    "Python developer",
  ],
  openGraph: {
    title: "Abdus Sami: Cloud Native Backend Engineer",
    description:
      "Abdus Sami's portfolio: secure, scalable backend systems with Django, DRF, PostgreSQL, Docker, and AWS.",
    type: "website",
    url: "/",
    siteName: "Abdus Sami",
    // og:image is injected automatically by app/opengraph-image.jpeg
  },
  twitter: {
    card: "summary_large_image",
    title: "Abdus Sami: Cloud Native Backend Engineer",
    description:
      "Secure, scalable backend systems with Django, DRF, PostgreSQL, Docker, and AWS by Abdus Sami.",
    // twitter:image is injected automatically by app/twitter-image.jpeg
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0B09",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Kick off hero-critical asset fetches from the initial HTML instead of
  // waiting for client JS to evaluate useGLTF.preload — parallel with the
  // JS download, shortens the preloader's wall time on cold loads.
  preload("/assets/hardware_laptop.glb", { as: "fetch", crossOrigin: "anonymous" });
  // crossOrigin must match THREE's loaders (anonymous) or the preloaded
  // response has a different credentials mode and both textures download twice.
  preload("/assets/textures/bg.jpg", { as: "image", crossOrigin: "anonymous" });
  preload("/assets/textures/Mac Keyboard.jpg", {
    as: "image",
    crossOrigin: "anonymous",
  });

  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        <Script id="scroll-restoration" strategy="beforeInteractive">
          {`history.scrollRestoration = "manual";
if (!location.hash) window.scrollTo(0, 0);`}
        </Script>
        {/* Server-rendered preloader mask — present in the raw HTML from the
            first byte so it covers the hero BEFORE any JS runs (PreLoader is
            dynamic/ssr:false and mounts only after hydration). PreLoader removes
            it once its own overlay has painted, so there's never a hero flash. */}
        <div
          id="preloader-mask"
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0D0B09" }}
        />
        {/* Film-grain noise overlay — fixed, pointer-events-none, adds physical texture */}
        <div className="grain-overlay" aria-hidden="true" />
        {/* Person structured data for name-search rich results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "Abdus Sami",
              url: SITE_URL,
              jobTitle: "Cloud Native Backend Engineer",
              alumniOf: {
                "@type": "CollegeOrUniversity",
                name: "Daffodil International University",
              },
              email: "mailto:hsami3508@gmail.com",
              telephone: "+8801315186694",
            }),
          }}
        />
        <SmoothScroll>{children}</SmoothScroll>
        {/* Detection-reticle cursor — body-level sibling so position:fixed is
            never trapped inside a transformed ancestor. Renders null on
            touch / reduced-motion. */}
        <CursorReticle />
        {/* Temporary OOM-investigation HUD — renders nothing without ?memprobe */}
        <MemProbe />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
