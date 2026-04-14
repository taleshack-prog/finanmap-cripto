'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

const API = 'http://localhost:3020'

interface User {
  id:    string
  email: string
  nome:  string
}

interface AuthContextType {
  user:        User | null
  token:       string | null
  isLoading:   boolean
  isLoggedIn:  boolean
  login:       (email: string, senha: string) => Promise<void>
  register:    (email: string, nome: string, senha: string) => Promise<void>
  logout:      () => void
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router              = useRouter()
  const [user, setUser]     = useState<User | null>(null)
  const [token, setToken]   = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Carrega token do localStorage ao iniciar
  useEffect(() => {
    const savedToken = localStorage.getItem('finanmap_token')
    const savedUser  = localStorage.getItem('finanmap_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, senha: string) => {
    const r = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, senha }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro ao fazer login')
    localStorage.setItem('finanmap_token', data.token)
    localStorage.setItem('finanmap_user',  JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
    router.push('/dashboard')
  }

  const register = async (email: string, nome: string, senha: string) => {
    const r = await fetch(`${API}/api/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, nome, senha }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro ao criar conta')
    localStorage.setItem('finanmap_token', data.token)
    localStorage.setItem('finanmap_user',  JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
    router.push('/dashboard')
  }

  const logout = () => {
    localStorage.removeItem('finanmap_token')
    localStorage.removeItem('finanmap_user')
    setToken(null)
    setUser(null)
    router.push('/login')
  }

  // Fetch autenticado — adiciona Bearer token automaticamente
  const fetchWithAuth = (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  }

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      isLoggedIn: !!token && !!user,
      login, register, logout, fetchWithAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
