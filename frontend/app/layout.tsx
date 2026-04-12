export const metadata = { title: 'FinanMap Cripto', description: 'Otimização de portfólios cripto com GA' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
