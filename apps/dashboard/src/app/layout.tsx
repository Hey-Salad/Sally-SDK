import "./globals.css";
import type { ReactNode } from "react";

const logoUrl =
  "https://raw.githubusercontent.com/Hey-Salad/.github/main/HeySalad%20Logo%20Black.svg";

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <header className="site-header">
            <a className="brand-lockup" href="/">
              <img alt="HeySalad" className="brand-mark" src={logoUrl} />
            </a>
            <nav className="site-nav">
              <a href="/">Devices</a>
              <a href="/team">Team</a>
              <a href="/logs">Audit</a>
            </nav>
          </header>
          <div className="page-backdrop">
            <div className="orb orb--one" />
            <div className="orb orb--two" />
          </div>
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
