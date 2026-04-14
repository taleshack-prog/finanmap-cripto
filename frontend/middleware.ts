import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rotas públicas — acessíveis sem login
const PUBLIC_ROUTES = ['/', '/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('finanmap_token')?.value

  // Rota pública → deixa passar
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next()

  // Rota de dashboard sem token → redireciona para login
  if (pathname.startsWith('/dashboard') && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
