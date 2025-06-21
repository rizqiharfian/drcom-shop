const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'toko'
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL');
});

app.get('/', (req, res) => {
  const sqlProduk = `
    SELECT 
      produk.id, 
      produk.nama, 
      produk.keterangan,
      produk.gambar,
      IFNULL(stock.jumlah, 0) AS jumlah_stok
    FROM produk
    LEFT JOIN stock ON produk.id = stock.produk_id
    ORDER BY produk.nama ASC
  `;
  const sqlPembelian = 'SELECT * FROM pembelian ORDER BY tanggal DESC';

  db.query(sqlProduk, (err1, produkRaw) => {
    if (err1) return res.send('Gagal mengambil data produk');

    const produk = produkRaw.map(p => ({
      ...p,
      gambar_list: p.gambar ? p.gambar.split(',') : []
    }));

    db.query(sqlPembelian, (err2, pembelian) => {
      if (err2) return res.send('Gagal mengambil data pembelian');

      res.render('index', { produk, pembelian });
    });
  });
});


app.post('/beli', (req, res) => {
  const { customer, produk_id, jumlah } = req.body;
  db.query('INSERT INTO pembelian (customer, produk_id, jumlah) VALUES (?, ?, ?)', [customer, produk_id, jumlah], () => {
    db.query('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [jumlah, produk_id], () => {
      res.redirect('/');
    });
  });
});

app.post('/cancel/:id', (req, res) => {
  const id = req.params.id;
  db.query('SELECT * FROM pembelian WHERE id = ?', [id], (err, result) => {
    const pembelian = result[0];
    db.query('UPDATE stock SET jumlah = jumlah + ? WHERE produk_id = ?', [pembelian.jumlah, pembelian.produk_id], () => {
      db.query('DELETE FROM pembelian WHERE id = ?', [id], () => {
        res.redirect('/');
      });
    });
  });
});

app.get('/produk', (req, res) => {
  const sql = `
    SELECT produk.*, IFNULL(stock.jumlah, 0) AS jumlah_stok
    FROM produk
    LEFT JOIN stock ON produk.id = stock.produk_id
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Gagal mengambil data produk:', err);
      return res.send('Gagal mengambil data produk');
    }

    const produk = results.map(p => ({
      ...p,
      gambar_list: p.gambar ? p.gambar.split(',') : []
    }));

    res.render('produk', { produk });
  });
});

app.use('/media', express.static(path.join(__dirname, 'media')));

app.listen(3000, () => console.log('Server berjalan di http://localhost:3000'));
