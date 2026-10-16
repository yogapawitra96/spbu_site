# Network Monitoring — SPBU Bali

Starter project Next.js App Router untuk memonitor KPI site-sector dan menampilkan lokasi BTS + SPBU di Leaflet.

## 1. Prasyarat

- Node.js 20.9+ (disarankan Node 22)
- MySQL pada dua server yang dapat diakses oleh host Next.js
- MySQL 8.0+ pada server KPI karena query memakai `ROW_NUMBER()`
- Hak akses database read-only untuk kedua koneksi

## 2. Instalasi

```bash
npm install
cp .env
```

Isi semua nilai `SPBU_DB_*` dan `KPI_DB_*` di `.env.local`, lalu jalankan:

```bash
npm run dev
```

Buka `http://localhost:3000/network-watch`.

Untuk produksi:

```bash
npm run build
npm start
```

## 3. Aturan status

- RED: PRB DL >= 90 AND User Downlink Average Throughput < 1.5 Mbps
- YELLOW: PRB DL >= 50 AND throughput < 5 Mbps, jika tidak memenuhi RED
- GREEN: kondisi lain
- UNKNOWN: PRB atau throughput kosong/tidak valid; tidak dihitung Healthy

## 4. Cara pencocokan data

API membaca `sitelist_spbu` dari server SPBU dan mengambil KPI terbaru per kombinasi `siteid` + `Sector` dari `4g_kpi_hourly_ftp` di server KPI. Kedua hasil dicocokkan di Node.js dengan key `siteid::sector`, jadi database tidak perlu berada di server yang sama.

Kolom KPI:
- `DL Resource Block Utilizing Rate (%)`
- `User Downlink Average Throughput (Mbps)`
- `Date_Hour`

Kolom koordinat:
- Marker site memakai `Lat` + `Long`
- Marker SPBU memakai `Latitude` + `Longitude`

**Validasi koordinat:** implementasi ini mengikuti pemetaan kolom yang dipilih di brief. Pastikan kolom-kolom tersebut benar-benar mewakili posisi site dan SPBU pada data Anda. Jika tertukar, ubah mapping di `src/app/api/network-watch/route.ts`.

## 5. Endpoint

`GET /api/network-watch`

Contoh struktur respons:

```json
{
  "success": true,
  "generatedAt": "2026-10-15T12:00:00.000Z",
  "counts": { "total": 120, "green": 90, "yellow": 20, "red": 8, "unknown": 2 },
  "sites": [
    {
      "id": "12345-1-1",
      "siteid": "12345",
      "sector": 1,
      "site": { "lat": -8.4, "lng": 115.2 },
      "spbuLocation": { "lat": -8.41, "lng": 115.21 },
      "prb": 93.1,
      "throughput": 1.2,
      "status": "RED"
    }
  ]
}
```

## 6. Catatan produksi dan performa

- Jangan menambahkan prefix `NEXT_PUBLIC_` pada credential.
- Gunakan akun DB read-only dan batasi akses jaringan MySQL hanya dari IP server aplikasi.
- Query latest KPI saat ini memindai tabel KPI untuk menghitung `ROW_NUMBER()`. Untuk tabel besar, tambahkan index yang sesuai:
  ```sql
  CREATE INDEX idx_kpi_site_sector_hour
  ON `4g_kpi_hourly_ftp` (`siteid`, `Sector`, `Date_Hour`);
  ```
  Periksa ukuran tabel dan rencana eksekusi terlebih dahulu sebelum menjalankan DDL di produksi.
- Jika banyak baris pada `sitelist_spbu` untuk site-sector yang sama, API tetap mengembalikan tiap baris karena tiap baris dapat mewakili SPBU berbeda.
- OpenStreetMap tiles memerlukan koneksi internet. Untuk penggunaan trafik tinggi/produksi, tinjau kebijakan tile provider atau gunakan penyedia tile yang sesuai.
- Leaflet menggunakan dua layer marker: lingkaran berwarna untuk site BTS dan marker gelap untuk lokasi SPBU.
- Auto-refresh berjalan setiap 60 detik. Sesuaikan di `src/app/network-watch/page.tsx` bila perlu.
