// In production this points to your Render backend URL
// In development, Vite proxies /api → localhost:3001
export const API_BASE = import.meta.env.VITE_API_URL || "";
