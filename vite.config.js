import { defineConfig } from 'vite';
import { qrcode } from 'vite-plugin-qrcode';
import { relayPlugin } from './server/relay.mjs';

export default defineConfig({
  base: './',
  plugins: [qrcode(), relayPlugin()],   // QR: ağ adresini terminalde basar; relay: çok oyunculu sunucu /mp yolunda
  server: { host: true, port: 5173 },   // aynı Wi-Fi'deki telefondan erişim için LAN'a aç
  preview: { host: true, port: 4173 },
});
