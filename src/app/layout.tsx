import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Scannerize",
  description: "Offline PDF finishing in your browser.",
  manifest: `${basePath}/manifest.webmanifest`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {children}
          <ServiceWorkerRegistration />
        </TooltipProvider>
      </body>
    </html>
  );
}
