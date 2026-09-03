import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Scannerize",
  description: "Offline PDF finishing in your browser.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: {
      url: `${basePath}/favicon.png`,
      type: "image/png",
      sizes: "512x512",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
