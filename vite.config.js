import { defineConfig } from 'vite';
import { qrcode } from 'vite-plugin-qrcode';

export default defineConfig({
  base: './',
  plugins: [qrcode()],                  // QR: ağ adresini terminalde basar
  server: { host: true, port: 5173 },   // aynı Wi-Fi'deki telefondan erişim için LAN'a aç
  preview: { host: true, port: 4173 },
});
