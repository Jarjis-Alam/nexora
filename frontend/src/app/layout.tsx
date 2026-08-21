import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/auth-provider";
import GradientWaves from "@/components/ui/gradient-waves";
import { DevButton } from "@/components/layout/dev-modal";

export const metadata: Metadata = {
  title: "Placement OS — Your Operating System for Placements",
  description:
    "Assess your skills, identify your weaknesses, practice smarter, and measure your placement readiness with high-precision metrics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-base text-text-primary antialiased selection:bg-primary/30 selection:text-text-primary min-h-screen relative overflow-x-hidden">
        {/* Background Gradient Waves from React Bits (https://reactbits.dev/backgrounds/gradient-waves) */}
        <div className="fixed inset-0 pointer-events-none -z-10 w-full h-full min-h-screen overflow-hidden">
          <GradientWaves
            horizonColor="#5227FF"
            waveColor="#FF9FFC"
            crestColor="#FFFFFF"
            speed={0.4}
            amplitude={2.5}
            waveScale={0.6}
            waveRatio={0.9}
            swell={35}
            turbulence={20}
            tilt={1.11}
            zoom={1.0}
            height={5.5}
            fogDepth={15}
            detail="medium"
            brightness={1.0}
            opacity={0.85}
            mouseInteraction={true}
            parallaxStrength={0.5}
          />
          {/* Subtle dark gradient overlay to ensure perfect contrast and text readability */}
          <div className="absolute inset-0 bg-base/50 pointer-events-none" />
        </div>
        <div className="relative z-10 min-h-screen">
          <AuthProvider>
            {children}
            {/* Quick Access Floating DEV Profile Trigger */}
            <DevButton variant="floating" />
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
