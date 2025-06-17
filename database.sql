CREATE DATABASE IF NOT EXISTS toko;
USE toko;

CREATE TABLE IF NOT EXISTS produk (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produk_id INT NOT NULL,
  jumlah INT NOT NULL,
  FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pembelian (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produk_id INT NOT NULL,
  jumlah INT NOT NULL,
  tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE
);

INSERT INTO produk (nama) VALUES
('Produk A'), ('Produk B'), ('Produk C'), ('Produk D'), ('Produk E'),
('Produk F'), ('Produk G'), ('Produk H'), ('Produk I'), ('Produk J');

INSERT INTO stock (produk_id, jumlah)
SELECT id, 100 FROM produk;
