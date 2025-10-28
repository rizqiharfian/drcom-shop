// app.js (selaras & disempurnakan)
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/media', express.static(path.join(__dirname, 'media')));

// MySQL connection (callback API) -> kita bungkus ke Promise untuk kemudahan
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'toko'
});

db.connect((err) => {
  if (err) throw err;
  console.log('✅ Connected to MySQL');
});

// helper promise wrappers
const q = (sql, params=[]) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, results) => err ? reject(err) : resolve(results));
});

const beginTransaction = () => new Promise((resolve, reject) => {
  db.beginTransaction(err => err ? reject(err) : resolve());
});
const commit = () => new Promise((resolve, reject) => {
  db.commit(err => err ? reject(err) : resolve());
});
const rollback = () => new Promise((resolve, reject) => {
  db.rollback(() => resolve()); // ignore rollback error, just resolve after rollback
});

// middleware untuk path (navbar aktif jika pakai)
app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});

// ---------- HOME (dashboard) ----------
app.get('/', async (req, res) => {
  try {
    // Produk + stok
    const sqlProduk = `
      SELECT produk.id, produk.nama, produk.keterangan, produk.gambar,
             IFNULL(stock.jumlah, 0) AS jumlah_stok
      FROM produk
      LEFT JOIN stock ON produk.id = stock.produk_id
      ORDER BY produk.nama ASC
    `;
    const produkRaw = await q(sqlProduk);
    const produk = produkRaw.map(p => ({ ...p, gambar_list: p.gambar ? p.gambar.split(',') : [] }));

    // Pembelian (riwayat)
    const pembelian = await q('SELECT * FROM pembelian ORDER BY tanggal DESC');

    // Riwayat barang masuk (ambil bm.tanggal AS created_at supaya view tidak berubah)
    const rowsBM = await q(`
      SELECT bm.id AS bm_id, bm.pengirim, bm.tanggal AS created_at,
             bmd.produk_id, bmd.jumlah, bmd.keterangan, p.nama
      FROM barang_masuk bm
      LEFT JOIN barang_masuk_detail bmd ON bm.id = bmd.barang_masuk_id
      LEFT JOIN produk p ON bmd.produk_id = p.id
      ORDER BY bm.tanggal DESC, bm.id DESC
    `);
    const groupedBM = {};
    rowsBM.forEach(r => {
      if (!r.bm_id) return;
      if (!groupedBM[r.bm_id]) groupedBM[r.bm_id] = { id: r.bm_id, pengirim: r.pengirim, created_at: r.created_at, items: [] };
      groupedBM[r.bm_id].items.push({ produk_id: r.produk_id, nama: r.nama, jumlah: r.jumlah, keterangan: r.keterangan });
    });
    const listBarangMasuk = Object.values(groupedBM);

    // Riwayat barang keluar (ambil bk.tanggal AS created_at)
    const rowsBK = await q(`
      SELECT bk.id AS bk_id, bk.tujuan, bk.tanggal AS created_at,
             bkd.produk_id, bkd.jumlah, bkd.keterangan, p.nama
      FROM barang_keluar bk
      LEFT JOIN barang_keluar_detail bkd ON bk.id = bkd.barang_keluar_id
      LEFT JOIN produk p ON bkd.produk_id = p.id
      ORDER BY bk.tanggal DESC, bk.id DESC
    `);
    const groupedBK = {};
    rowsBK.forEach(r => {
      if (!r.bk_id) return;
      if (!groupedBK[r.bk_id]) groupedBK[r.bk_id] = { id: r.bk_id, tujuan: r.tujuan, created_at: r.created_at, items: [] };
      groupedBK[r.bk_id].items.push({ produk_id: r.produk_id, nama: r.nama, jumlah: r.jumlah, keterangan: r.keterangan });
    });
    const listBarangKeluar = Object.values(groupedBK);

    // render index dengan semua data
    res.render('index', {
      produk,
      pembelian,
      barangMasukList: listBarangMasuk,
      barangKeluarList: listBarangKeluar
    });
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Gagal mengambil data untuk dashboard.');
  }
});


// ---------- PEMBELIAN PRODUK ----------
app.post('/beli', async (req, res) => {
  try {
    const { customer, produk_id, jumlah } = req.body;
    if (!customer || !produk_id || !jumlah) return res.status(400).send('Form tidak lengkap.');

    const pid = parseInt(produk_id, 10);
    const qty = parseInt(jumlah, 10);
    if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty <= 0) return res.status(400).send('Data tidak valid.');

    await beginTransaction();
    // insert pembelian
    await q('INSERT INTO pembelian (customer, produk_id, jumlah) VALUES (?, ?, ?)', [customer, pid, qty]);
    // update stock
    const update = await q('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [qty, pid]);
    if (update.affectedRows === 0) {
      // produk ga ada di stock
      await rollback();
      return res.status(400).send('Produk tidak ditemukan di stock.');
    }
    await commit();
    res.redirect('/');
  } catch (err) {
    console.error('POST /beli error:', err);
    try { await rollback(); } catch(_) {}
    res.status(500).send('Gagal memproses pembelian.');
  }
});

// ---------- CANCEL PEMBELIAN ----------
app.post('/cancel/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.redirect('/');

    const rows = await q('SELECT * FROM pembelian WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.redirect('/');

    const pembelian = rows[0];
    await q('UPDATE stock SET jumlah = jumlah + ? WHERE produk_id = ?', [pembelian.jumlah, pembelian.produk_id]);
    await q('DELETE FROM pembelian WHERE id = ?', [id]);
    res.redirect('/');
  } catch (err) {
    console.error('POST /cancel error:', err);
    res.status(500).send('Gagal membatalkan pembelian.');
  }
});

const fs = require('fs');
const multer = require('multer');

// pastikan folder media ada
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

// multer setup: simpan di folder /media
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, mediaDir);
  },
  filename: function (req, file, cb) {
    // buat nama unik: timestamp + originalname
    const name = Date.now() + '_' + file.originalname.replace(/\s+/g, '_');
    cb(null, name);
  }
});
const upload = multer({ storage });


// ==== POST /produk -> tambah produk + gambar + stok_awal ====
app.post('/produk', upload.array('gambar', 6), async (req, res) => {
  try {
    const nama = (req.body.nama || '').trim();
    const keterangan = req.body.keterangan ? req.body.keterangan.trim() : null;
    const stokAwal = parseInt(req.body.stok_awal, 10) || 0;
    const brand_id = req.body.brand_id ? (parseInt(req.body.brand_id,10) || null) : null;

    if (!nama) return res.status(400).send('Nama produk wajib diisi.');

    // gabungkan nama file yang diupload jadi string dipisah koma
    let gambarField = '';
    if (req.files && req.files.length > 0) {
      gambarField = req.files.map(f => f.filename).join(',');
    } else {
      gambarField = '';
    }

    // insert produk
    const ins = await q('INSERT INTO produk (nama, gambar, keterangan, brand_id) VALUES (?, ?, ?, ?)', [nama, gambarField, keterangan, brand_id]);
    const newId = ins.insertId;

    // insert atau update stock: tambahkan stokAwal jika >0
    if (stokAwal > 0) {
      await q(
        'INSERT INTO stock (produk_id, jumlah) VALUES (?, ?) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)',
        [newId, stokAwal]
      );
    }

    return res.redirect('/produk');
  } catch (err) {
    console.error('POST /produk error:', err);
    return res.status(500).send('Gagal menyimpan produk.');
  }
});

// ---- helper: cek apakah tabel/kolom ada ----
async function columnExists(tableName, columnName) {
  const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
  `;
  const rows = await q(sql, [tableName, columnName]);
  return rows && rows.length && rows[0].cnt > 0;
}

// ---- GET /produk (list) - robust terhadap brand.name vs brand.nama ----
app.get('/produk', async (req, res) => {
  try {
    // cek terlebih dulu apakah tabel brand ada dan kolom apa yang tersedia
    const brandTableExists = (await q("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'brand'"))[0].cnt > 0;
    let brandColumn = null;
    if (brandTableExists) {
      if (await columnExists('brand', 'name')) brandColumn = 'name';
      else if (await columnExists('brand', 'nama')) brandColumn = 'nama';
    }

    // bangun SQL dinamis
    let sql = `
      SELECT produk.*, IFNULL(stock.jumlah, 0) AS jumlah_stok
      ${brandColumn ? `, b.${brandColumn} AS brand_name` : ''}
      FROM produk
      LEFT JOIN stock ON produk.id = stock.produk_id
      ${brandColumn ? `LEFT JOIN brand b ON produk.brand_id = b.id` : ''}
      ORDER BY produk.nama ASC
    `;
    const results = await q(sql);
    const produk = results.map(p => ({ ...p, gambar_list: p.gambar ? p.gambar.split(',') : [], brand_name: p.brand_name ?? null }));
    // ambil brands untuk filter (jika ada tabel brand)
    const brands = brandTableExists ? await q('SELECT id, ' + (brandColumn || 'nama') + ' AS name FROM brand ORDER BY ' + (brandColumn || 'nama') + ' ASC') : [];
    res.render('produk', { produk, brands });
  } catch (err) {
    console.error('GET /produk error:', err);
    res.status(500).send('Gagal mengambil data produk.');
  }
});

// ---- GET /produk/:id (show) - robust terhadap brand column name ----
app.get('/produk/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(404).send('Produk tidak ditemukan.');

    // cek brand kolom seperti di atas
    const brandTableExists = (await q("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'brand'"))[0].cnt > 0;
    let brandColumn = null;
    if (brandTableExists) {
      if (await columnExists('brand', 'name')) brandColumn = 'name';
      else if (await columnExists('brand', 'nama')) brandColumn = 'nama';
    }

    const sql = `
      SELECT produk.*, IFNULL(stock.jumlah,0) AS jumlah_stok
      ${brandColumn ? `, b.${brandColumn} AS brand_name` : ''}
      FROM produk
      LEFT JOIN stock ON produk.id = stock.produk_id
      ${brandColumn ? `LEFT JOIN brand b ON produk.brand_id = b.id` : ''}
      WHERE produk.id = ? LIMIT 1
    `;
    const rows = await q(sql, [id]);
    if (!rows || rows.length === 0) return res.status(404).send('Produk tidak ditemukan.');

    const p = rows[0];
    p.gambar_list = p.gambar ? p.gambar.split(',') : [];
    // pastikan brand_name tersedia (atau null)
    p.brand_name = p.brand_name ?? null;

    // juga ambil stok saat ini supaya edit view bisa tampilkan
    const stokRows = await q('SELECT jumlah FROM stock WHERE produk_id = ?', [id]);
    const stok = (stokRows && stokRows.length > 0) ? stokRows[0].jumlah : 0;

    res.render('produk_show', { p, stok, brands: brandTableExists ? await q('SELECT id, ' + (brandColumn || 'nama') + ' AS name FROM brand ORDER BY ' + (brandColumn || 'nama') + ' ASC') : [] });
  } catch (err) {
    console.error('GET /produk/:id error:', err);
    res.status(500).send('Server error.');
  }
});

// ==== GET /produk/:id/edit (robust terhadap brand.name vs brand.nama) ====
app.get('/produk/:id/edit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(404).send('Produk tidak ditemukan.');

    const pRows = await q('SELECT * FROM produk WHERE id = ? LIMIT 1', [id]);
    if (!pRows || pRows.length === 0) return res.status(404).send('Produk tidak ditemukan.');

    // ambil brands dengan deteksi kolom (name atau nama)
    let brands = [];
    try {
      // cek apakah tabel brand ada
      const tbl = await q("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'brand'");
      const brandTableExists = tbl && tbl.length && tbl[0].cnt > 0;
      if (brandTableExists) {
        let brandColumn = null;
        if (await columnExists('brand', 'name')) brandColumn = 'name';
        else if (await columnExists('brand', 'nama')) brandColumn = 'nama';

        if (brandColumn) {
          brands = await q(`SELECT id, ${brandColumn} AS name FROM brand ORDER BY ${brandColumn} ASC`);
        } else {
          // brand table exists but kolom tidak standar -> ambil semua kolom dan coba pilih satu
          const raw = await q('SELECT * FROM brand LIMIT 1');
          if (raw && raw.length > 0) {
            // pilih kolom kedua yang bukan id sebagai label (fallback)
            const keys = Object.keys(raw[0]).filter(k => k !== 'id');
            if (keys.length > 0) {
              const col = keys[0];
              brands = await q(`SELECT id, ${col} AS name FROM brand ORDER BY ${col} ASC`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Warn: gagal ambil brands (jalan fallback):', e && e.message);
      brands = [];
    }

    const p = pRows[0];
    p.gambar_list = p.gambar ? p.gambar.split(',') : [];

    // ambil stok
    const s = await q('SELECT jumlah FROM stock WHERE produk_id = ? LIMIT 1', [id]);
    const stok = (s && s.length > 0) ? s[0].jumlah : 0;

    res.render('produk_edit', { p, brands, stok });
  } catch (err) {
    console.error('GET /produk/:id/edit error:', err);
    res.status(500).send('Server error.');
  }
});

// ---------- PRODUK: UPDATE ----------
/**
 * Form edit mengirim multipart/form-data dengan:
 * - name, keterangan
 * - gambar (file[] optional) -> field name 'gambar'
 * - stok_adjust (opsional, integer positif/negatif) atau stok_set (opsional) 
 *
 * Jika upload gambar, file baru akan ditambahkan (append) ke field produk.gambar.
 * Jika stok_adjust diberikan, jumlah di table stock akan diubah (+/-).
 */
// ==== POST /produk/:id (update produk) ====
app.post('/produk/:id', upload.array('gambar', 6), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(404).send('Produk tidak ditemukan.');

    const nama = (req.body.nama || '').trim();
    const keterangan = req.body.keterangan ? req.body.keterangan.trim() : null;
    const brand_id = req.body.brand_id ? (parseInt(req.body.brand_id,10) || null) : null;
    // stok_change: angka positif menambah, negatif mengurangi
    const stokChange = req.body.stok_change ? parseInt(req.body.stok_change, 10) : 0;

    if (!nama) return res.status(400).send('Nama produk wajib diisi.');

    // ambil current produk
    const curRows = await q('SELECT gambar FROM produk WHERE id = ? LIMIT 1', [id]);
    if (!curRows || curRows.length === 0) return res.status(404).send('Produk tidak ditemukan.');

    let currentGambar = curRows[0].gambar || '';
    // jika ada upload baru, gabungkan
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(f => f.filename).join(',');
      currentGambar = currentGambar ? (currentGambar + ',' + newFiles) : newFiles;
    }

    // update produk
    await q('UPDATE produk SET nama = ?, keterangan = ?, gambar = ?, brand_id = ? WHERE id = ?', [nama, keterangan, currentGambar, brand_id, id]);

    // update stock jika ada perubahan stok
    if (stokChange !== 0) {
      if (stokChange > 0) {
        await q('INSERT INTO stock (produk_id, jumlah) VALUES (?, ?) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)', [id, stokChange]);
      } else {
        // negative change - subtract
        const abs = Math.abs(stokChange);
        // pastikan tidak jadi negatif
        const r = await q('SELECT jumlah FROM stock WHERE produk_id = ? LIMIT 1', [id]);
        const cur = (r && r.length > 0) ? r[0].jumlah : 0;
        const newVal = Math.max(0, cur - abs);
        await q('INSERT INTO stock (produk_id, jumlah) VALUES (?, ?) ON DUPLICATE KEY UPDATE jumlah = ?', [id, newVal, newVal]);
      }
    }

    return res.redirect('/produk/' + id);
  } catch (err) {
    console.error('POST /produk/:id error:', err);
    return res.status(500).send('Gagal memperbarui produk.');
  }
});


// add brand (simple)
app.post('/brands', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).send('Nama brand kosong.');
    // insert jika belum ada (gunakan INSERT IGNORE atau cek dulu)
    const existing = await q('SELECT id FROM brand WHERE LOWER(name)=LOWER(?) LIMIT 1', [name]);
    if (existing && existing.length) return res.json({ id: existing[0].id, name });
    const r = await q('INSERT INTO brand (name) VALUES (?)', [name]);
    res.json({ id: r.insertId, name });
  } catch (err) {
    console.error('POST /brands error:', err);
    res.status(500).send('Gagal menambah brand.');
  }
});

// ---------- BARANG MASUK ----------
app.get('/barang-masuk', async (req, res) => {
  try {
    const produk = await q('SELECT id, nama FROM produk ORDER BY nama ASC');
    res.render('barang_masuk', { produk });
  } catch (err) {
    console.error('GET /barang-masuk error:', err);
    res.status(500).send('Gagal mengambil data produk.');
  }
});

// POST /barang-masuk (dengan multer untuk gambar per item)
app.post('/barang-masuk', upload.array('gambar'), async (req, res) => {
  try {
    console.log('--- POST /barang-masuk incoming ---');
    console.log('Body keys:', Object.keys(req.body));
    // jangan stringify req.body langsung kalau ada file besar; cukup preview
    console.log('Body preview:', Object.keys(req.body).reduce((o,k)=>{ o[k]=req.body[k]; return o; }, {}));

    const pengirim = (req.body.pengirim || '').trim();
    if (!pengirim) return res.status(400).send('Pengirim wajib diisi.');

    // Build items from arrays in req.body
    const produkArr = req.body['produk[]'] ?? req.body.produk ?? [];
    const produkNamaArr = req.body['produk_nama[]'] ?? req.body.produk_nama ?? [];
    const jumlahArr = req.body['jumlah[]'] ?? req.body.jumlah ?? [];
    const ketArr = req.body['keterangan[]'] ?? req.body.keterangan ?? [];

    // normalize to arrays
    const toArray = v => Array.isArray(v) ? v : (v ? [v] : []);
    const produkList = toArray(produkArr);
    const produkNamaList = toArray(produkNamaArr);
    const jumlahList = toArray(jumlahArr);
    const ketList = toArray(ketArr);

    // files from multer (ordered)
    const files = req.files || [];

    // build items: rely on index order; gambar for item i is files[i] if exists
    const items = [];
    const rowCount = Math.max(produkList.length, produkNamaList.length, jumlahList.length);
    for (let i = 0; i < rowCount; i++) {
      const pVal = produkList[i];
      const pNama = produkNamaList[i] || '';
      const jumlah = parseInt(jumlahList[i], 10) || 0;
      const keterangan = (ketList[i] || '').trim() || null;
      const file = files[i]; // may be undefined
      if ((!pVal || pVal === '') && (!pNama || pNama === '')) continue;
      if (!jumlah || jumlah <= 0) continue;

      const it = {};
      if (pVal && pVal !== '__TAMBAH_BARU__') {
        it.produk_id = parseInt(pVal, 10);
      } else {
        it.produk_nama = (pNama || '').trim();
      }
      it.jumlah = jumlah;
      it.keterangan = keterangan;
      it.gambar_filename = file ? file.filename : null; // simpan filename
      items.push(it);
    }

    if (!items.length) return res.status(400).send('Tidak ada item valid.');

    // Resolve produk_id: buat produk baru bila perlu
    for (let i = 0; i < items.length; i++) {
      const raw = (items[i].produk_id ?? items[i].produk_nama ?? '').toString().trim();
      const maybeId = parseInt(raw, 10);
      if (Number.isInteger(maybeId) && maybeId > 0) {
        items[i].produk_id = maybeId;
      } else {
        const rows = await q('SELECT id FROM produk WHERE LOWER(nama) = LOWER(?) LIMIT 1', [raw]);
        if (rows && rows.length > 0) {
          items[i].produk_id = rows[0].id;
        } else {
          const insP = await q('INSERT INTO produk (nama, gambar, keterangan) VALUES (?, ?, ?)', [raw, '', null]);
          items[i].produk_id = insP.insertId;
          console.log(`Produk baru dibuat: "${raw}" -> id ${items[i].produk_id}`);
        }
      }
      // ensure numbers
      items[i].jumlah = parseInt(items[i].jumlah, 10) || 0;
    }

    // filter valid
    const validItems = items.filter(it => Number.isInteger(it.produk_id) && it.jumlah > 0);
    if (validItems.length === 0) return res.status(400).send('Tidak ada item valid.');

    // DB transaction: insert barang_masuk, detail (termasuk gambar), update stock
    await beginTransaction();
    const resBM = await q('INSERT INTO barang_masuk (pengirim) VALUES (?)', [pengirim]);
    const barangMasukId = resBM.insertId;

    for (const it of validItems) {
      await q(
        'INSERT INTO barang_masuk_detail (barang_masuk_id, produk_id, jumlah, keterangan, gambar) VALUES (?, ?, ?, ?, ?)',
        [barangMasukId, it.produk_id, it.jumlah, it.keterangan, it.gambar_filename]
      );

      // update stock (insert or add)
      await q(
        'INSERT INTO stock (produk_id, jumlah) VALUES (?, ?) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)',
        [it.produk_id, it.jumlah]
      );
    }

    await commit();
    console.log('Barang masuk berhasil, id:', barangMasukId);
    return res.redirect('/');
  } catch (err) {
    console.error('POST /barang-masuk error:', err);
    try { await rollback(); } catch (_) {}
    return res.status(500).send('Server error: ' + (err.message || err));
  }
});

// --- VIEW barang masuk (detail) ---
app.get('/barang-masuk/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('Invalid ID');

    // Ambil header transaksi
    const bmRows = await q('SELECT id, pengirim, tanggal FROM barang_masuk WHERE id = ?', [id]);
    if (!bmRows || bmRows.length === 0) return res.status(404).send('Barang masuk tidak ditemukan');
    const bm = bmRows[0];

    // Ambil detail + nama produk + gambar dari tabel barang_masuk_detail (bukan produk)
    const details = await q(
      `SELECT bmd.id AS detail_id, bmd.produk_id, bmd.jumlah, bmd.keterangan, bmd.gambar, p.nama
       FROM barang_masuk_detail bmd
       LEFT JOIN produk p ON bmd.produk_id = p.id
       WHERE bmd.barang_masuk_id = ?`,
      [id]
    );

    const items = details.map(d => ({
      detail_id: d.detail_id,
      produk_id: d.produk_id,
      nama: d.nama,
      gambar_list: d.gambar ? d.gambar.split(',') : [], // bisa banyak gambar
      jumlah: d.jumlah,
      keterangan: d.keterangan
    }));

    res.render('barang_masuk_show', { bm, items });
  } catch (err) {
    console.error('GET /barang-masuk/:id error:', err);
    res.status(500).send('Gagal menampilkan detail.');
  }
});

// --- EDIT form (GET) ---
app.get('/barang-masuk/:id/edit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('Invalid ID');

    const bmRows = await q('SELECT id, pengirim, tanggal FROM barang_masuk WHERE id = ?', [id]);
    if (!bmRows || bmRows.length === 0) return res.status(404).send('Barang masuk tidak ditemukan');
    const bm = bmRows[0];

    // ambil semua produk untuk dropdown
    const produk = await q('SELECT id, nama FROM produk ORDER BY nama ASC');

    // ambil detail
    const details = await q(
      `SELECT bmd.id AS detail_id, bmd.produk_id, bmd.jumlah, bmd.keterangan, p.nama
       FROM barang_masuk_detail bmd
       LEFT JOIN produk p ON bmd.produk_id = p.id
       WHERE bmd.barang_masuk_id = ?`,
      [id]
    );

    // normalisasi: rows -> array item
    const items = details.map(d => ({
      detail_id: d.detail_id,
      produk_id: d.produk_id,
      produk_nama: d.nama,
      jumlah: d.jumlah,
      keterangan: d.keterangan
    }));

    res.render('barang_masuk_edit', { bm, produk, items });
  } catch (err) {
    console.error('GET /barang-masuk/:id/edit error:', err);
    res.status(500).send('Gagal membuka form edit.');
  }
});

// --- EDIT handler (POST) ---
app.post('/barang-masuk/:id/edit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('Invalid ID');

    const pengirim = (req.body.pengirim || '').trim();
    if (!pengirim) return res.status(400).send('Pengirim wajib diisi.');

    // parse items (pakai helper yang sudah ada)
    let incomingItems;
    try {
      incomingItems = parseItemsFromBody(req.body); // menghasilkan [{produk_id|produk_nama, jumlah, keterangan}, ...]
    } catch (e) {
      return res.status(400).send('Format items invalid: ' + e.message);
    }
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      return res.status(400).send('Tidak ada item untuk disimpan.');
    }

    // resolve produk_id (numeric) atau nama -> id (buat baru jika perlu)
    for (let i = 0; i < incomingItems.length; i++) {
      const raw = (incomingItems[i].produk_id ?? incomingItems[i].produk_nama ?? '').toString().trim();
      const maybeId = parseInt(raw, 10);
      if (Number.isInteger(maybeId) && maybeId > 0) {
        incomingItems[i].produk_id = maybeId;
      } else {
        const rows = await q('SELECT id FROM produk WHERE LOWER(nama) = LOWER(?) LIMIT 1', [raw]);
        if (rows && rows.length > 0) {
          incomingItems[i].produk_id = rows[0].id;
        } else {
          const insP = await q('INSERT INTO produk (nama, gambar, keterangan) VALUES (?, ?, ?)', [raw, '', null]);
          incomingItems[i].produk_id = insP.insertId;
        }
      }
      incomingItems[i].jumlah = parseInt(incomingItems[i].jumlah, 10) || 0;
      incomingItems[i].keterangan = incomingItems[i].keterangan ?? null;
    }

    // filter valid
    incomingItems = incomingItems.filter(it => Number.isInteger(it.produk_id) && it.jumlah > 0);
    if (incomingItems.length === 0) return res.status(400).send('Tidak ada item valid.');

    // ambil detail lama
    const oldRows = await q('SELECT id, produk_id, jumlah FROM barang_masuk_detail WHERE barang_masuk_id = ?', [id]);
    // map produk_id -> total jumlah lama (bisa ada lebih dari 1 detail dengan produk yg sama)
    const oldMap = {};
    oldRows.forEach(r => {
      oldMap[r.produk_id] = (oldMap[r.produk_id] || 0) + r.jumlah;
    });

    // map produk_id -> total jumlah baru
    const newMap = {};
    incomingItems.forEach(it => {
      newMap[it.produk_id] = (newMap[it.produk_id] || 0) + it.jumlah;
    });

    // Start transaction
    await beginTransaction();

    // update header pengirim (jika berubah)
    await q('UPDATE barang_masuk SET pengirim = ? WHERE id = ?', [pengirim, id]);

    // delete semua detail lama (simpler) then re-insert dari incomingItems
    // BUT sebelum delete, kita hitung pengaruhnya ke stock: we'll compute diff = new - old per produk
    // lakukan delete detail lama
    await q('DELETE FROM barang_masuk_detail WHERE barang_masuk_id = ?', [id]);

    // insert new details (one row per incoming item)
    for (const it of incomingItems) {
      await q(
        'INSERT INTO barang_masuk_detail (barang_masuk_id, produk_id, jumlah, keterangan) VALUES (?, ?, ?, ?)',
        [id, it.produk_id, it.jumlah, it.keterangan]
      );
    }

    // sekarang update stock berdasarkan selisih per produk:
    // delta = newMap[p] - (oldMap[p] || 0)
    const allProdukIds = Array.from(new Set([...Object.keys(oldMap), ...Object.keys(newMap)])).map(x => parseInt(x,10));
    for (const pid of allProdukIds) {
      const oldQty = oldMap[pid] || 0;
      const newQty = newMap[pid] || 0;
      const delta = newQty - oldQty; // positive -> add stock, negative -> subtract stock
      if (delta === 0) continue;

      if (delta > 0) {
        // tambah stock
        await q('INSERT INTO stock (produk_id, jumlah) VALUES (?, ?) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)', [pid, delta]);
      } else {
        // kurangi stock (abs)
        const abs = Math.abs(delta);
        // pastikan stok cukup (ambil current)
        const rows = await q('SELECT jumlah FROM stock WHERE produk_id = ?', [pid]);
        const cur = (rows && rows.length>0) ? rows[0].jumlah : 0;
        if (cur < abs) {
          await rollback();
          return res.status(400).send(`Stok tidak cukup untuk produk_id ${pid} saat update (tersisa ${cur}, butuh ${abs}).`);
        }
        await q('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [abs, pid]);
      }
    }

    await commit();
    return res.redirect('/'); // sesuai permintaan: redirect ke dashboard
  } catch (err) {
    console.error('POST /barang-masuk/:id/edit error:', err);
    try { await rollback(); } catch(_) {}
    return res.status(500).send('Gagal menyimpan perubahan.');
  }
});

// ---------- UTILITY: parse items dari dua format (pakai di barang masuk & keluar) ----------
function parseItemsFromBody(body) {
  // prefer body.items JSON if ada
  if (body.items) {
    try {
      const parsed = JSON.parse(body.items);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      throw new Error('Format items JSON invalid');
    }
  }

  // fallback: produk[], jumlah[], keterangan[] (form inputs)
  const produkArr = body['produk[]'] ?? body.produk ?? [];
  const jumlahArr = body['jumlah[]'] ?? body.jumlah ?? [];
  const ketArr = body['keterangan[]'] ?? body.keterangan ?? [];

  const pList = Array.isArray(produkArr) ? produkArr : (produkArr ? [produkArr] : []);
  const jList = Array.isArray(jumlahArr) ? jumlahArr : (jumlahArr ? [jumlahArr] : []);
  const kList = Array.isArray(ketArr) ? ketArr : (ketArr ? [ketArr] : []);

  const items = [];
  for (let i = 0; i < pList.length; i++) {
    const pid = pList[i];
    const qty = jList[i];
    const ket = kList[i] ?? null;
    if (pid && qty) items.push({ produk_id: pid, jumlah: qty, keterangan: ket });
  }
  return items;
}

// ---------- BARANG KELUAR ----------
app.get('/barang-keluar', async (req, res) => {
  try {
    const produk = await q('SELECT id, nama FROM produk ORDER BY nama ASC');
    res.render('barang_keluar', { produk });
  } catch (err) {
    console.error('GET /barang-keluar error:', err);
    res.status(500).send('Gagal mengambil data produk.');
  }
});

app.post('/barang-keluar', upload.array('gambar'), async (req, res) => {
  try {
    const tujuan = req.body.tujuan;
    if (!tujuan) return res.status(400).send('Tujuan wajib diisi.');

    // parse items (sama helper parseItemsFromBody)
    let data;
    try {
      data = parseItemsFromBody(req.body);
    } catch (e) {
      return res.status(400).send(e.message);
    }

    if (!Array.isArray(data) || data.length === 0) return res.status(400).send('Tidak ada item untuk disimpan.');

    // normalize & validate (tetap sama)
    data = data.map(it => ({
      produk_id: parseInt(it.produk_id, 10),
      jumlah: parseInt(it.jumlah, 10),
      keterangan: it.keterangan ?? null
    })).filter(it => Number.isInteger(it.produk_id) && Number.isInteger(it.jumlah) && it.jumlah > 0);

    if (data.length === 0) return res.status(400).send('Item tidak valid.');

    // req.files = array file dari multer (sesuai urutan input)
    const files = req.files || [];

    // mulai transaction
    await beginTransaction();
    const resBK = await q('INSERT INTO barang_keluar (tujuan) VALUES (?)', [tujuan]);
    const barangKeluarId = resBK.insertId;

    for (let i = 0; i < data.length; i++) {
      const it = data[i];

      // cek stok saat ini
      const rows = await q('SELECT jumlah FROM stock WHERE produk_id = ?', [it.produk_id]);
      const cur = (rows && rows.length > 0) ? rows[0].jumlah : 0;
      if (cur < it.jumlah) {
        await rollback();
        return res.status(400).send(`Stok tidak cukup untuk produk_id ${it.produk_id} (tersisa ${cur}).`);
      }

      // ambil file yang sesuai index i (jika ada)
      const file = files[i]; // catatan: jika user tidak upload file pada baris i, files array tetap bisa bergeser — biasanya pengguna upload sesuai baris
      const gambarFilename = file ? file.filename : null;

      // insert detail termasuk kolom gambar
      await q(
        'INSERT INTO barang_keluar_detail (barang_keluar_id, produk_id, jumlah, keterangan, gambar) VALUES (?, ?, ?, ?, ?)',
        [barangKeluarId, it.produk_id, it.jumlah, it.keterangan, gambarFilename]
      );

      // update stock
      await q('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [it.jumlah, it.produk_id]);
    }

    await commit();
    res.redirect('/');
  } catch (err) {
    console.error('POST /barang-keluar error:', err);
    try { await rollback(); } catch(_) {}
    res.status(500).send('Gagal menyimpan barang keluar.');
  }
});

// === ROUTE: Show barang keluar (detail transaksi) ===
app.get('/barang-keluar/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('ID tidak valid.');

    // ambil header transaksi
    const [hdrRows] = await Promise.all([ q('SELECT id, tujuan, tanggal FROM barang_keluar WHERE id = ?', [id]) ]);
    const hdr = (Array.isArray(hdrRows) ? hdrRows[0] : hdrRows) || (hdrRows && hdrRows.length ? hdrRows[0] : null);

    // ambil items (join produk untuk nama)
    const rows = await q(
      `SELECT bkd.id AS detail_id, bkd.produk_id, bkd.jumlah, bkd.keterangan, bkd.gambar, p.nama
       FROM barang_keluar_detail bkd
       LEFT JOIN produk p ON bkd.produk_id = p.id
       WHERE bkd.barang_keluar_id = ?`, [id]
    );

    if (!hdr) return res.status(404).send('Transaksi tidak ditemukan.');

    res.render('barang_keluar_show', { transaksi: hdr, items: rows || [] });
  } catch (err) {
    console.error('GET /barang-keluar/:id error:', err);
    res.status(500).send('Gagal mengambil data transaksi.');
  }
});

// === ROUTE: Edit form (GET) ===
app.get('/barang-keluar/edit/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('ID tidak valid.');

    const trx = await q('SELECT id, tujuan, tanggal FROM barang_keluar WHERE id = ?', [id]);
    if (!trx || trx.length === 0) return res.status(404).send('Transaksi tidak ditemukan.');

    const items = await q(
      `SELECT bkd.id AS detail_id, bkd.produk_id, bkd.jumlah, bkd.keterangan, bkd.gambar, p.nama
       FROM barang_keluar_detail bkd
       LEFT JOIN produk p ON bkd.produk_id = p.id
       WHERE bkd.barang_keluar_id = ?`, [id]
    );

    // kirim list produk juga untuk dropdown jika butuh ganti produk
    const produkList = await q('SELECT id, nama FROM produk ORDER BY nama ASC');

    res.render('barang_keluar_edit', { transaksi: trx[0], items: items || [], produkList });
  } catch (err) {
    console.error('GET /barang-keluar/edit/:id error:', err);
    res.status(500).send('Gagal membuka form edit.');
  }
});

// === ROUTE: Edit (POST) - menerima multipart/form-data dari form edit
// Expect field names: tujuan (string), for each item: detail_id[], produk_id[], jumlah[], keterangan[]
// And uploaded files per item: input name: gambar_<detail_id>  (optional)
app.post('/barang-keluar/edit/:id', upload.any(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('ID tidak valid.');

    // parse body arrays
    const { tujuan } = req.body;
    const detailIds = Array.isArray(req.body.detail_id) ? req.body.detail_id : (req.body.detail_id ? [req.body.detail_id] : []);
    const produkIds = Array.isArray(req.body.produk_id) ? req.body.produk_id : (req.body.produk_id ? [req.body.produk_id] : []);
    const jumlahs = Array.isArray(req.body.jumlah) ? req.body.jumlah : (req.body.jumlah ? [req.body.jumlah] : []);
    const ketArr = Array.isArray(req.body.keterangan) ? req.body.keterangan : (req.body.keterangan ? [req.body.keterangan] : []);

    // map files by fieldname
    const filesByField = {};
    (req.files || []).forEach(f => { filesByField[f.fieldname] = f; });

    // validate lengths
    if (detailIds.length === 0) return res.status(400).send('Tidak ada item untuk diperbarui.');

    // Fetch current detail records to compute delta stok
    const currentRows = await q('SELECT id, produk_id, jumlah FROM barang_keluar_detail WHERE barang_keluar_id = ?', [id]);
    const currentById = {};
    currentRows.forEach(r => currentById[r.id] = r);

    await beginTransaction();

    // update header
    await q('UPDATE barang_keluar SET tujuan = ? WHERE id = ?', [tujuan || null, id]);

    // iterate items, update each detail and adjust stock accordingly
    for (let i = 0; i < detailIds.length; i++) {
      const did = parseInt(detailIds[i], 10);
      const newProdukId = parseInt(produkIds[i], 10);
      const newJumlah = parseInt(jumlahs[i], 10) || 0;
      const newKet = ketArr[i] ?? null;

      if (!did || !Number.isInteger(newProdukId) || newJumlah <= 0) {
        await rollback();
        return res.status(400).send('Data item tidak valid.');
      }

      const cur = currentById[did];
      if (!cur) {
        await rollback();
        return res.status(400).send('Detail item tidak ditemukan: ' + did);
      }

      // if produk_id changed, we need to add back old stock and subtract new stock
      // if same produk_id, compute delta = new - old and subtract accordingly (barang keluar reduces stock)
      if (cur.produk_id === newProdukId) {
        const delta = newJumlah - cur.jumlah; // positive => more taken out (need more stock), negative => return some stock
        if (delta > 0) {
          // check available stock
          const rows = await q('SELECT jumlah FROM stock WHERE produk_id = ?', [newProdukId]);
          const curStock = (rows && rows.length) ? rows[0].jumlah : 0;
          if (curStock < delta) {
            await rollback();
            return res.status(400).send(`Stok tidak cukup untuk produk id ${newProdukId} (butuh ${delta}, tersisa ${curStock}).`);
          }
          await q('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [delta, newProdukId]);
        } else if (delta < 0) {
          // return stok (kurangi negative => add)
          await q('UPDATE stock SET jumlah = jumlah + ? WHERE produk_id = ?', [Math.abs(delta), newProdukId]);
        }
      } else {
        // produk berubah: kembalikan stok lama, potong stok baru
        // add back old
        await q('UPDATE stock SET jumlah = jumlah + ? WHERE produk_id = ?', [cur.jumlah, cur.produk_id]);

        // subtract new
        const rows2 = await q('SELECT jumlah FROM stock WHERE produk_id = ?', [newProdukId]);
        const curStock2 = (rows2 && rows2.length) ? rows2[0].jumlah : 0;
        if (curStock2 < newJumlah) {
          await rollback();
          return res.status(400).send(`Stok tidak cukup untuk produk id ${newProdukId} (butuh ${newJumlah}, tersisa ${curStock2}).`);
        }
        await q('UPDATE stock SET jumlah = jumlah - ? WHERE produk_id = ?', [newJumlah, newProdukId]);
      }

      // handle optional uploaded gambar for this detail: name expected 'gambar_<detailId>' (client form should match)
      let gambarFilename = null;
      const fileField = `gambar_${did}`;
      if (filesByField[fileField]) {
        gambarFilename = filesByField[fileField].filename;
      }

      // update detail record (include gambar only if ada upload)
      if (gambarFilename) {
        await q('UPDATE barang_keluar_detail SET produk_id = ?, jumlah = ?, keterangan = ?, gambar = ? WHERE id = ?', [newProdukId, newJumlah, newKet, gambarFilename, did]);
      } else {
        await q('UPDATE barang_keluar_detail SET produk_id = ?, jumlah = ?, keterangan = ? WHERE id = ?', [newProdukId, newJumlah, newKet, did]);
      }
    }

    await commit();
    return res.redirect('/barang-keluar');
  } catch (err) {
    console.error('POST /barang-keluar/edit/:id error:', err);
    try { await rollback(); } catch(_) {}
    return res.status(500).send('Gagal menyimpan perubahan.');
  }
});

app.get('/list-barang-masuk', async (req, res) => {
  try {
    const sql = `
      SELECT bm.id AS bm_id, bm.pengirim, bm.tanggal AS created_at,
             bmd.produk_id, bmd.jumlah, bmd.keterangan, p.nama
      FROM barang_masuk bm
      LEFT JOIN barang_masuk_detail bmd ON bm.id = bmd.barang_masuk_id
      LEFT JOIN produk p ON bmd.produk_id = p.id
      ORDER BY bm.tanggal DESC
    `;
    const rows = await q(sql);

    // group by bm_id
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.bm_id]) {
        grouped[r.bm_id] = {
          id: r.bm_id,
          pengirim: r.pengirim,
          created_at: r.created_at,
          items: []
        };
      }
      grouped[r.bm_id].items.push({
        produk_id: r.produk_id,
        nama: r.nama,
        jumlah: r.jumlah,
        keterangan: r.keterangan
      });
    });

    res.render('list_barang_masuk', { list: Object.values(grouped) });
  } catch (err) {
    console.error('GET /list-barang-masuk error:', err);
    res.status(500).send('Gagal mengambil list barang masuk.');
  }
});

app.get('/list-barang-keluar', async (req, res) => {
  try {
    const sql = `
      SELECT bk.id AS bk_id, bk.tujuan, bk.tanggal AS created_at,
             bkd.produk_id, bkd.jumlah, bkd.keterangan, p.nama
      FROM barang_keluar bk
      LEFT JOIN barang_keluar_detail bkd ON bk.id = bkd.barang_keluar_id
      LEFT JOIN produk p ON bkd.produk_id = p.id
      ORDER BY bk.tanggal DESC
    `;
    const rows = await q(sql);

    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.bk_id]) {
        grouped[r.bk_id] = {
          id: r.bk_id,
          tujuan: r.tujuan,
          created_at: r.created_at,
          items: []
        };
      }
      grouped[r.bk_id].items.push({
        produk_id: r.produk_id,
        nama: r.nama,
        jumlah: r.jumlah,
        keterangan: r.keterangan
      });
    });

    res.render('list_barang_keluar', { list: Object.values(grouped) });
  } catch (err) {
    console.error('GET /list-barang-keluar error:', err);
    res.status(500).send('Gagal mengambil list barang keluar.');
  }
});

// Jalankan server
app.listen(3000, () => console.log('🚀 Server berjalan di http://localhost:3000'));
