import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
import CarPicker from "@/components/CarPicker";
import { getCars } from "@/lib/queries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TripTrack",
  description: "Per-ride fuel cost tracking for the Koleos",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The car picker lives in the shared shell. Don't let a cars fetch failure
  // take down every page — degrade to no picker.
  let cars: Awaited<ReturnType<typeof getCars>> = [];
  try {
    cars = await getCars();
  } catch {
    cars = [];
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <CarPicker cars={cars} currentCarId={cars[0]?.id} />
      </body>
    </html>
  );
}
