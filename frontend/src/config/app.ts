export const DISCLAIMER =
  'MediGuard AI provides AI-assisted equipment maintenance intelligence and predictive risk estimates. Results are intended to support qualified biomedical and maintenance personnel and should not replace professional judgment, manufacturer guidance, or required safety procedures.'

export const HOSPITAL_NAME = 'Riverside General Hospital'
export const PRODUCT_NAME = 'MediGuard AI'
export const PRODUCT_TAGLINE = 'Predict. Prevent. Protect.'

export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000'
export const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
