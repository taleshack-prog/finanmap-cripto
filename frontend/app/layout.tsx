import type { Metadata } from 'next'
import { AuthProvider } from '../context/AuthContext'

export const metadata: Metadata = {
  title:       'FinanMap Cripto',
  description: 'Otimização de portfólios cripto com Algoritmo Genético',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, background: '#020010' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
