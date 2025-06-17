-- Buat database (jika belum dibuat)
CREATE DATABASE IF NOT EXISTS toko;
USE toko;

-- Tabel produk
CREATE TABLE IF NOT EXISTS produk (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL
);

-- Tabel stok
CREATE TABLE IF NOT EXISTS stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produk_id INT NOT NULL,
  jumlah INT NOT NULL,
  FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
);

-- Tabel pembelian
CREATE TABLE IF NOT EXISTS pembelian (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produk_id INT NOT NULL,
  jumlah INT NOT NULL,
  tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
);

-- Isi data produk
INSERT INTO produk (nama) VALUES
('Produk A'), ('Produk B'), ('Produk C'), ('Produk D'), ('Produk E'),
('Produk F'), ('Produk G'), ('Produk H'), ('Produk I'), ('Produk J');

-- Isi stok awal untuk setiap produk
INSERT INTO stock (produk_id, jumlah)
SELECT id, 100 FROM produk;
