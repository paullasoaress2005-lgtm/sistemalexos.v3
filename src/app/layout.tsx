import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEX.OS Control",
  description: "Plataforma premium de controle jurídico-operacional LEX.OS Control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
