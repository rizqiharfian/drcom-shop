// 1️⃣ Load env PALING ATAS
require('dotenv').config();

// 2️⃣ Import module
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

// 3️⃣ Init app
const app = express();

// 4️⃣ Config dasar
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use(express.urlencoded({ extended: true }));


// 5️⃣ DB (cukup require, JANGAN connect lagi)
const db = require('./config/db');

// 6️⃣ ROUTES (kalau ada)
// app.use('/', require('./routes/...'));

// helper promise wrappers
const q = (sql, params=[]) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, results) => err ? reject(err) : resolve(results));
});

const PDFDocument = require('pdfkit');

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
    // ======================================================
    // PRODUK + STOK CABANG + NOMOR DINAMIS
    // ======================================================

    const sqlProduk = `

    SELECT

      p.id,
      p.nama,
      p.keterangan,
      p.gambar,
      p.kode_produk,
      p.posisi,

      COALESCE(b.nama, 'Tanpa Brand') AS brand_name,

      COALESCE(jakarta.jumlah, 0) AS stok_jakarta,

      COALESCE(semarang.jumlah, 0) AS stok_semarang,

      (
        COALESCE(jakarta.jumlah, 0)
        +
        COALESCE(semarang.jumlah, 0)
      ) AS total_stok

    FROM produk p

    LEFT JOIN stock_cabang jakarta
      ON p.id = jakarta.produk_id
      AND jakarta.cabang_id = 1

    LEFT JOIN stock_cabang semarang
      ON p.id = semarang.produk_id
      AND semarang.cabang_id = 2

    LEFT JOIN brand b
      ON p.brand_id = b.id

    ORDER BY

    CASE
      WHEN (
        COALESCE(jakarta.jumlah,0)
        +
        COALESCE(semarang.jumlah,0)
      ) > 0 THEN 0
      ELSE 1
    END,

    CAST(
      REPLACE(
        UPPER(p.kode_produk),
        'P',
        ''
      ) AS UNSIGNED
    ) ASC

    `;

    const produkRaw = await q(sqlProduk);

    const seller = await q(`
      SELECT *
      FROM seller
      ORDER BY nama_seller ASC
    `);

    const toko = await q(`
      SELECT *
      FROM seller_toko
      ORDER BY nama_toko ASC
    `);

    // ======================================================
    // BUAT NOMOR PRODUK DINAMIS
    // ======================================================

    let nomorAktif = 1;

    const produk = produkRaw.map(p => {

      let kodeTampil = 'SOLD';

      if (p.total_stok > 0) {

        kodeTampil = `P${nomorAktif}`;

        nomorAktif++;

      }

      return {

        ...p,

        kode_tampil: kodeTampil,

        gambar_list:
          p.gambar
            ? p.gambar.split(',')
            : []

      };

    });

    // Pembelian (riwayat)
    const pembelian = await q(`
      SELECT
        pb.*,
        s.nama_seller,
        t.nama_toko

      FROM pembelian pb

      LEFT JOIN seller s
        ON s.id = pb.seller_id

      LEFT JOIN seller_toko t
        ON t.id = pb.toko_id

      ORDER BY
      CASE
        WHEN status = 2 THEN 0
        WHEN status = 1 THEN 1
        WHEN status = 3 THEN 2
      END, tanggal DESC
    `);

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
         bkd.id AS detail_id, bkd.produk_id, bkd.jumlah, bkd.keterangan, bkd.status, p.nama
  FROM barang_keluar bk
  LEFT JOIN barang_keluar_detail bkd ON bk.id = bkd.barang_keluar_id
  LEFT JOIN produk p ON bkd.produk_id = p.id
  ORDER BY bk.tanggal DESC, bk.id DESC
`);
const groupedBK = {};
rowsBK.forEach(r => {
  if (!r.bk_id) return;
  if (!groupedBK[r.bk_id]) groupedBK[r.bk_id] = { id: r.bk_id, tujuan: r.tujuan, created_at: r.created_at, items: [] };
  groupedBK[r.bk_id].items.push({
    detail_id: r.detail_id,
    produk_id: r.produk_id,
    nama: r.nama,
    jumlah: r.jumlah,
    keterangan: r.keterangan,
    status: (typeof r.status !== 'undefined' && r.status !== null) ? r.status : 2 // default pending
  });
  });

  // ======================
  // BARANG KELUAR ALEX
  // ======================

  const barangKeluarAlexList = await q(`
    SELECT
      a.*,
      p.nama AS nama_produk
    FROM barang_alex_keluar a
    LEFT JOIN produk p
      ON p.id = a.produk_id
    ORDER BY
      CASE
        WHEN a.status = 'pending' THEN 0
        ELSE 1
      END,
      a.created_at DESC
  `);
const listBarangKeluar = Object.values(groupedBK);

const barangHilang = await q(`
      SELECT
        bh.*,
        p.nama,
        p.kode_produk
      FROM barang_hilang bh
      LEFT JOIN produk p
        ON p.id = bh.produk_id
      WHERE bh.status = 'hilang'
      ORDER BY bh.created_at DESC
    `);

    // render index dengan semua data
    res.render('index', {
      produk,
      pembelian,
      barangMasukList: listBarangMasuk,
      barangKeluarList: listBarangKeluar,
      barangKeluarAlexList,
      barangHilang,
      seller,
      toko
    });
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Gagal mengambil data untuk dashboard.');
  }
});

// ======================================================
// HALAMAN BARANG HILANG
// ======================================================

app.get('/barang-hilang', async (req,res)=>{

  try{

    const produk = await q(`
      SELECT
        id,
        nama,
        kode_produk
      FROM produk
      ORDER BY nama ASC
    `);

    const data = await q(`
      SELECT
        bh.*,
        p.nama,
        p.kode_produk
      FROM barang_hilang bh
      LEFT JOIN produk p
        ON p.id = bh.produk_id
      ORDER BY
        CASE
          WHEN bh.status='hilang' THEN 0
          ELSE 1
        END,
        bh.created_at DESC
    `);

    res.render(
      'barang_hilang',
      {
        produk,
        data,
        path:'/barang-hilang'
      }
    );

  }catch(err){

    console.error(err);

    res.status(500).send(err.message);

  }

});

app.post('/barang-hilang', async (req,res)=>{

  try{

    const {
      produk_id,
      jumlah,
      keterangan
    } = req.body;

    await q(`
      INSERT INTO barang_hilang
      (
        produk_id,
        jumlah,
        keterangan
      )
      VALUES (?, ?, ?)
    `,[
      produk_id,
      jumlah,
      keterangan || null
    ]);

    res.redirect('/barang-hilang');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal');

  }

});

app.post('/barang-hilang/:id/ditemukan', async (req,res)=>{

  try{

    await q(`
      UPDATE barang_hilang
      SET status='ditemukan'
      WHERE id=?
    `,[
      req.params.id
    ]);

    res.redirect('/barang-hilang');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal');

  }

});

// ======================================================
// EXPORT PDF BARANG HILANG
// ======================================================

app.get('/barang-hilang/export', async (req,res)=>{

  try{

    const type = req.query.type || 'all';

    let where = '';
    let params = [];

    if(type === 'hari'){

      where = `
        WHERE DATE(bh.created_at)=CURDATE()
      `;

    }

    if(type === 'minggu'){

      where = `
        WHERE bh.created_at >= DATE_SUB(NOW(),INTERVAL 7 DAY)
      `;

    }

    if(type === 'bulan'){

      where = `
        WHERE MONTH(bh.created_at)=MONTH(NOW())
        AND YEAR(bh.created_at)=YEAR(NOW())
      `;

    }

    const rows = await q(`
      SELECT
        bh.*,
        p.nama,
        p.kode_produk,
        p.harga_modal
      FROM barang_hilang bh
      LEFT JOIN produk p
        ON p.id = bh.produk_id
      ${where}
      ORDER BY bh.created_at DESC
    `,params);

    let totalKerugian = 0;
    let totalQty = 0;

    rows.forEach(r=>{

      const hargaModal =
        Number(r.harga_modal || 0);

      const qty =
        Number(r.jumlah || 0);

      totalQty += qty;

      totalKerugian +=
        hargaModal * qty;

    });

    const doc = new PDFDocument({
      size:'A4',
      layout:'landscape',
      margin:20
    });

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      'inline; filename=barang-hilang.pdf'
    );

    doc.pipe(res);

    // =====================================
    // HEADER
    // =====================================

    doc
      .fontSize(18)
      .text(
        'LAPORAN BARANG HILANG / BELUM KETEMU',
        {
          align:'center'
        }
      );

    doc.moveDown();

    doc
      .fontSize(10)
      .text(
        `Dicetak : ${new Date().toLocaleString('id-ID')}`,
        {
          align:'right'
        }
      );

    doc.moveDown();

    doc
      .fontSize(11)
      .text(`Total Data : ${rows.length}`);

    doc.text(`Total Qty Hilang : ${totalQty}`);

    doc.text(
      `Total Kerugian Modal : Rp ${totalKerugian.toLocaleString('id-ID')}`
    );

    doc.moveDown();

    // =====================================
    // TABLE HEADER
    // =====================================

    let y = doc.y;

    doc.rect(20,y,780,30).stroke();

    doc.text('No',25,y+8);
    doc.text('Kode',55,y+8);
    doc.text('Produk',130,y+8);
    doc.text('Qty',430,y+8);
    doc.text('Harga Modal',490,y+8);
    doc.text('Total',620,y+8);
    doc.text('Status',730,y+8);

    y += 30;

    // =====================================
    // DATA
    // =====================================

    rows.forEach((r,index)=>{

      const hargaModal =
        Number(r.harga_modal || 0);

      const total =
        hargaModal * Number(r.jumlah || 0);

      // Lebar produk maksimal 280 px
      const tinggiProduk = doc.heightOfString(
        r.nama || '-',
        {
          width:280
        }
      );

      const rowHeight =
        Math.max(
          35,
          tinggiProduk + 15
        );

      if(y + rowHeight > 520){

        doc.addPage();

        y = 40;

      }

      doc.rect(
        20,
        y,
        780,
        rowHeight
      ).stroke();

      doc.text(
        String(index + 1),
        25,
        y + 10
      );

      doc.text(
        r.kode_produk || '-',
        55,
        y + 10,
        {
          width:60
        }
      );

      doc.text(
        r.nama || '-',
        130,
        y + 10,
        {
          width:280,
          align:'left'
        }
      );

      doc.text(
        String(r.jumlah),
        430,
        y + 10,
        {
          width:40,
          align:'left'
        }
      );

      doc.text(
        `Rp ${hargaModal.toLocaleString('id-ID')}`,
        490,
        y + 10,
        {
          width:110
        }
      );

      doc.text(
        `Rp ${total.toLocaleString('id-ID')}`,
        620,
        y + 10,
        {
          width:90
        }
      );

      doc.text(
        r.status || '-',
        730,
        y + 10,
        {
          width:50
        }
      );

      y += rowHeight;

    });

    // =====================================
    // FOOTER TOTAL
    // =====================================

    y += 20;

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(
        `TOTAL KERUGIAN MODAL : Rp ${totalKerugian.toLocaleString('id-ID')}`,
        0,
        y,
        {
          align:'right'
        }
      );

    doc.end();

  }catch(err){

    console.error(err);

    res.status(500).send(
      'Gagal export PDF Barang Hilang'
    );

  }

});

// =====================================
// HALAMAN SELLER
// =====================================

app.get('/seller', async(req,res)=>{

  try{

    const seller = await q(`
      SELECT *
      FROM seller
      ORDER BY nama_seller ASC
    `);

    const toko = await q(`
      SELECT
        st.*,
        s.nama_seller

      FROM seller_toko st

      LEFT JOIN seller s
        ON s.id = st.seller_id

      ORDER BY
        s.nama_seller ASC,
        st.nama_toko ASC
    `);

    res.render('seller',{
      seller,
      toko
    });

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal load seller');

  }

});

// =====================================
// TAMBAH SELLER
// =====================================

app.post('/seller/tambah', async(req,res)=>{

  try{

    await q(`
      INSERT INTO seller
      (
        nama_seller
      )
      VALUES (?)
    `,[
      req.body.nama_seller
    ]);

    res.redirect('/seller');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal tambah seller');

  }

});

// =====================================
// TAMBAH TOKO SELLER
// =====================================

app.post('/seller/toko/tambah', async(req,res)=>{

  try{

    await q(`
      INSERT INTO seller_toko
      (
        seller_id,
        nama_toko
      )
      VALUES (?,?)
    `,[
      req.body.seller_id,
      req.body.nama_toko
    ]);

    res.redirect('/seller');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal tambah toko');

  }

});

app.post('/seller/:id/hapus', async(req,res)=>{

  try{

    await q(`
      DELETE FROM seller
      WHERE id=?
    `,[req.params.id]);

    res.redirect('/seller');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal hapus seller');

  }

});

app.post('/seller/toko/:id/hapus', async(req,res)=>{

  try{

    await q(`
      DELETE FROM seller_toko
      WHERE id=?
    `,[req.params.id]);

    res.redirect('/seller');

  }catch(err){

    console.error(err);

    res.status(500).send('Gagal hapus toko');

  }

});

app.get('/seller/:id/toko', async(req,res)=>{

  try{

    const rows = await q(`
      SELECT *
      FROM seller_toko
      WHERE seller_id=?
      ORDER BY nama_toko ASC
    `,[req.params.id]);

    res.json(rows);

  }catch(err){

    console.error(err);

    res.status(500).json([]);

  }

});

// ---------- PEMBELIAN PRODUK (create as PENDING) ----------
// ==========================================
// HALAMAN FORM PEMBELIAN
// ==========================================
app.get('/beli', async (req, res) => {

  try {

    const rows = await q(`
      SELECT
        p.*,

        COALESCE(jakarta.jumlah, 0) AS stok_jakarta,

        COALESCE(semarang.jumlah, 0) AS stok_semarang,

        (
          COALESCE(jakarta.jumlah, 0)
          +
          COALESCE(semarang.jumlah, 0)
        ) AS total_stok,

        COALESCE(
          b.nama,
          'Tanpa Brand'
        ) AS brand_name

      FROM produk p

      LEFT JOIN stock_cabang jakarta
        ON p.id = jakarta.produk_id
        AND jakarta.cabang_id = 1

      LEFT JOIN stock_cabang semarang
        ON p.id = semarang.produk_id
        AND semarang.cabang_id = 2

      LEFT JOIN brand b
        ON p.brand_id = b.id

      ORDER BY

      CASE
        WHEN (
          COALESCE(jakarta.jumlah,0)
          +
          COALESCE(semarang.jumlah,0)
        ) > 0 THEN 0
        ELSE 1
      END,

      CAST(
        REPLACE(
          UPPER(p.kode_produk),
          'P',
          ''
        ) AS UNSIGNED
      ) ASC
    `);

    const seller = await q(`
      SELECT *
      FROM seller
      ORDER BY nama_seller ASC
    `);

    const toko = await q(`
      SELECT *
      FROM seller_toko
      ORDER BY nama_toko ASC
    `);

    // ======================================
    // BUAT NOMOR URUT AKTIF
    // ======================================

    let activeIndex = 1;

    const produk = rows.map(p => {

      const totalStok =
        Number(p.total_stok || 0);

      // jika stok masih ada
      if (totalStok > 0) {

        p.nomor_urut = activeIndex;

        p.kode_tampil =
          'P' + activeIndex;

        activeIndex++;

      } else {

        p.nomor_urut = null;

        p.kode_tampil = 'SOLD';

      }

      return p;

    });

    res.render('beli', {
      produk,
      seller,
      toko
    });

  } catch (err) {

    console.error(
      'GET /beli ERROR:',
      err
    );

    res.status(500).send(
      'Server Error'
    );

  }

});

// ==========================================
// PROSES PEMBELIAN
// ==========================================

app.post('/beli', async (req, res) => {

  try {

    const {

      seller_id,
      toko_id,
      produk_id,
      jumlah,
      harga,
      harga_modal,
      keterangan,
      cabang_id

    } = req.body;

    // ==============================
    // VALIDASI
    // ==============================

    if (
      !seller_id ||
      !toko_id ||
      !produk_id ||
      !jumlah ||
      !harga ||
      !cabang_id
    ) {

      return res.status(400).send(
        'Data pembelian tidak lengkap.'
      );

    }

    const pid =
      parseInt(produk_id);

    const qty =
      parseInt(jumlah);

    const cid =
      parseInt(cabang_id);

    // ==============================
    // CEK STOK CABANG
    // ==============================

    const stockRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = ?
      LIMIT 1
    `, [
      pid,
      cid
    ]);

    const currentStock =
      stockRows.length
        ? parseInt(stockRows[0].jumlah)
        : 0;

    if (currentStock < qty) {

      return res.status(400).send(
        `Stok tidak cukup. Sisa ${currentStock}`
      );

    }

    // ==============================
    // INSERT PEMBELIAN
    // status 2 = pending
    // ==============================

    await q(`
      INSERT INTO pembelian
      (
        seller_id,
        toko_id,
        produk_id,
        jumlah,
        harga,
        harga_modal,
        keterangan,
        cabang_id,
        status,
        tanggal
      )
      VALUES
      (
        ?, ?, ?, ?, ?, ?, ?, ?, 2, NOW()
      )
    `, [

      seller_id,
      toko_id,
      pid,
      qty,
      harga,
      harga_modal || 0,
      keterangan || '',
      cid

    ]);

    return res.redirect('/');

  } catch (err) {

    console.error(
      'POST /beli ERROR:',
      err
    );

    return res.status(500).send(
      'Gagal memproses pembelian.'
    );

  }

});

// ==========================================
// TOGGLE PEMBELIAN
// pending <-> selesai
// ==========================================

app.post('/pembelian/toggle/:id', async (req, res) => {

  try {

    const id = parseInt(req.params.id, 10);

    if (!id) {

      return res.status(400).json({
        ok: false,
        error: 'ID tidak valid'
      });

    }

    // ======================================
    // AMBIL DATA PEMBELIAN
    // ======================================

    const rows = await q(`
      SELECT *
      FROM pembelian
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (!rows.length) {

      return res.status(404).json({
        ok: false,
        error: 'Pembelian tidak ditemukan'
      });

    }

    const beli = rows[0];

    const pid =
      parseInt(beli.produk_id);

    const qty =
      parseInt(beli.jumlah) || 0;

    // CABANG YANG DIPAKAI
    const cabangId =
      parseInt(beli.cabang_id);

    await beginTransaction();

    let newStatus = 2;

    // ======================================
    // PENDING -> SELESAI
    // KURANGI STOK
    // ======================================

    if (beli.status == 2) {

      const stockRows = await q(`
        SELECT jumlah
        FROM stock_cabang
        WHERE produk_id = ?
        AND cabang_id = ?
        LIMIT 1
      `, [
        pid,
        cabangId
      ]);

      const curStock =
        stockRows.length
          ? parseInt(stockRows[0].jumlah)
          : 0;

      // cek stok cukup
      if (curStock < qty) {

        await rollback();

        return res.status(400).json({
          ok: false,
          error: `Stok tidak cukup. Sisa ${curStock}`
        });

      }

      // kurangi stok cabang
      await q(`
        UPDATE stock_cabang
        SET jumlah = jumlah - ?
        WHERE produk_id = ?
        AND cabang_id = ?
      `, [
        qty,
        pid,
        cabangId
      ]);

      // ubah status selesai
      await q(`
        UPDATE pembelian
        SET status = 1
        WHERE id = ?
      `, [id]);

      newStatus = 1;

    }

    // ======================================
    // SELESAI -> PENDING
    // KEMBALIKAN STOK
    // ======================================

    else {

      await q(`
        INSERT INTO stock_cabang
        (
          produk_id,
          cabang_id,
          jumlah
        )
        VALUES (?, ?, ?)

        ON DUPLICATE KEY UPDATE

        jumlah = jumlah + VALUES(jumlah)
      `, [
        pid,
        cabangId,
        qty
      ]);

      // ubah status pending
      await q(`
        UPDATE pembelian
        SET status = 2
        WHERE id = ?
      `, [id]);

      newStatus = 2;

    }

    await commit();

    // ======================================
    // AMBIL STOK TERBARU
    // ======================================

    const latestRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = ?
      LIMIT 1
    `, [
      pid,
      cabangId
    ]);

    const finalStock =
      latestRows.length
        ? latestRows[0].jumlah
        : 0;

    return res.json({

      ok: true,

      status: newStatus,

      stock: finalStock,

      produk_id: pid,

      cabang_id: cabangId

    });

  } catch (err) {

    console.error(
      'POST /pembelian/toggle/:id error:',
      err
    );

    try {

      await rollback();

    } catch (_) {}

    return res.status(500).json({

      ok: false,

      error: 'Server error saat toggle pembelian.'

    });

  }

});

// ==========================================
// COMPLETE PEMBELIAN
// ==========================================

app.post('/pembelian/complete/:id', async (req, res) => {

  try {

    const id = parseInt(req.params.id, 10);

    if (!id) {

      return res.status(400).send(
        'ID tidak valid.'
      );

    }

    // ======================================
    // AMBIL DATA PEMBELIAN
    // ======================================

    const rows = await q(`
      SELECT *
      FROM pembelian
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (!rows.length) {

      return res.status(404).send(
        'Pembelian tidak ditemukan.'
      );

    }

    const pb = rows[0];

    // jika sudah selesai
    if (pb.status == 1) {

      return res.json({
        ok: true
      });

    }

    const pid =
      parseInt(pb.produk_id);

    const qty =
      parseInt(pb.jumlah);

    const cabangId =
      parseInt(pb.cabang_id);

    await beginTransaction();

    // ======================================
    // CEK STOK CABANG
    // ======================================

    const stockRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = ?
      LIMIT 1
    `, [
      pid,
      cabangId
    ]);

    const currentStock =
      stockRows.length
        ? parseInt(stockRows[0].jumlah)
        : 0;

    if (currentStock < qty) {

      await rollback();

      return res.status(400).send(
        `Stok tidak cukup. Sisa ${currentStock}`
      );

    }

    // ======================================
    // KURANGI STOK CABANG
    // ======================================

    await q(`
      UPDATE stock_cabang
      SET jumlah = jumlah - ?
      WHERE produk_id = ?
      AND cabang_id = ?
    `, [
      qty,
      pid,
      cabangId
    ]);

    // ======================================
    // UPDATE STATUS
    // ======================================

    await q(`
      UPDATE pembelian
      SET status = 1
      WHERE id = ?
    `, [id]);

    await commit();

    return res.json({
      ok: true
    });

  } catch (err) {

    console.error(
      'POST /pembelian/complete/:id error:',
      err
    );

    try {

      await rollback();

    } catch (_) {}

    return res.status(500).send(
      'Gagal menyelesaikan pembelian.'
    );

  }

});

// ---------- CANCEL PEMBELIAN ----------
app.post('/cancel/:id', async (req, res) => {
  try {

    const id = parseInt(req.params.id);

    const rows = await q(`
      SELECT *
      FROM pembelian
      WHERE id = ?
      LIMIT 1
    `,[id]);

    if(!rows.length){
      return res.redirect('/');
    }

    const pb = rows[0];

    await beginTransaction();

    // jika sebelumnya selesai
    // stok dikembalikan
    if(pb.status == 1){

      await q(`
        INSERT INTO stock_cabang
        (
          produk_id,
          cabang_id,
          jumlah
        )
        VALUES (?, ?, ?)

        ON DUPLICATE KEY UPDATE

        jumlah = jumlah + VALUES(jumlah)
      `,[
        pb.produk_id,
        pb.cabang_id,
        pb.jumlah
      ]);

    }

    await q(`
      UPDATE pembelian
      SET status = 3
      WHERE id = ?
    `,[id]);

    await commit();

    res.redirect('/');

  } catch(err){

    console.error(err);

    try{
      await rollback();
    }catch(e){}

    res.status(500).send('Gagal cancel pembelian');
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

// ========== EXPORT PDF PEMBELIAN ==========
app.get('/export/pembelian/pdf', async (req, res) => {
  try {

    const { start, end, status, seller_id } = req.query;

    if (!start || !end) {
      return res
        .status(400)
        .send('Parameter tanggal wajib.');
    }

    // ======================================
    // FILTER DINAMIS
    // ======================================

    let where = `
      WHERE DATE(p.tanggal) BETWEEN ? AND ?
    `;

    const params = [start, end];

    // status
    if (
      status &&
      status !== 'all'
    ) {

      where += `
        AND p.status = ?
      `;

      params.push(
        parseInt(status)
      );

    }

    // seller
    if ( seller_id && seller_id !== 'all' ) { where += ` AND p.seller_id = ? `;
      params.push(
        parseInt(seller_id)
      );

    }

    // ======================================
    // QUERY
    // ======================================

    const sql = `
      SELECT

        p.id,
        p.customer,
        p.jumlah,
        p.harga_modal,
        p.harga,
        p.keterangan,
        p.tanggal,
        p.status,

        p.seller_id,

        s.nama_seller,

        pr.nama AS produk_nama

      FROM pembelian p

      LEFT JOIN produk pr
        ON pr.id = p.produk_id

      LEFT JOIN seller s
        ON s.id = p.seller_id

      ${where}

      ORDER BY p.tanggal DESC
    `;

    const rows = await q( sql, params );

    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      margin: 20,
      size: 'A4',
      layout: 'landscape'
    });

    // =============================
    // HEADER RESPONSE
    // =============================
    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="laporan-pembelian-${start}-${end}.pdf"`
    );

    doc.pipe(res);

    // =============================
    // CONFIG
    // =============================
    const pageWidth = doc.page.width;
    const margin = 30;

    let y = 120;

    // Lebar kolom
    const col = {
      no: 30,
      customer: 50,
      produk: 220,
      jumlah: 20,
      modal: 80,
      harga: 80,
      // total: 85,
      profit: 75,
      status: 50,
      ket: 60,
      tanggal: 105
    };

    // =============================
    // TITLE
    // =============================
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('LAPORAN PEMBELIAN', {
        align: 'center'
      });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Periode: ${start} s/d ${end}`,
        {
          align: 'center'
        }
      );

    y = 100;

    // =============================
    // DRAW HEADER TABLE
    // =============================
    function drawTableHeader() {

      doc
        .rect(
          margin,
          y,
          pageWidth - (margin * 2),
          28
        )
        .fill('#eeeeee');

      doc
        .fillColor('black')
        .fontSize(10)
        .font('Helvetica-Bold');

      let x = margin;

      const headers = [
        ['No', col.no],
        ['Seller', col.customer],
        ['Produk', col.produk],
        ['Qty', col.jumlah],
        ['Modal', col.modal],
        ['Harga', col.harga],
        // ['Total', col.total],
        ['Profit', col.profit],
        ['Status', col.status],
        ['Keterangan', col.ket],
        ['Tanggal', col.tanggal]
      ];

      headers.forEach(([label, width]) => {

        doc.text(
          label,
          x,
          y + 8,
          {
            width,
            align: 'center'
          }
        );

        x += width;

      });

      y += 28;
    }

    drawTableHeader();

    // =============================
    // DATA KOSONG
    // =============================
    if (!rows.length) {

      doc
        .font('Helvetica')
        .fontSize(11)
        .text(
          'Tidak ada data.',
          margin,
          y + 20
        );

      doc.end();
      return;
    }

    // =============================
    // FORMAT RUPIAH
    // =============================
    function rupiah(angka) {

      return 'Rp ' +
        Number(angka || 0)
          .toLocaleString('id-ID');
    }

    let grandTotal = 0;
    let grandProfit = 0;

    // =============================
    // LOOP DATA
    // =============================
    rows.forEach((r, index) => {

      // PAGE BREAK
      if (y > 500) {

        doc.addPage({
          layout: 'landscape'
        });

        y = 40;

        drawTableHeader();
      }

      let statusText = 'Pending';

        if (Number(r.status) === 1) {

          statusText = 'Selesai';

        }
        else if (
          Number(r.status) === 3
        ) {

          statusText = 'Cancel';

        }

      const tanggal =
        r.tanggal
          ? new Date(r.tanggal)
              .toLocaleString('id-ID')
          : '-';

      // =============================
      // HITUNG
      // =============================
      const hargaModal =
        Number(r.harga_modal || 0);

      const hargaJual =
        Number(r.harga || 0);

      const qty =
        Number(r.jumlah || 0);

      const totalHarga =
        hargaJual * qty;

      const keuntungan =
        totalHarga - (hargaModal * qty);

      grandTotal += totalHarga;
      grandProfit += keuntungan;

      // =============================
      // TINGGI ROW
      // =============================
      const rowHeight = 55;
      const textY = y + 18;

      // BORDER
      doc
        .rect(
          margin,
          y,
          pageWidth - (margin * 2),
          rowHeight
        )
        .stroke('#cccccc');

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('black');

      let x = margin;

      // =============================
      // NO
      // =============================
      doc.text(
        String(index + 1),
        x,
        textY,
        {
          width: col.no,
          align: 'center'
        }
      );

      x += col.no;

      // =============================
      // SELLER
      // =============================
      doc.text(
        r.nama_seller || '-',
        x,
        textY,
        {
          width: col.customer,
          align: 'center'
        }
      );

      x += col.customer;

      // =============================
      // PRODUK
      // =============================
      const produkNama =
        (r.produk_nama || '-')
          .replace(/\s+/g, ' ')
          .trim();

      doc.text(
        produkNama,
        x + 5,
        y + 10,
        {
          width: col.produk - 10,
          height: 35,
          align: 'center',
          ellipsis: true,
          lineBreak: true
        }
      );

      x += col.produk;

      // =============================
      // QTY
      // =============================
      doc.text(
        String(qty),
        x,
        textY,
        {
          width: col.jumlah,
          align: 'center'
        }
      );

      x += col.jumlah;

      // =============================
      // MODAL
      // =============================
      doc.text(
        rupiah(hargaModal),
        x,
        textY,
        {
          width: col.modal,
          align: 'center'
        }
      );

      x += col.modal;

      // =============================
      // HARGA
      // =============================
      doc.text(
        rupiah(hargaJual),
        x,
        textY,
        {
          width: col.harga,
          align: 'center'
        }
      );

      x += col.harga;

      // // =============================
      // // TOTAL
      // // =============================
      // doc.text(
      //   rupiah(totalHarga),
      //   x,
      //   textY,
      //   {
      //     width: col.total,
      //     align: 'center'
      //   }
      // );

      // x += col.total;

      // =============================
      // PROFIT
      // =============================
      doc.fillColor(
        keuntungan >= 0
          ? 'green'
          : 'red'
      );

      doc.text(
        rupiah(keuntungan),
        x,
        textY,
        {
          width: col.profit,
          align: 'center'
        }
      );

      x += col.profit;

      // =============================
      // STATUS
      // =============================
      if (statusText === 'Selesai') {

        doc.fillColor('green');

      }
      else if (
        statusText === 'Cancel'
      ) {

        doc.fillColor('orange');

      }
      else {

        doc.fillColor('red');

      }

      doc.text(
        statusText,
        x,
        textY,
        {
          width: col.status,
          align: 'center'
        }
      );

      x += col.status;

      // =============================
      // KETERANGAN
      // =============================
      doc.fillColor('black');

      doc.text(
        r.keterangan || '-',
        x,
        textY,
        {
          width: col.ket,
          align: 'center'
        }
      );

      x += col.ket;

      // =============================
      // TANGGAL
      // =============================
      doc.text(
        tanggal,
        x,
        textY,
        {
          width: col.tanggal,
          align: 'center'
        }
      );

      y += rowHeight;
    });

    // =============================
    // FOOTER
    // =============================
    y += 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('black')
      .text(
        `GRAND TOTAL : ${rupiah(grandTotal)}`,
        20,
        y,
        {
          align: 'right'
        }
      );

    y += 18;

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('green')
      .text(
        `TOTAL PROFIT : ${rupiah(grandProfit)}`,
        20,
        y,
        {
          align: 'right'
        }
      );

    y += 20;

    doc
      .fontSize(8)
      .fillColor('gray')
      .text(
        `Generated: ${new Date().toLocaleString('id-ID')}`,
        margin,
        y,
        {
          align: 'right'
        }
      );

    doc.end();

  } catch (err) {

    console.error(
      'EXPORT PDF ERROR:',
      err
    );

    if (!res.headersSent) {

      res
        .status(500)
        .send('Gagal generate PDF');
    }
  }
});

app.post('/produk', upload.array('gambar', 6), async (req, res) => {

  try {

    const nama = (req.body.nama || '').trim();

    const keterangan = req.body.keterangan
      ? req.body.keterangan.trim()
      : null;

    const brand_id = req.body.brand_id
      ? parseInt(req.body.brand_id)
      : null;

    const harga_modal =
      parseFloat(req.body.harga_modal) || 0;

    const harga_jual =
      parseFloat(req.body.harga_jual) || 0;

    const posisi = req.body.posisi
      ? req.body.posisi.trim()
      : null;

    const stokAwal = parseInt(
      req.body.stok_awal || 0
    );

    // ======================================
    // GENERATE KODE PRODUK OTOMATIS
    // ======================================

    const lastProduk = await q(`
      SELECT kode_produk
      FROM produk
      ORDER BY CAST(
        REPLACE(
          UPPER(kode_produk),
          'P',
          ''
        ) AS UNSIGNED
      ) DESC
      LIMIT 1
    `);

    let kode_produk = 'P1';

    if (lastProduk.length > 0) {

      const lastKode =
        lastProduk[0].kode_produk || 'P0';

      const nomor = parseInt(
        lastKode.replace(/[^0-9]/g, '')
      ) || 0;

      kode_produk = 'P' + (nomor + 1);

    }

    // ======================================
    // GAMBAR
    // ======================================

    let gambar = '';

    if (req.files && req.files.length > 0) {

      gambar = req.files
        .map(f => f.filename)
        .join(',');

    }

    // ======================================
    // INSERT PRODUK
    // ======================================

    const result = await q(`
      INSERT INTO produk (
        nama,
        kode_produk,
        keterangan,
        gambar,
        brand_id,
        posisi,
        harga_modal,
        harga_jual
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nama,
      kode_produk,
      keterangan,
      gambar,
      brand_id,
      posisi,
      harga_modal,
      harga_jual
    ]);

    const produkId = result.insertId;

    // ======================================
    // INSERT STOK JAKARTA
    // ======================================

    await q(`
      INSERT INTO stock_cabang (
        produk_id,
        cabang_id,
        jumlah
      )
      VALUES (?, ?, ?)
    `, [
      produkId,
      1,
      stokAwal
    ]);

    res.redirect('/produk');

  } catch (err) {

    console.error('POST /produk ERROR:', err);

    res.status(500).send(
      'Gagal tambah produk'
    );

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

const XLSX = require('xlsx');
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const uploadExcel = multer({
  storage: excelStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.post('/produk/import-excel', uploadExcel.single('excel'), async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).send('File wajib diupload');
      }

      const workbook = XLSX.readFile(req.file.path);

      const sheetName = workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];

      const data = XLSX.utils.sheet_to_json(sheet);

      for (const row of data) {

        const kode_produk = row.kode_produk
          ? String(row.kode_produk).trim().toUpperCase()
          : null;

        const nama = row.nama
          ? String(row.nama).trim()
          : null;

        const stok = parseInt(row.stok || 0);

        const keterangan = row.keterangan
          ? String(row.keterangan).trim()
          : null;

        const posisi = row.posisi
          ? String(row.posisi).trim()
          : null;

        if (!nama) continue;

        // cek produk existing
        const existing = await q(
          'SELECT id FROM produk WHERE kode_produk = ? LIMIT 1',
          [kode_produk]
        );

        if (existing.length > 0) {

          const produkId = existing[0].id;

          // update stok
          await q(`
            INSERT INTO stock_cabang (produk_id, cabang_id, jumlah)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
            jumlah = jumlah + VALUES(jumlah)
          `, [produkId, stok]);

        } else {

          // insert produk dulu
const ins = await q(`
  INSERT INTO produk
  (
    nama,
    gambar,
    keterangan
  )
  VALUES (?, ?, ?)
`, [
  nama,
  '',
  keterangan
]);

const produkId = ins.insertId;

// update kode produk setelah insert
await q(`
  UPDATE produk
  SET kode_produk = ?
  WHERE id = ?
`, [
  nextKode,
  produkId
]);

console.log('KODE PRODUK:', nextKode);
        }
      }

      return res.redirect('/produk');

    } catch (err) {

      console.error(err);

      return res.status(500).send('Gagal import excel');
    }
  }
);

const mammoth = require('mammoth');
const uploadWord = multer({
  storage: excelStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.post('/produk/import-word', uploadWord.single('word'), async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).send('File wajib diupload');
      }

      // baca word
      const result = await mammoth.extractRawText({
        path: req.file.path
      });

      const text = result.value;

      const lines = text
        .split('\n')
        .map(v => v.trim())
        .filter(v => v);

      // =========================
      // MULAI LOOP
      // =========================

      // ======================================
      // AMBIL NOMOR TERAKHIR
      // ======================================

      const lastProduk = await q(`
        SELECT kode_produk
        FROM produk
        WHERE kode_produk REGEXP '^P[0-9]+$'
        ORDER BY CAST(REPLACE(kode_produk,'P','') AS UNSIGNED) DESC
        LIMIT 1
      `);

      let nomor = 1;

      if (lastProduk.length > 0) {

        nomor =
          parseInt(
            lastProduk[0].kode_produk.replace('P', '')
          ) + 1;

      }

      let berhasil = 0;

      for (const line of lines) {

        console.log('LINE:', line);

        if (line.length < 3) {
          continue;
        }

        // batasi panjang nama
        let namaProduk = line.trim();

        if (namaProduk.length > 95) {
          namaProduk = namaProduk.substring(0, 95);
        }

        // kode produk otomatis
        const kodeProduk = 'P' + nomor;

        // =========================
        // DETEKSI BRAND
        // =========================

        let brandName = 'RANDOM';

        const upperNama = namaProduk.toUpperCase();

        if (upperNama.includes('ASUS')) {
          brandName = 'ASUS';
        }
        else if (upperNama.includes('ACER')) {
          brandName = 'ACER';
        }
        else if (upperNama.includes('ADVAN')) {
          brandName = 'ADVAN';
        }
        else if (upperNama.includes('AXIOO')) {
          brandName = 'AXIOO';
        }
        else if (upperNama.includes('DELL')) {
          brandName = 'DELL';
        }
        else if (upperNama.includes('HP')) {
          brandName = 'HP';
        }
        else if (upperNama.includes('LENOVO')) {
          brandName = 'LENOVO';
        }
        else if (upperNama.includes('SAMSUNG')) {
          brandName = 'SAMSUNG';
        }
        else if (upperNama.includes('ZYREX')) {
          brandName = 'ZYREX';
        }

        // cari brand_id
        const brandResult = await q(
          'SELECT id FROM brand WHERE UPPER(nama) = ? LIMIT 1',
          [brandName]
        );

        let brandId = null;

        if (brandResult.length > 0) {
          brandId = brandResult[0].id;
        }

        // cek duplikat
        const cek = await q(
          'SELECT id FROM produk WHERE kode_produk = ? LIMIT 1',
          [kodeProduk]
        );

        if (cek.length > 0) {
          console.log('SKIP:', kodeProduk);
          nomor++;
          continue;
        }

        // insert produk
        const ins = await q(`
          INSERT INTO produk
          (
            kode_produk,
            nama,
            gambar,
            keterangan,
            brand_id
          )
          VALUES (?, ?, ?, ?, ?)
        `, [
          kodeProduk,
          namaProduk,
          '',
          '',
          brandId
        ]);

        // stok otomatis
        await q(`
          INSERT INTO stock_cabang
          (
            produk_id,
            cabang_id,
            jumlah
          )
          VALUES (?, ?, ?)
        `, [
          ins.insertId,
          1, // Jakarta
          1
        ]);

        console.log(
          'BERHASIL:',
          kodeProduk,
          namaProduk,
          'BRAND:',
          brandName
        );

        nomor++;
        berhasil++;
      }

      console.log('TOTAL BERHASIL:', berhasil);

      return res.redirect('/produk');

    } catch (err) {

      console.error(err);

      return res.status(500).send('Gagal import word');
    }
  }
);

// ======================================================
// HALAMAN STOK SEMARANG
// ======================================================
app.get('/stok/semarang', async (req, res) => {

  try {

    const sql = `
      SELECT
        p.id,
        p.kode_produk,
        p.nama,
        p.gambar,
        p.keterangan,
        p.posisi,
        p.harga_modal,
        p.harga_jual,

        COALESCE(sc.jumlah,0) AS stok_semarang

      FROM produk p

      LEFT JOIN stock_cabang sc
        ON sc.produk_id = p.id
        AND sc.cabang_id = 2

      ORDER BY
        CASE WHEN COALESCE(sc.jumlah,0) <= 0 THEN 1 ELSE 0 END,
        CAST(REPLACE(UPPER(p.kode_produk), 'P', '') AS UNSIGNED) ASC
    `;

    const rows = await q(sql);

    const produk = rows.map(p => ({
      ...p,
      gambar_list: p.gambar
        ? p.gambar.split(',')
        : []
    }));

    res.render('stok_semarang', {
      produk
    });

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal load stok semarang'
    );

  }

});

// ========================================
// TAMBAH PRODUK KHUSUS SEMARANG
// ========================================
app.post('/stok-semarang/tambah', async (req, res) => {

  try {

    const {
      kode_produk,
      nama,
      stok,
      posisi
    } = req.body;

    // =========================
    // INSERT PRODUK
    // =========================
    const result = await q(`
      INSERT INTO produk (
        kode_produk,
        nama,
        posisi
      )
      VALUES (?, ?, ?)
    `, [
      kode_produk,
      nama,
      posisi || null
    ]);

    const produkId = result.insertId;

    // =========================
    // INSERT STOK SEMARANG
    // =========================
    await q(`
      INSERT INTO stock_cabang (
        produk_id,
        cabang_id,
        jumlah
      )
      VALUES (?, ?, ?)
    `, [
      produkId,
      2,
      stok
    ]);

    res.redirect('/stok/semarang');

  } catch (err) {

    console.error(err);
    res.status(500).send('Gagal tambah produk semarang');

  }

});

app.get('/stok-semarang/lihat/:id', async (req,res)=>{

  try{

    const rows = await q(`
      SELECT
        p.*,
        COALESCE(sc.jumlah,0) AS stok_semarang
      FROM produk p
      LEFT JOIN stock_cabang sc
        ON sc.produk_id = p.id
        AND sc.cabang_id = 2
      WHERE p.id=?
    `,[req.params.id]);

    if(!rows.length){
      return res.send('Produk tidak ditemukan');
    }

    res.render('detail_produk_semarang',{
      produk: rows[0]
    });

  }catch(err){

    console.error(err);
    res.status(500).send(err.message);

  }

});

app.get('/stok-semarang/edit/:id', async (req,res)=>{

  try{

    const rows = await q(`
      SELECT
        p.*,
        COALESCE(sc.jumlah,0) AS stok_semarang
      FROM produk p
      LEFT JOIN stock_cabang sc
        ON sc.produk_id=p.id
        AND sc.cabang_id=2
      WHERE p.id=?
    `,[req.params.id]);

    res.render('edit_produk_semarang',{
      produk: rows[0]
    });

  }catch(err){

    console.error(err);
    res.status(500).send(err.message);

  }

});

app.post('/stok-semarang/edit/:id', async (req,res)=>{

  try{

    const {
      kode_produk,
      nama,
      posisi,
      keterangan,
      stok_semarang
    } = req.body;

    await q(`
      UPDATE produk
      SET
        kode_produk=?,
        nama=?,
        posisi=?,
        keterangan=?
      WHERE id=?
    `,[
      kode_produk,
      nama,
      posisi,
      keterangan,
      req.params.id
    ]);

    await q(`
      UPDATE stock_cabang
      SET jumlah=?
      WHERE produk_id=?
      AND cabang_id=2
    `,[
      stok_semarang,
      req.params.id
    ]);

    res.redirect('/stok/semarang');

  }catch(err){

    console.error(err);
    res.status(500).send(err.message);

  }

});

app.post('/stok-semarang/hapus/:id', async (req,res)=>{

  try{

    await q(`
      DELETE FROM stock_cabang
      WHERE produk_id=?
      AND cabang_id=2
    `,[req.params.id]);

    res.redirect('/stok/semarang');

  }catch(err){

    console.error(err);
    res.status(500).send(err.message);

  }

});

// ======================================================
// EXPORT PDF STOK SEMARANG
// ======================================================

app.get('/stok/semarang/export-pdf', async (req, res) => {

  try {

    const rows = await q(`
      SELECT
        p.kode_produk,
        p.nama,
        p.posisi,
        p.keterangan,
        p.harga_modal,
        p.harga_jual,

        COALESCE(sc.jumlah,0) AS stok_semarang,
        COALESCE(sj.jumlah,0) AS stok_jakarta

      FROM produk p

      LEFT JOIN stock_cabang sc
        ON sc.produk_id = p.id
        AND sc.cabang_id = 2

      LEFT JOIN stock_cabang sj
        ON sj.produk_id = p.id
        AND sj.cabang_id = 1

      WHERE COALESCE(sc.jumlah,0) > 0

      ORDER BY
        CAST(
          REPLACE(
            UPPER(p.kode_produk),
            'P',
            ''
          ) AS UNSIGNED
        ) ASC
    `);

    const doc = new PDFDocument({
      margin: 20,
      size: 'A4',
      layout: 'landscape'
    });

    // =================================
    // NAMA FILE DOWNLOAD
    // =================================

    const now = new Date();

    const tanggal =
      String(now.getDate()).padStart(2, '0') +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      now.getFullYear();

    const jam =
      String(now.getHours()).padStart(2, '0') +
      '.' +
      String(now.getMinutes()).padStart(2, '0');

    const filename =
      `Stok Semarang ${tanggal} ${jam}.pdf`;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    doc.pipe(res);

    // =================================
    // HEADER
    // =================================

    doc
      .fontSize(20)
      .text(
        'LAPORAN STOK CABANG SEMARANG',
        {
          align: 'center'
        }
      );

    doc.moveDown();

    doc
      .fontSize(10)
      .text(
        'Tanggal Cetak : ' +
        new Date().toLocaleString('id-ID')
      );

    doc.moveDown();

    // =================================
    // HEADER TABEL
    // =================================

    let y = doc.y;

    const col = {
      no: 20,
      kode: 60,
      produk: 130,
      stok: 380,
      keterangan: 440,
      hargaModal: 550,
      hargaJual: 660
    };

    function drawHeader() {

      doc.font('Helvetica-Bold');
      doc.fontSize(10);

      doc.text('No', col.no, y);
      doc.text('Kode', col.kode, y);
      doc.text('Produk', col.produk, y);
      doc.text('Stok', col.stok, y);
      doc.text('Keterangan', col.keterangan, y);

      doc.text(
        'Harga Modal',
        col.hargaModal,
        y,
        {
          width: 90,
          align: 'right'
        }
      );

      doc.text(
        'Harga Jual',
        col.hargaJual,
        y,
        {
          width: 90,
          align: 'right'
        }
      );

      y += 20;

      doc.moveTo(20, y)
        .lineTo(820, y)
        .strokeColor('#000')
        .stroke();

      y += 8;

      doc.font('Helvetica');
    }

    drawHeader();

    // =================================
    // DATA
    // =================================

    let totalModal = 0;
    let totalJual = 0;
    let totalUnit = 0;

    rows.forEach((item, index) => {

      const stok =
      Number(item.stok_semarang || 0);

    totalUnit += stok;

      const modal =
        Number(item.harga_modal || 0);

      const jual =
        Number(item.harga_jual || 0);

      const nilaiModal =
        stok * modal;

      const nilaiJual =
        stok * jual;

      totalModal += nilaiModal;
      totalJual += nilaiJual;

      // hitung tinggi teks nama produk
      const tinggiProduk = doc.heightOfString(
        item.nama || '-',
        {
          width: 230
        }
      );

      const tinggiKeterangan = doc.heightOfString(
        item.keterangan || '-',
        {
          width: 200
        }
      );

      const rowHeight = Math.max(
        tinggiProduk,
        tinggiKeterangan,
        18
      ) + 10;

      // pindah halaman jika hampir habis
      if (y + rowHeight > 540) {

        doc.addPage();

        y = 40;

        drawHeader();

      }

      doc.text(
        index + 1,
        col.no,
        y
      );

      doc.text(
        item.kode_produk || '-',
        col.kode,
        y
      );

      doc.text(
        item.nama || '-',
        col.produk,
        y,
        {
          width: 220
        }
      );

      doc.text(
        stok.toString(),
        col.stok,
        y
      );

      doc.text(
        item.keterangan || '-',
        col.keterangan,
        y,
        {
          width: 200
        }
      );

      // doc.text(
      //   'Rp ' +
      //   modal.toLocaleString('id-ID'),
      //   col.modal,
      //   y
      // );

      // doc.text(
      //   'Rp ' +
      //   jual.toLocaleString('id-ID'),
      //   col.jual,
      //   y
      // );

      doc.text(
        'Rp ' + modal.toLocaleString('id-ID'),
        col.hargaModal,
        y,
        {
          width: 90,
          align: 'right'
        }
      );

      doc.text(
        'Rp ' + jual.toLocaleString('id-ID'),
        col.hargaJual,
        y,
        {
          width: 90,
          align: 'right'
        }
      );

      // garis bawah tiap row
      doc.moveTo(20, y + rowHeight - 3)
         .lineTo(820, y + rowHeight - 3)
         .strokeColor('#dddddd')
         .stroke();

      y += rowHeight;

    });

    // =================================
    // TOTAL
    // =================================

    const footerY = y + 20;

    // garis pemisah
    doc.moveTo(20, footerY)
      .lineTo(820, footerY)
      .strokeColor('#000')
      .stroke();

    // reset posisi ke kiri
    let summaryY = footerY + 15;

    doc.font('Helvetica-Bold');
    doc.fontSize(11);

    doc.text(
      `TOTAL JENIS PRODUK : ${rows.length} Produk`,
      20,
      summaryY
    );

    summaryY += 25;

    doc.text(
      `TOTAL UNIT STOK SEMARANG : ${totalUnit} Unit`,
      20,
      summaryY
    );

    summaryY += 25;

    doc.text(
      `Tanggal Cetak : ${new Date().toLocaleString('id-ID')}`,
      20,
      summaryY
    );

    // doc.font('Helvetica-Bold');
    // doc.fontSize(11);

    // doc.text(
    //   'TOTAL NILAI MODAL STOK : Rp ' +
    //   totalModal.toLocaleString('id-ID')
    // );

    // doc.moveDown();

    // doc.text(
    //   'TOTAL NILAI JUAL STOK : Rp ' +
    //   totalJual.toLocaleString('id-ID')
    // );

    // doc.moveDown();

    // doc.text(
    //   'POTENSI LABA : Rp ' +
    //   (
    //     totalJual - totalModal
    //   ).toLocaleString('id-ID')
    // );

    // =================================
    // TANDA TANGAN 4 KOLOM
    // =================================

    // const ttdY = footerY + 120;

    // doc.font('Helvetica');

    // // posisi kolom
    // const col1 = 360; // Mengetahui
    // const col2 = 500; // Penerima
    // const col3 = 640; // Pengirim
    // const col4 = 760; // Kurir

    // // Judul
    // doc.text('Mengetahui,', col1, ttdY);
    // doc.text('Penerima,', col2, ttdY);
    // doc.text('Pengirim,', col3, ttdY);
    // doc.text('Kurir,', col4, ttdY);

    // // ruang tanda tangan
    // const namaY = ttdY + 70;

    // // Nama
    // doc.text('(Deny Irawan)', col1 - 10, namaY);

    // doc.text(
    //   '(....................)',
    //   col2 - 15,
    //   namaY
    // );

    // doc.text(
    //   '(Tian Saputra)',
    //   col3 - 10,
    //   namaY
    // );

    // doc.text(
    //   '(....................)',
    //   col4 - 15,
    //   namaY
    // );

    doc.end();

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal export PDF'
    );

  }

});

// ======================================================
// HALAMAN STOK JAKARTA
// ======================================================
app.get('/stok/jakarta', async (req, res) => {

  try {

    const sql = `
    SELECT
      p.id,
      p.kode_produk,
      p.nama,
      p.gambar,
      p.keterangan,
      p.posisi,
      p.harga_modal,

      COALESCE(jkt.jumlah,0) AS stok_jakarta,
      COALESCE(smg.jumlah,0) AS keluar_ke_semarang

    FROM produk p

    LEFT JOIN stock_cabang jkt
      ON jkt.produk_id = p.id
      AND jkt.cabang_id = 1

    LEFT JOIN stock_cabang smg
      ON smg.produk_id = p.id
      AND smg.cabang_id = 2

    ORDER BY
      CASE
        WHEN COALESCE(jkt.jumlah,0) > 0 THEN 0
        ELSE 1
      END,

      CAST(
        REPLACE(
          UPPER(p.kode_produk),
          'P',
          ''
        ) AS UNSIGNED
      ) ASC
    `;

    const rows = await q(sql);

    const produk = rows.map(p => ({

      ...p,

      gambar_list: p.gambar
        ? p.gambar.split(',')
        : [],

      keluar_ke_semarang:
        Number(p.keluar_ke_semarang || 0),

      sisa_stok:
        Number(p.stok_jakarta || 0)

    }));

    res.render('stok_jakarta', {
      produk
    });

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal load stok jakarta'
    );

  }

});

// ======================================================
// TRANSFER STOCK ANTAR CABANG
// ======================================================
app.post('/transfer-stock', async (req, res) => {

  try {

    let {
      produk_id,
      dari_cabang,
      ke_cabang,
      jumlah
    } = req.body;

    produk_id = Number(produk_id);
    dari_cabang = Number(dari_cabang);
    ke_cabang = Number(ke_cabang);
    jumlah = Number(jumlah);

    // =========================
    // VALIDASI
    // =========================
    if (!produk_id || !dari_cabang || !ke_cabang || !jumlah) {

      return res.send(
        'Data transfer tidak lengkap'
      );

    }

    // =========================
    // CEK STOK ASAL
    // =========================
    const stokAsal = await q(`
      SELECT *
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = ?
    `, [
      produk_id,
      dari_cabang
    ]);

    if (!stokAsal.length) {

      return res.send(
        'Stok asal tidak ditemukan'
      );

    }

    if (stokAsal[0].jumlah < jumlah) {

      return res.send(
        'Stok tidak cukup'
      );

    }

    // =========================
    // KURANGI STOK ASAL
    // =========================
    await q(`
      UPDATE stock_cabang
      SET jumlah = jumlah - ?
      WHERE produk_id = ?
      AND cabang_id = ?
    `, [
      jumlah,
      produk_id,
      dari_cabang
    ]);

    // =========================
    // CEK STOK TUJUAN
    // =========================
    const stokTujuan = await q(`
      SELECT *
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = ?
    `, [
      produk_id,
      ke_cabang
    ]);

    // =========================
    // UPDATE / INSERT TUJUAN
    // =========================
    if (stokTujuan.length > 0) {

      await q(`
        UPDATE stock_cabang
        SET jumlah = jumlah + ?
        WHERE produk_id = ?
        AND cabang_id = ?
      `, [
        jumlah,
        produk_id,
        ke_cabang
      ]);

    } else {

      await q(`
        INSERT INTO stock_cabang (
          produk_id,
          cabang_id,
          jumlah
        )
        VALUES (?, ?, ?)
      `, [
        produk_id,
        ke_cabang,
        jumlah
      ]);

    }

    // =========================
    // SIMPAN HISTORI TRANSFER
    // =========================
    await q(`
      INSERT INTO transfer_stok (
        produk_id,
        dari_cabang,
        ke_cabang,
        jumlah
      )
      VALUES (?, ?, ?, ?)
    `, [
      produk_id,
      dari_cabang,
      ke_cabang,
      jumlah
    ]);

    res.redirect('/stok/semarang');

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Transfer gagal'
    );

  }

});

// ======================================================
// GET /produk 
// ======================================================
app.get('/produk', async (req, res) => {

  try {

    // === cek tabel brand ===
    const brandTableExists = (
      await q(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = 'brand'
      `)
    )[0].cnt > 0;

    let brandColumn = null;

    if (brandTableExists) {

      if (await columnExists('brand', 'name')) {
        brandColumn = 'name';
      }

      else if (await columnExists('brand', 'nama')) {
        brandColumn = 'nama';
      }

    }

    // =========================================
    // AMBIL STOK DARI stock_cabang
    // cabang_id = 1 (JAKARTA)
    // =========================================
    const sql = `
      SELECT
        p.*,

        COALESCE(sc.jumlah, 0) AS jumlah_stok,

        b.nama AS brand_name

      FROM produk p

      LEFT JOIN stock_cabang sc
        ON sc.produk_id = p.id
        AND sc.cabang_id = 1

      LEFT JOIN brand b
        ON b.id = p.brand_id

      ORDER BY

        CASE
          WHEN COALESCE(sc.jumlah, 0) > 0 THEN 0
          ELSE 1
        END,

        CAST(
          REPLACE(
            UPPER(p.kode_produk),
            'P',
            ''
          ) AS UNSIGNED
        ) ASC
    `;

    const results = await q(sql);

    const produk = results.map(item => ({

      ...item,

      gambar_list: item.gambar
        ? item.gambar.split(',')
        : [],

      brand_name: item.brand_name ?? null,

      posisi: item.posisi ?? null

    }));

    let brands = [];

    if (brandTableExists) {

      brands = await q(`
        SELECT
          id,
          ${brandColumn || 'nama'} AS name
        FROM brand
        ORDER BY ${brandColumn || 'nama'} ASC
      `);

    }

    res.render('produk', {
      produk,
      brands
    });

  } catch (err) {

    console.error('GET /produk error:', err);

    res.status(500).send(
      'Gagal mengambil data produk.'
    );

  }

});

// ---- GET /produk/:id (show) ----
app.get('/produk/:id', async (req, res) => {

  try {

    const id = parseInt(req.params.id, 10);

    if (!id) {
      return res
        .status(404)
        .send('Produk tidak ditemukan.');
    }

    // =========================================
    // CEK BRAND
    // =========================================

    const brandTableExists = (
      await q(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = 'brand'
      `)
    )[0].cnt > 0;

    let brandColumn = null;

    if (brandTableExists) {

      if (await columnExists('brand', 'name')) {
        brandColumn = 'name';
      }

      else if (
        await columnExists('brand', 'nama')
      ) {
        brandColumn = 'nama';
      }

    }

    // =========================================
    // QUERY PRODUK
    // =========================================

    const sql = `
      SELECT 
        p.*,

        COALESCE(s.jumlah, 0)
        AS jumlah_stok,

        b.nama AS brand_name

      FROM produk p

      LEFT JOIN stock_cabang s
        ON s.produk_id = p.id
        AND s.cabang_id = 1

      LEFT JOIN brand b
        ON b.id = p.brand_id

      WHERE p.id = ?

      LIMIT 1
    `;

    // INI YANG TADI HILANG
    const rows = await q(sql, [id]);

    if (!rows || rows.length === 0) {

      return res
        .status(404)
        .send('Produk tidak ditemukan.');

    }

    const p = rows[0];

    p.gambar_list = p.gambar
      ? p.gambar.split(',')
      : [];

    p.posisi = p.posisi ?? null;

    p.brand_name =
      p.brand_name ?? null;

    // =========================================
    // AMBIL STOK
    // =========================================

    const stokRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = 1
      LIMIT 1
    `, [id]);

    const stok =
      stokRows.length > 0
      ? stokRows[0].jumlah
      : 0;

    // =========================================
    // AMBIL BRANDS
    // =========================================

    let brands = [];

    if (brandTableExists) {

      brands = await q(`
        SELECT
          id,
          ${brandColumn || 'nama'}
          AS name
        FROM brand
        ORDER BY
          ${brandColumn || 'nama'} ASC
      `);

    }

    // =========================================
    // RENDER
    // =========================================

    res.render('produk_show', {
      p,
      stok,
      brands
    });

  } catch (err) {

    console.error(
      'GET /produk/:id error:',
      err
    );

    res
      .status(500)
      .send('Server error.');

  }

});

// ======================================================
// GET EDIT PRODUK
// ======================================================

app.get('/produk/:id/edit', async (req, res) => {

  try {

    const id = parseInt(req.params.id);

    if (!id) {

      return res
        .status(404)
        .send('Produk tidak ditemukan.');

    }

    // ======================================================
    // AMBIL PRODUK
    // ======================================================

    const pRows = await q(`
      SELECT *
      FROM produk
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (!pRows.length) {

      return res
        .status(404)
        .send('Produk tidak ditemukan.');

    }

    const p = pRows[0];

    p.gambar_list =
      p.gambar
        ? p.gambar.split(',')
        : [];

    // ======================================================
    // AMBIL BRAND
    // ======================================================

    let brands = [];

    try {

      const tbl = await q(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = 'brand'
      `);

      const brandTableExists =
        tbl[0].cnt > 0;

      if (brandTableExists) {

        let brandColumn = null;

        if (await columnExists('brand', 'name')) {

          brandColumn = 'name';

        } else if (
          await columnExists('brand', 'nama')
        ) {

          brandColumn = 'nama';

        }

        if (brandColumn) {

          brands = await q(`
            SELECT
              id,
              ${brandColumn} AS name
            FROM brand
            ORDER BY ${brandColumn} ASC
          `);

        }

      }

    } catch (e) {

      console.warn(
        'Gagal mengambil brand:',
        e.message
      );

    }

    // ======================================================
    // AMBIL STOK JAKARTA
    // ======================================================

    const jakartaRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = 1
      LIMIT 1
    `, [id]);

    // ======================================================
    // AMBIL STOK SEMARANG
    // ======================================================

    const semarangRows = await q(`
      SELECT jumlah
      FROM stock_cabang
      WHERE produk_id = ?
      AND cabang_id = 2
      LIMIT 1
    `, [id]);

    const stok_jakarta =
      jakartaRows.length > 0
        ? jakartaRows[0].jumlah
        : 0;

    const stok_semarang =
      semarangRows.length > 0
        ? semarangRows[0].jumlah
        : 0;

    // ======================================================
    // RENDER
    // ======================================================

    res.render('produk_edit', {

      p,
      brands,

      stok_jakarta,
      stok_semarang

    });

  } catch (err) {

    console.error(
      'GET /produk/:id/edit error:',
      err
    );

    res
      .status(500)
      .send('Server error.');

  }

});

// ==== HAPUS GAMBAR PRODUK ====
app.get('/produk/:id/hapus-gambar/:filename', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const filename = req.params.filename;

    if (!id || !filename) {
      return res.status(400).send('Data tidak valid');
    }

    // ambil gambar sekarang
    const rows = await q(
      'SELECT gambar FROM produk WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows.length) {
      return res.status(404).send('Produk tidak ditemukan');
    }

    let gambarList = rows[0].gambar
      ? rows[0].gambar.split(',')
      : [];

    // hapus gambar dari list
    gambarList = gambarList.filter(g => g !== filename);

    // update database
    await q(
      'UPDATE produk SET gambar = ? WHERE id = ?',
      [gambarList.join(','), id]
    );

    // hapus file fisik
    const filePath = path.join(__dirname, 'media', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.redirect('/produk/' + id + '/edit');

  } catch (err) {
    console.error('HAPUS GAMBAR ERROR:', err);
    res.status(500).send('Gagal hapus gambar');
  }
});

app.post('/produk/:id/delete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).send('ID tidak valid');

    // hapus stok dulu (opsional tapi disarankan)
    await q('DELETE FROM stock_cabang WHERE produk_id = ?', [id]);

    // hapus produk
    await q('DELETE FROM produk WHERE id = ?', [id]);

    res.redirect('/produk');
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).send('Gagal hapus produk');
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
// ======================================================
// UPDATE PRODUK
// ======================================================

app.post('/produk/:id', upload.array('gambar', 6), async (req, res) => {

    try {

      const id = parseInt(
        req.params.id,
        10
      );

      if (!id) {

        return res
          .status(404)
          .send('Produk tidak ditemukan.');

      }

      // ======================================================
      // FORM DATA
      // ======================================================

      const nama =
        (req.body.nama || '').trim();

      const kode_produk =
        req.body.kode_produk
          ? req.body.kode_produk
              .trim()
              .toUpperCase()
          : null;

      const keterangan =
        req.body.keterangan
          ? req.body.keterangan.trim()
          : null;

      const brand_id =
        req.body.brand_id
          ? (
              parseInt(
                req.body.brand_id,
                10
              ) || null
            )
          : null;

      const posisi =
        req.body.posisi
          ? (
              req.body.posisi.trim()
              || null
            )
          : null;

      const harga_modal =
        parseFloat(req.body.harga_modal) || 0;

      const harga_jual =
        parseFloat(req.body.harga_jual) || 0;

      // ======================================================
      // STOK CABANG
      // ======================================================

      const stok_jakarta =
        parseInt(
          req.body.stok_jakarta
        ) || 0;

      const stok_semarang =
        parseInt(
          req.body.stok_semarang
        ) || 0;

      if (!nama) {

        return res
          .status(400)
          .send(
            'Nama produk wajib diisi.'
          );

      }

      // ======================================================
      // AMBIL GAMBAR LAMA
      // ======================================================

      const curRows = await q(`
        SELECT gambar
        FROM produk
        WHERE id = ?
        LIMIT 1
      `, [id]);

      if (!curRows.length) {

        return res
          .status(404)
          .send('Produk tidak ditemukan.');

      }

      let currentGambar =
        curRows[0].gambar || '';

      // ======================================================
      // JIKA ADA UPLOAD GAMBAR BARU
      // ======================================================

      if (
        req.files &&
        req.files.length > 0
      ) {

        const newFiles =
          req.files
            .map(f => f.filename)
            .join(',');

        currentGambar =
          currentGambar
            ? (
                currentGambar
                +
                ','
                +
                newFiles
              )
            : newFiles;

      }

      // ======================================================
      // UPDATE PRODUK
      // ======================================================

      await q(`
        UPDATE produk
        SET

          nama = ?,
          kode_produk = ?,
          keterangan = ?,
          gambar = ?,
          brand_id = ?,
          posisi = ?,
          harga_modal = ?,
          harga_jual = ?

        WHERE id = ?
      `, [

        nama,
        kode_produk,
        keterangan,
        currentGambar,
        brand_id,
        posisi,
        harga_modal,
        harga_jual,
        id

      ]);

      // ======================================================
      // UPDATE STOK JAKARTA
      // cabang_id = 1
      // ======================================================

      await q(`
        INSERT INTO stock_cabang
        (
          produk_id,
          cabang_id,
          jumlah
        )

        VALUES (?, 1, ?)

        ON DUPLICATE KEY UPDATE

        jumlah = VALUES(jumlah)
      `, [

        id,
        stok_jakarta

      ]);

      // ======================================================
      // UPDATE STOK SEMARANG
      // cabang_id = 2
      // ======================================================

      await q(`
        INSERT INTO stock_cabang
        (
          produk_id,
          cabang_id,
          jumlah
        )

        VALUES (?, 2, ?)

        ON DUPLICATE KEY UPDATE

        jumlah = VALUES(jumlah)
      `, [

        id,
        stok_semarang

      ]);

      // ======================================================
      // REDIRECT
      // ======================================================

      return res.redirect(
        '/produk/' + id
      );

    } catch (err) {

      console.error(
        'POST /produk/:id error:',
        err
      );

      return res
        .status(500)
        .send(
          'Gagal memperbarui produk.'
        );

    }

  }
);

// ======================================================
// EXPORT PDF PRODUK
// ======================================================
app.get("/export/produk/pdf", async (req, res) => {

  try {

    const brandId = req.query.brand_id || null;

    // ======================================================
    // QUERY PRODUK + STOK CABANG
    // ======================================================
    let sql = `
      SELECT 
        p.*,

        COALESCE(jakarta.jumlah, 0) AS stok_jakarta,

        COALESCE(semarang.jumlah, 0) AS stok_semarang,

        (
          COALESCE(jakarta.jumlah, 0)
          +
          COALESCE(semarang.jumlah, 0)
        ) AS total_stok,

        COALESCE(
          b.nama,
          'Tanpa Brand'
        ) AS brand_name

      FROM produk p

      LEFT JOIN stock_cabang jakarta
        ON p.id = jakarta.produk_id
        AND jakarta.cabang_id = 1

      LEFT JOIN stock_cabang semarang
        ON p.id = semarang.produk_id
        AND semarang.cabang_id = 2

      LEFT JOIN brand b
        ON p.brand_id = b.id
    `;

    // ======================================================
    // FILTER BRAND
    // ======================================================
    if (brandId) {

      sql += `
        WHERE p.brand_id = ${parseInt(brandId)}
      `;

    }

    // ======================================================
    // SORTING
    // ======================================================
    sql += `
      ORDER BY

      CASE
        WHEN (
          COALESCE(jakarta.jumlah,0)
          +
          COALESCE(semarang.jumlah,0)
        ) > 0 THEN 0
        ELSE 1
      END,

      CAST(
        REPLACE(
          UPPER(p.kode_produk),
          'P',
          ''
        ) AS UNSIGNED
      ) ASC
    `;

    const rows = await q(sql);

    // ======================================================
    // PISAHKAN PRODUK
    // ======================================================
    const tersedia = rows.filter(p =>
      p.total_stok > 0
    );

    const sold = rows.filter(p =>
      p.total_stok <= 0
    );

    // ======================================================
    // PDF
    // ======================================================
    const doc = new PDFDocument({

      margin: 30,
      size: 'A4'

    });

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    // ======================================================
    // FORMAT NAMA FILE
    // ======================================================
    const now = new Date();

    const tanggal = now
      .toLocaleDateString('id-ID')
      .replace(/\//g, '-');

    const jam = now
      .toLocaleTimeString('id-ID')
      .replace(/:/g, '-');

    const namaFile =
      `DRCOM_Laporan_Produk_${tanggal}_${jam}.pdf`;

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${namaFile}"`
    );

    doc.pipe(res);

    // ======================================================
    // HEADER PDF
    // ======================================================
    doc
      .fontSize(22)
      .text(
        "LAPORAN PRODUK",
        {
          align: "center"
        }
      );

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `Tanggal Export: ${new Date().toLocaleString('id-ID')}`,
        {
          align: "center"
        }
      );

    doc.moveDown(2);

    // ======================================================
    // PRODUK TERSEDIA
    // ======================================================
    doc
      .fontSize(18)
      .fillColor('green')
      .text(
        "STOK TERSEDIA",
        {
          underline: true
        }
      );

    doc.moveDown();

    let nomorUrut = 1;

    tersedia.forEach(item => {

      let lokasi = [];

      if (item.stok_jakarta > 0) {

        lokasi.push(
          `Jakarta (${item.stok_jakarta})`
        );

      }

      if (item.stok_semarang > 0) {

        lokasi.push(
          `Semarang (${item.stok_semarang})`
        );

      }

      // ======================================================
      // NOMOR OTOMATIS RAPAT
      // ======================================================
      doc
        .fontSize(12)
        .fillColor('black')
        .text(
          `#P${nomorUrut} - ${item.nama}`
        );

      nomorUrut++;

      doc
        .fontSize(10)
        .text(
          `Brand : ${item.brand_name}`
        );

      doc.text(
        `Lokasi Stok : ${lokasi.join(', ')}`
      );

      doc.text(
        `Total Stok : ${item.total_stok}`
      );

      doc.moveDown();

      // garis
      doc
        .moveTo(30, doc.y)
        .lineTo(565, doc.y)
        .strokeColor('#cccccc')
        .stroke();

      doc.moveDown();

    });

    // ======================================================
    // PRODUK SOLD
    // ======================================================
    if (sold.length > 0) {

      doc.addPage();

      doc
        .fontSize(18)
        .fillColor('red')
        .text(
          "PRODUK SOLD OUT",
          {
            underline: true
          }
        );

      doc.moveDown();

      sold.forEach(item => {

        doc
          .fontSize(12)
          .fillColor('red')
          .text(
            `SOLD - ${item.nama}`
          );

        doc
          .fontSize(10)
          .fillColor('black')
          .text(
            `Brand : ${item.brand_name}`
          );

        doc.text(
          `Status : SOLD OUT`
        );


        doc.moveDown();

        doc
          .moveTo(30, doc.y)
          .lineTo(565, doc.y)
          .strokeColor('#dddddd')
          .stroke();

        doc.moveDown();

      });

    }

    // ======================================================
    // END PDF
    // ======================================================
    doc.end();

  } catch (err) {

    console.error(
      'EXPORT PDF ERROR:',
      err
    );

    res.status(500).send(
      "Gagal membuat PDF."
    );

  }

});


const bwipjs = require('bwip-js');

// QR Code berdasarkan brand
app.get('/qrcode/brand/:text', async (req, res) => {
  try {
    const text = req.params.text;

    const png = await bwipjs.toBuffer({
      bcid: 'qrcode',      // TIPE QR CODE
      text: text,          // isi QR
      scale: 5,            // ukuran pixel
      includetext: false   // QR biasanya tanpa tulisan
    });

    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal membuat QR Code');
  }
});

const ExcelJS = require('exceljs');

// EXPORT EXCEL PRODUK - HEADER PREMIUM + GROUP BY BRAND
app.get('/export/produk/excel', async (req, res) => {
  try {
    const brandId = req.query.brand_id || null;

    let sql = `
      SELECT 
        p.*, 
        IFNULL(s.jumlah, 0) AS stok,
        COALESCE(b.nama, 'Tanpa Brand') AS brand_name
      FROM produk p
      LEFT JOIN stock s ON p.id = s.produk_id
      LEFT JOIN brand b ON p.brand_id = b.id
    `;

    if (brandId) sql += ` WHERE p.brand_id = ${brandId}`;
    sql += ` ORDER BY brand_name ASC, p.nama ASC`;

    const rows = await q(sql);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Laporan Produk");

    // HEADER PREMIUM (Gold)
    sheet.columns = [
      { header: "Merk", key: "brand", width: 25 },
      { header: "Nama Produk", key: "nama", width: 30 },
      { header: "Stok", key: "stok", width: 10 },
      { header: "Posisi", key: "posisi", width: 20 },
      { header: "Keterangan", key: "keterangan", width: 30 }
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD4A017" } // gold premium
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let currentBrand = "";

    rows.forEach((p) => {
      if (p.brand_name !== currentBrand) {
        currentBrand = p.brand_name;

        const row = sheet.addRow({
          brand: currentBrand,
          nama: "",
          stok: "",
          posisi: "",
          keterangan: ""
        });

        row.font = { bold: true };
      }

      sheet.addRow({
        brand: "",
        nama: p.nama,
        stok: p.stok,
        posisi: p.posisi || "-",
        keterangan: p.keterangan || "-"
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="produk.xlsx"');

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal export Excel");
  }
});

const QRCode = require('qrcode');

app.get('/qr/brand/:name', async (req, res) => {
  try {
    const brandName = decodeURIComponent(req.params.name);
    const target = `${req.protocol}://${req.get('host')}/produk?brand=${encodeURIComponent(brandName)}`;

    res.setHeader('Content-Type', 'image/png');

    const pngBuffer = await QRCode.toBuffer(target, {
      type: 'png',
      width: 300,
      margin: 1
    });

    res.send(pngBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('QR error');
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
    const cabangId = parseInt(req.body.cabang_id);

    if (!pengirim)
        return res.status(400).send('Pengirim wajib diisi.');

    if (!cabangId)
        return res.status(400).send('Cabang wajib dipilih.');

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
          // ===============================
          // BUAT KODE PRODUK OTOMATIS
          // ===============================
          const last = await q(`
              SELECT kode_produk
              FROM produk
              ORDER BY
              CAST(REPLACE(UPPER(kode_produk),'P','') AS UNSIGNED) DESC
              LIMIT 1
          `);

          let nextKode = 'P1';

          if(last.length){

              const no =
                  parseInt(
                      last[0].kode_produk.replace(/P/i,'')
                  ) || 0;

              nextKode = 'P' + (no + 1);

          }

          const insP = await q(`
              INSERT INTO produk
              ( kode_produk, nama, gambar, keterangan ) VALUES (?, ?, ?, ?)`,[
              nextKode, raw, '', null
          ]);

          items[i].produk_id = insP.insertId;

          // ===============================
          // BUAT STOK CABANG
          // ===============================
          await q(`INSERT INTO stock_cabang ( produk_id, cabang_id, jumlah) VALUES (?,1,0), (?,2,0) ON DUPLICATE KEY UPDATE jumlah = jumlah`,[insP.insertId,insP.insertId]);
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

      // // update stock (insert or add)
      await q(`INSERT INTO stock_cabang(produk_id, cabang_id, jumlah) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)`,[it.produk_id,cabangId,it.jumlah]);
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

app.post('/barang-masuk/:id/edit', async (req, res) => {
    try {

        const id = parseInt(req.params.id);

        if (!id)
            return res.status(400).send("ID tidak valid.");

        const pengirim = (req.body.pengirim || "").trim();

        if (!pengirim)
            return res.status(400).send("Pengirim wajib diisi.");

        let incomingItems = parseItemsFromBody(req.body);

        if (!incomingItems.length)
            return res.status(400).send("Tidak ada item.");

        // ===========================
        // MULAI TRANSAKSI
        // ===========================

        await beginTransaction();

        const cabangId = 1;

        // ===========================
        // RESOLVE PRODUK
        // ===========================

        for (const item of incomingItems) {

            const raw = (item.produk_id ?? item.produk_nama ?? "").toString().trim();

            const maybeId = parseInt(raw);

            if (Number.isInteger(maybeId) && maybeId > 0) {

                item.produk_id = maybeId;

            } else {

                const cek = await q(`SELECT id FROM produk WHERE LOWER(nama)=LOWER(?) LIMIT 1`, [raw]);

                if (cek.length) {

                    item.produk_id = cek[0].id;

                } else {

                    const last = await q(`SELECT MAX(CAST(REPLACE(kode_produk,'P','') AS UNSIGNED)) no FROM produk`);
                    const kode = "P" + ((last[0].no || 0) + 1);
                    const ins = await q(`INSERT INTO produk (kode_produk, nama, gambar, keterangan) VALUES ( ?, ?, '', NULL)`, [ kode, raw ]);
                    item.produk_id = ins.insertId;

                    await q(`INSERT INTO stock_cabang (produk_id, cabang_id, jumlah) VALUES (?,1,0), (?,2,0)`,[ ins.insertId, ins.insertId ]);
                }
            }
            item.jumlah =
                parseInt(item.jumlah) || 0;

        }

        incomingItems = incomingItems.filter(i => i.produk_id && i.jumlah > 0 );

        // ===========================
        // DATA LAMA
        // ===========================
        const oldRows = await q(`SELECT produk_id, jumlah FROM barang_masuk_detail WHERE barang_masuk_id=? `,[id]);

        const oldMap = {};

        oldRows.forEach(r=>{ oldMap[r.produk_id] = (oldMap[r.produk_id]||0) + r.jumlah;
        });

        const newMap = {};

        incomingItems.forEach(i=>{ newMap[i.produk_id] = (newMap[i.produk_id]||0) + i.jumlah;
        });

        // ===========================
        // UPDATE HEADER
        // ===========================

        await q(`UPDATE barang_masuk SET pengirim=? WHERE id=?`,[ pengirim, id ]);

        // ===========================
        // HAPUS DETAIL LAMA
        // ===========================

        await q(`DELETE FROM barang_masuk_detail WHERE barang_masuk_id=?`,[id]);

        // ===========================
        // INSERT DETAIL BARU
        // ===========================

        for(const item of incomingItems){
            await q(`INSERT INTO barang_masuk_detail ( barang_masuk_id, produk_id, jumlah, keterangan ) VALUES ( ?,?,?,? ) `,[ id, item.produk_id, item.jumlah, item.keterangan || null ]);
        }

        // ===========================
        // UPDATE STOK
        // ===========================

        const semuaProduk = [ ...new Set([ ...Object.keys(oldMap), ...Object.keys(newMap)])
        ];
        for(const pid of semuaProduk){
            const lama = oldMap[pid] || 0;
            const baru = newMap[pid] || 0;
            const delta = baru - lama;
            if(delta==0) continue;
            if(delta>0){
                await q(`INSERT INTO stock_cabang ( produk_id, cabang_id, jumlah ) VALUES ( ?,?,? ) ON DUPLICATE KEY UPDATE jumlah = jumlah + VALUES(jumlah)`,[pid,cabangId,delta]);
            }else{
                const kurang =
                    Math.abs(delta);
                const stok = await q(`SELECT jumlah FROM stock_cabang WHERE produk_id=? AND cabang_id=? LIMIT 1`,[pid,cabangId]);
                const tersedia = stok.length ? parseInt(stok[0].jumlah) : 0;
                if(tersedia < kurang){
                    await rollback();
                    return res.status(400).send("Stok tidak cukup.");
                }
                await q(`UPDATE stock_cabang SET jumlah = jumlah - ? WHERE produk_id=? AND cabang_id=?`,[kurang,pid,cabangId
                ]);
            }
        }
        await commit();
        return res.redirect("/");
    } catch(err){
        console.error(err);
        try{
            await rollback();
        }catch(e){}
        return res.status(500).send("Gagal mengedit barang masuk.");
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

// Export PDF: Barang Masuk by date range (start & end in YYYY-MM-DD)
app.get('/export/barang-masuk/pdf', async (req, res) => {
  try {
    const start = req.query.start;
    const end = req.query.end;
    if (!start || !end) return res.status(400).send('Parameter start & end required (YYYY-MM-DD).');

    // simple validation YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).send('Format tanggal invalid. Gunakan YYYY-MM-DD.');
    }

    // Ambil semua transaksi barang_masuk pada rentang tanggal (inclusive)
    const rows = await q(`
      SELECT bm.id AS bm_id, bm.pengirim, bm.tanggal,
             bmd.id AS detail_id, bmd.produk_id, bmd.jumlah AS qty, bmd.keterangan, bmd.gambar,
             p.nama AS produk_nama
      FROM barang_masuk bm
      LEFT JOIN barang_masuk_detail bmd ON bm.id = bmd.barang_masuk_id
      LEFT JOIN produk p ON bmd.produk_id = p.id
      WHERE DATE(bm.tanggal) BETWEEN ? AND ?
      ORDER BY bm.tanggal ASC, bm.id ASC
    `, [start, end]);

    if (!rows || rows.length === 0) {
      return res.status(404).send('Tidak ada data pada rentang tanggal tersebut.');
    }

    // group by bm_id
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.bm_id]) grouped[r.bm_id] = { id: r.bm_id, pengirim: r.pengirim, tanggal: r.tanggal, items: [] };
      grouped[r.bm_id].items.push({
        detail_id: r.detail_id,
        produk_id: r.produk_id,
        nama: r.produk_nama,
        jumlah: r.qty,
        keterangan: r.keterangan,
        gambar: r.gambar
      });
    });

    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/Laporan-Barang-Masuk');
    res.setHeader('Content-Disposition', `filename="Laporan_Barang_Masuk_${start}_to_${end}.pdf`);
    doc.pipe(res);

    // page layout
    const margin = doc.page.margins.left || 40;
    const rightMargin = doc.page.margins.right || 40;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin - rightMargin;

    // column widths
    const colNoW = 30;
    const colQtyW = 60;
    const colProdukW = contentWidth - (colNoW + colQtyW);

    const lineGap = 4;
    const headerFont = 'Helvetica-Bold';
    const normalFont = 'Helvetica';

    function writeTitleAndPeriod() {
      doc.fontSize(16).font(headerFont).text('Laporan Barang Masuk', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font(normalFont).text(`Periode: ${start} — ${end}`, { align: 'center' });
      doc.moveDown(0.8);
    }

    function drawTxnHeader(tx) {
      // trans header
      const hdrLine = `Ref: ${tx.id}    Pengirim: ${tx.pengirim || '-'}    Tanggal: ${tx.tanggal ? new Date(tx.tanggal).toLocaleString('id-ID') : '-'}`;
      doc.fontSize(11).font(headerFont).text(hdrLine, margin, doc.y, { width: contentWidth });
      doc.moveDown(0.4);

      // column header row (fixed X)
      const y0 = doc.y;
      doc.fontSize(10).font(headerFont);
      doc.text('No', margin, y0, { width: colNoW, align: 'center' });
      doc.text('Produk', margin + colNoW, y0, { width: colProdukW, align: 'left' });
      doc.text('Jumlah', margin + colNoW + colProdukW, y0, { width: colQtyW, align: 'center' });
      doc.moveDown(0.6);
      doc.font(normalFont);
    }

    function needNewPageFor(heightNeeded, tx) {
      const bottomLimit = doc.page.height - (doc.page.margins.bottom || 40) - 40;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        // redraw title (optional, keep on top of subsequent pages)
        writeTitleAndPeriod();
        // re-draw current transaction header on new page
        drawTxnHeader(tx);
      }
    }

    // start
    writeTitleAndPeriod();

    for (const key of Object.keys(grouped)) {
      const tx = grouped[key];
      drawTxnHeader(tx);

      // iterate items with fixed column X positions and consistent row heights
      for (let idx = 0; idx < tx.items.length; idx++) {
        const it = tx.items[idx];

        // compute text heights
        doc.fontSize(10).font(normalFont);
        const produkNameH = doc.heightOfString(it.nama || ('ID ' + it.produk_id), { width: colProdukW });
        const ketH = it.keterangan ? doc.heightOfString('Keterangan: ' + it.keterangan, { width: colProdukW }) : 0;

        // compute image height if exists
        let imgH = 0;
        let imgPath = null;
        if (it.gambar) {
          const first = (it.gambar.split && it.gambar.split(',')[0]) || null;
          if (first) {
            const candidate = path.join(__dirname, 'media', first);
            if (fs.existsSync(candidate)) {
              imgPath = candidate;
              // we'll fit image to max width (120) and compute height ratio
              try {
                // try to estimate image size (PDFKit doesn't provide metadata easily) -> use fixed fit height
                imgH = 100; // reasonable thumbnail height
              } catch (e) {
                imgH = 0;
              }
            }
          }
        }

        const rowPadding = 26;
        const textBlockHeight = produkNameH + (ketH ? (ketH + 4) : 0);
        const rowHeight = Math.max(textBlockHeight, imgH, 12) + rowPadding;

        needNewPageFor(rowHeight + 20, tx);

        const y = doc.y;

        // No
        doc.fontSize(10).font(normalFont).text(String(idx + 1), margin, y, { width: colNoW, align: 'center' });

        // Produk (name + keterangan below)
        const prodX = margin + colNoW;
        let cursorY = y;
        doc.text(it.nama || ('ID ' + it.produk_id), prodX, cursorY, { width: colProdukW, align: 'left' });
        cursorY = doc.y;
        if (it.keterangan) {
          doc.fontSize(9).fillColor('gray').text('Keterangan: ' + it.keterangan, prodX, cursorY, { width: colProdukW, align: 'left' });
          doc.fillColor('black');
        }

        // if image exist, draw it below text (inside produk column)
        if (imgPath) {
          // place image at left of product column, below existing text
          const imgX = prodX;
          // ensure small gap
          const imgY = Math.max(y + textBlockHeight + 4, doc.y + 2);
          try {
            doc.image(imgPath, imgX, imgY, { fit: [100, imgH] });
          } catch (e) {
            // ignore image errors
          }
        }

        // Jumlah
        const qtyX = margin + colNoW + colProdukW;
        doc.fontSize(10).text(String(it.jumlah ?? '-'), qtyX, y, { width: colQtyW, align: 'center' });

        // advance y by rowHeight
        doc.y = y + rowHeight;
        doc.moveDown(0.2);
      }

      // after items, draw a separator and a bit of space
      doc.moveDown(0.4);
      doc.save();
      doc.lineWidth(0.5).strokeColor('#DDDDDD');
      doc.moveTo(margin, doc.y).lineTo(pageWidth - rightMargin, doc.y).stroke();
      doc.restore();
      doc.moveDown(0.8);
    }

    // footer
    doc.fontSize(9).fillColor('gray').text(`Generated: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error('/export/barang-masuk/pdf error (improved):', err);
    if (!res.headersSent) {
      res.status(500).send('Gagal generate PDF Barang Masuk.');
    }
  }
});


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

    // bagian after insert barang_keluar and barangKeluarId obtained
for (let i = 0; i < data.length; i++) {
  const it = data[i];

  // ambil file yang sesuai index i (jika ada)
  const file = files[i];
  const gambarFilename = file ? file.filename : null;

  // insert detail termasuk kolom gambar dan status = 2 (pending)
  await q(
    'INSERT INTO barang_keluar_detail (barang_keluar_id, produk_id, jumlah, keterangan, gambar, status) VALUES (?, ?, ?, ?, ?, ?)',
    [barangKeluarId, it.produk_id, it.jumlah, it.keterangan, gambarFilename, 2]
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

// POST /barang-keluar/detail/:detailId/complete
// Ubah status dari 2 (pending) -> 1 (selesai). Setelah selesai tidak bisa di-undo lewat route ini.
app.post('/barang-keluar/detail/:detailId/complete', async (req, res) => {
  try {
    const detailId = parseInt(req.params.detailId, 10);
    if (!detailId) return res.status(400).json({ ok: false, message: 'detailId invalid' });

    const rows = await q('SELECT id, produk_id, jumlah, status FROM barang_keluar_detail WHERE id = ? LIMIT 1', [detailId]);
    if (!rows || rows.length === 0) return res.status(404).json({ ok: false, message: 'Detail tidak ditemukan' });

    const det = rows[0];
    const curStatus = parseInt(det.status, 10) || 2;

    if (curStatus === 1) {
      // Sudah selesai — tidak boleh di-undo melalui endpoint ini
      return res.status(400).json({ ok: false, message: 'Sudah berstatus Selesai.' });
    }

    // lakukan update: set selesai + kembalikan stok
    await beginTransaction();
    await q('UPDATE stock SET jumlah = jumlah + ? WHERE produk_id = ?', [det.jumlah, det.produk_id]);
    await q('UPDATE barang_keluar_detail SET status = 1 WHERE id = ?', [detailId]);
    await commit();

    return res.json({ ok: true, newStatus: 1, message: 'Status diubah menjadi Selesai; stok dikembalikan.' });
  } catch (err) {
    console.error('POST /barang-keluar/detail/:detailId/complete error:', err);
    try { await rollback(); } catch(_) {}
    return res.status(500).json({ ok: false, message: 'Server error' });
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

// ===================== EXPORT PDF: BARANG KELUAR (rapih, with status column) =====================
app.get('/export/barang-keluar/pdf', async (req, res) => {
  try {
    const start = req.query.start;
    const end = req.query.end;
    if (!start || !end) return res.status(400).send('Parameter start & end required (YYYY-MM-DD).');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).send('Format tanggal invalid. Gunakan YYYY-MM-DD.');
    }

    const rows = await q(`
      SELECT bk.id AS bk_id, bk.tujuan, bk.tanggal,
             bkd.id AS detail_id, bkd.produk_id, bkd.jumlah AS qty, bkd.keterangan, bkd.gambar, bkd.status,
             p.nama AS produk_nama
      FROM barang_keluar bk
      LEFT JOIN barang_keluar_detail bkd ON bk.id = bkd.barang_keluar_id
      LEFT JOIN produk p ON bkd.produk_id = p.id
      WHERE DATE(bk.tanggal) BETWEEN ? AND ?
      ORDER BY bk.tanggal ASC, bk.id ASC
    `, [start, end]);

    if (!rows || rows.length === 0) {
      return res.status(404).send('Tidak ada data Barang Keluar pada rentang tanggal tersebut.');
    }

    // group by transaksi
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.bk_id]) grouped[r.bk_id] = { id: r.bk_id, tujuan: r.tujuan, tanggal: r.tanggal, items: [] };
      grouped[r.bk_id].items.push({
        detail_id: r.detail_id,
        produk_id: r.produk_id,
        nama: r.produk_nama,
        jumlah: r.qty,
        keterangan: r.keterangan,
        gambar: r.gambar,
        status: (typeof r.status !== 'undefined' && r.status !== null) ? Number(r.status) : 2
      });
    });

    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/Laporan-Barang-Keluar');
    res.setHeader('Content-Disposition', `filename="Laporan_Barang_Keluar_${start}_to_${end}.pdf`);
    doc.pipe(res);

    // page layout
    const margin = doc.page.margins.left || 40;
    const rightMargin = doc.page.margins.right || 40;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin - rightMargin;

    // column widths
    const colNoW = 30;
    const colQtyW = 60;
    const colStatusW = 80;
    const colProdukW = contentWidth - (colNoW + colQtyW + colStatusW);

    const lineGap = 4;
    const headerFont = 'Helvetica-Bold';
    const normalFont = 'Helvetica';

    function writeTitleAndPeriod() {
      doc.fontSize(16).font(headerFont).text('Laporan Barang Keluar', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font(normalFont).text(`Periode: ${start} — ${end}`, { align: 'center' });
      doc.moveDown(0.8);
    }

    function drawTxnHeader(tx) {
      // trans header
      const hdrLine = `Ref: ${tx.id}    Tujuan: ${tx.tujuan || '-'}    Tanggal: ${tx.tanggal ? new Date(tx.tanggal).toLocaleString('id-ID') : '-'}`;
      doc.fontSize(11).font(headerFont).text(hdrLine, margin, doc.y, { width: contentWidth });
      doc.moveDown(0.4);

      // column header row (fixed X)
      const y0 = doc.y;
      doc.fontSize(10).font(headerFont);
      doc.text('No', margin, y0, { width: colNoW, align: 'center' });
      doc.text('Produk', margin + colNoW, y0, { width: colProdukW, align: 'left' });
      doc.text('Jumlah', margin + colNoW + colProdukW, y0, { width: colQtyW, align: 'center' });
      doc.text('Status', margin + colNoW + colProdukW + colQtyW, y0, { width: colStatusW, align: 'center' });
      doc.moveDown(0.6);
      doc.font(normalFont);
    }

    function needNewPageFor(heightNeeded, tx) {
      const bottomLimit = doc.page.height - (doc.page.margins.bottom || 40) - 40;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        // redraw title (optional, keep on top of subsequent pages)
        writeTitleAndPeriod();
        // re-draw current transaction header on new page
        drawTxnHeader(tx);
      }
    }

    // start
    writeTitleAndPeriod();

    for (const key of Object.keys(grouped)) {
      const tx = grouped[key];
      drawTxnHeader(tx);

      // iterate items with fixed column X positions and consistent row heights
      for (let idx = 0; idx < tx.items.length; idx++) {
        const it = tx.items[idx];

        // compute text heights
        doc.fontSize(10).font(normalFont);
        const produkNameH = doc.heightOfString(it.nama || ('ID ' + it.produk_id), { width: colProdukW });
        const ketH = it.keterangan ? doc.heightOfString('Keterangan: ' + it.keterangan, { width: colProdukW }) : 0;

        // compute image height if exists
        let imgH = 0;
        let imgPath = null;
        if (it.gambar) {
          const first = (it.gambar.split && it.gambar.split(',')[0]) || null;
          if (first) {
            const candidate = path.join(__dirname, 'media', first);
            if (fs.existsSync(candidate)) {
              imgPath = candidate;
              // we'll fit image to max width (120) and compute height ratio
              try {
                // try to estimate image size (PDFKit doesn't provide metadata easily) -> use fixed fit height
                imgH = 100; // reasonable thumbnail height
              } catch (e) {
                imgH = 0;
              }
            }
          }
        }

        const rowPadding = 26;
        const textBlockHeight = produkNameH + (ketH ? (ketH + 4) : 0);
        const rowHeight = Math.max(textBlockHeight, imgH, 16) + rowPadding;

        needNewPageFor(rowHeight + 20, tx);

        const y = doc.y;

        // No
        doc.fontSize(10).font(normalFont).text(String(idx + 1), margin, y, { width: colNoW, align: 'center' });

        // Produk (name + keterangan below)
        const prodX = margin + colNoW;
        let cursorY = y;
        doc.text(it.nama || ('ID ' + it.produk_id), prodX, cursorY, { width: colProdukW, align: 'left' });
        cursorY = doc.y;
        if (it.keterangan) {
          doc.fontSize(9).fillColor('gray').text('Keterangan: ' + it.keterangan, prodX, cursorY, { width: colProdukW, align: 'left' });
          doc.fillColor('black');
        }

        // if image exist, draw it below text (inside produk column)
        if (imgPath) {
          // place image at left of product column, below existing text
          const imgX = prodX;
          // ensure small gap
          const imgY = Math.max(y + textBlockHeight + 4, doc.y + 2);
          try {
            doc.image(imgPath, imgX, imgY, { fit: [100, imgH] });
          } catch (e) {
            // ignore image errors
          }
        }

        // Jumlah
        const qtyX = margin + colNoW + colProdukW;
        doc.fontSize(10).text(String(it.jumlah ?? '-'), qtyX, y, { width: colQtyW, align: 'center' });

        // Status
        const statusX = margin + colNoW + colProdukW + colQtyW;
        const statusLabel = (it.status === 1) ? 'Selesai' : 'Pending';
        doc.text(statusLabel, statusX, y, { width: colStatusW, align: 'center' });

        // advance y by rowHeight
        doc.y = y + rowHeight;
        doc.moveDown(0.2);
      }

      // after items, draw a separator and a bit of space
      doc.moveDown(0.4);
      doc.save();
      doc.lineWidth(0.5).strokeColor('#DDDDDD');
      doc.moveTo(margin, doc.y).lineTo(pageWidth - rightMargin, doc.y).stroke();
      doc.restore();
      doc.moveDown(0.8);
    }

    // footer
    doc.fontSize(9).fillColor('gray').text(`Generated: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error('/export/barang-keluar/pdf error (improved):', err);
    if (!res.headersSent) {
      res.status(500).send('Gagal generate PDF Barang Keluar.');
    }
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
// ===================== EXPORT ALL HISTORIES (Pembelian + Barang Masuk + Barang Keluar) =====================
app.get('/export/all/pdf', async (req, res) => {
  try {
    const { start, end } = req.query;

    // helper validate date format if provided
    const hasRange = !!(start && end);
    if (hasRange) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return res.status(400).send('Format tanggal invalid. Gunakan YYYY-MM-DD untuk start & end.');
      }
    }

    // build WHERE clause (inclusive) if range given
    const dateWhere = hasRange ? 'WHERE DATE(tanggal) BETWEEN ? AND ?' : '';

    // 1) Pembelian
    const pembelianSql = `
      SELECT p.id, p.customer, p.jumlah, p.keterangan, p.tanggal, pr.nama AS produk_nama, p.status
      FROM pembelian p
      LEFT JOIN produk pr ON p.produk_id = pr.id
      ${dateWhere ? dateWhere.replace(/tanggal/g, 'p.tanggal') : ''}
      ORDER BY p.tanggal ASC
    `;
    const pembelianRows = hasRange ? await q(pembelianSql, [start, end]) : await q(pembelianSql);

    // 2) Barang Masuk (join detail)
    const bmSql = `
      SELECT bm.id AS bm_id, bm.pengirim, bm.tanggal AS tanggal, 
             bmd.id AS detail_id, bmd.produk_id, bmd.jumlah, bmd.keterangan AS detail_ket, p.nama AS produk_nama, bmd.gambar
      FROM barang_masuk bm
      LEFT JOIN barang_masuk_detail bmd ON bm.id = bmd.barang_masuk_id
      LEFT JOIN produk p ON bmd.produk_id = p.id
      ${dateWhere ? dateWhere.replace(/tanggal/g, 'bm.tanggal') : ''}
      ORDER BY bm.tanggal ASC, bm.id ASC
    `;
    const bmRows = hasRange ? await q(bmSql, [start, end]) : await q(bmSql);

    // group barang masuk by bm_id (preserve insertion order)
    const groupedBM = {};
    const bmOrder = [];
    (bmRows || []).forEach(r => {
      if (!groupedBM[r.bm_id]) {
        groupedBM[r.bm_id] = { id: r.bm_id, pengirim: r.pengirim, tanggal: r.tanggal, items: [] };
        bmOrder.push(r.bm_id);
      }
      groupedBM[r.bm_id].items.push({
        detail_id: r.detail_id,
        produk_id: r.produk_id,
        nama: r.produk_nama,
        jumlah: r.jumlah,
        keterangan: r.detail_ket,
        gambar: r.gambar
      });
    });

    // 3) Barang Keluar (join detail)
    const bkSql = `
      SELECT bk.id AS bk_id, bk.tujuan, bk.tanggal AS tanggal,
             bkd.id AS detail_id, bkd.produk_id, bkd.jumlah, bkd.keterangan AS detail_ket, bkd.gambar, bkd.status,
             p.nama AS produk_nama
      FROM barang_keluar bk
      LEFT JOIN barang_keluar_detail bkd ON bk.id = bkd.barang_keluar_id
      LEFT JOIN produk p ON bkd.produk_id = p.id
      ${dateWhere ? dateWhere.replace(/tanggal/g, 'bk.tanggal') : ''}
      ORDER BY bk.tanggal ASC, bk.id ASC
    `;
    const bkRows = hasRange ? await q(bkSql, [start, end]) : await q(bkSql);

    // group barang keluar by bk_id (preserve insertion order)
    const groupedBK = {};
    const bkOrder = [];
    (bkRows || []).forEach(r => {
      if (!groupedBK[r.bk_id]) {
        groupedBK[r.bk_id] = { id: r.bk_id, tujuan: r.tujuan, tanggal: r.tanggal, items: [] };
        bkOrder.push(r.bk_id);
      }
      groupedBK[r.bk_id].items.push({
        detail_id: r.detail_id,
        produk_id: r.produk_id,
        nama: r.produk_nama,
        jumlah: r.jumlah,
        keterangan: r.detail_ket,
        gambar: r.gambar,
        status: (typeof r.status !== 'undefined' && r.status !== null) ? Number(r.status) : 2
      });
    });

    // 4) Prepare PDF
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    const fname = `all_history_${ hasRange ? `${start}_to_${end}` : 'all' }.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    doc.pipe(res);

    // layout helpers
    const margin = doc.page.margins.left || 40;
    const rightMargin = doc.page.margins.right || 40;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin - rightMargin;

    function writeMainTitle() {
      doc.fontSize(16).font('Helvetica-Bold').text('Laporan Semua Riwayat', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').text(hasRange ? `Periode: ${start} — ${end}` : 'Periode: Semua', { align: 'center' });
      doc.moveDown(0.8);
    }

    // draw page header + optionally section title - used after addPage
    function drawPageHeader(sectionTitle) {
      // if first line in page, write main title only once (we'll call writeMainTitle on first page before drawPageHeader)
      if (sectionTitle) {
        doc.fontSize(15).font('Helvetica-Bold').text(sectionTitle, margin, doc.y);
        doc.moveDown(0.4);
      }
    }

    function needNewPage(heightNeeded) {
      const bottomLimit = doc.page.height - (doc.page.margins.bottom || 40) - 40;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        // redraw main title small header for continuity
        writeMainTitle();
        // NOTE: do NOT redraw section title here (we only want it once per section)
      }
    }

    // Start document
    writeMainTitle();

    // ------------------ SECTION: Pembelian ------------------
    drawPageHeader('1) Riwayat Pembelian');
    // table header
    doc.fontSize(12).font('Helvetica-Bold');
    // columns: No | Customer | Produk | Jml | Status | Keterangan | Tanggal
    const colNoW = 30;
    const colCustomerW = 90;
    const colProductW = 100;
    const colQtyW = 50;
    const colStatusW = 70;
    const colKetW = 90;
    const colTglW = contentWidth - (colNoW + colCustomerW + colProductW + colQtyW + colStatusW + colKetW);

    // draw header row background
    const headerY = doc.y;
    doc.save();
    doc.opacity(0.04).rect(margin, headerY - 2, contentWidth, 18).fill();
    doc.restore();

    doc.fontSize(11).font('Helvetica-Bold').fillColor('black');
    doc.text('No', margin + 2, headerY, { width: colNoW - 2, align: 'center' });
    doc.text('Customer', margin + colNoW + 2, headerY, { width: colCustomerW - 2, align: 'center' });
    doc.text('Produk', margin + colNoW + colCustomerW + 2, headerY, { width: colProductW - 2, align: 'center' });
    doc.text('Jumlah', margin + colNoW + colCustomerW + colProductW + 2, headerY, { width: colQtyW - 2, align: 'center' });
    doc.text('Status', margin + colNoW + colCustomerW + colProductW + colQtyW + 2, headerY, { width: colStatusW - 2, align: 'center' });
    doc.text('Keterangan', margin + colNoW + colCustomerW + colProductW + colQtyW + colStatusW + 2, headerY, { width: colKetW - 2, align: 'center' });
    doc.text('Tanggal', margin + colNoW + colCustomerW + colProductW + colQtyW + colStatusW + colKetW + 2, headerY, { width: colTglW - 2, align: 'center' });
    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(10);

    if (!pembelianRows || pembelianRows.length === 0) {
      doc.fontSize(10).fillColor('gray').text('Tidak ada data pembelian pada rentang ini.', margin, doc.y);
      doc.fillColor('black');
    } else {
      for (let i = 0; i < pembelianRows.length; i++) {
        const r = pembelianRows[i];
        // prepare strings
        const customerTxt = r.customer || '-';
        const produkTxt = r.produk_nama || '-';
        const qtyTxt = String(r.jumlah ?? '-');
        const statusTxt = (r.status == 1 || r.status === 1) ? 'Selesai' : (r.status == 2 ? 'Pending' : String(r.status || '-'));
        const ketTxt = r.keterangan || '-';
        const tglTxt = r.tanggal ? new Date(r.tanggal).toLocaleString('id-ID') : '-';

        // calculate expected height (wrap-aware)
        const hNo = doc.heightOfString(String(i + 1), { width: colNoW - 2 });
        const hCust = doc.heightOfString(customerTxt, { width: colCustomerW - 2 });
        const hProd = doc.heightOfString(produkTxt, { width: colProductW - 2 });
        const hQty = doc.heightOfString(qtyTxt, { width: colQtyW - 2 });
        const hStatus = doc.heightOfString(statusTxt, { width: colStatusW - 2 });
        const hKet = doc.heightOfString(ketTxt, { width: colKetW - 2 });
        const hTgl = doc.heightOfString(tglTxt, { width: colTglW - 2 });

        const maxH = Math.max(hNo, hCust, hProd, hQty, hStatus, hKet, hTgl, 14);

        needNewPage(maxH + 10, '1) Riwayat Pembelian');

        const y = doc.y;
        doc.fontSize(10).fillColor('black').text(String(i + 1), margin + 2, y, { width: colNoW - 2, align: 'center' });
        doc.text(customerTxt, margin + colNoW + 2, y, { width: colCustomerW - 2, align: 'center' });
        doc.text(produkTxt, margin + colNoW + colCustomerW + 2, y, { width: colProductW - 2, align: 'center' });
        doc.text(qtyTxt, margin + colNoW + colCustomerW + colProductW + 2, y, { width: colQtyW - 2, align: 'center' });

        // status colored
        if ((statusTxt || '').toLowerCase() === 'selesai') doc.fillColor('#1b7a1b');
        else if ((statusTxt || '').toLowerCase() === 'pending') doc.fillColor('#b02a2a');
        else doc.fillColor('black');
        doc.text(statusTxt, margin + colNoW + colCustomerW + colProductW + colQtyW + 2, y, { width: colStatusW - 2, align: 'center' });

        // reset color
        doc.fillColor('black');
        doc.text(ketTxt, margin + colNoW + colCustomerW + colProductW + colQtyW + colStatusW + 2, y, { width: colKetW - 2, align: 'center' });
        doc.text(tglTxt, margin + colNoW + colCustomerW + colProductW + colQtyW + colStatusW + colKetW + 2, y, { width: colTglW - 2, align: 'center' });

        doc.moveDown(Math.max(1, Math.ceil(maxH / 14)));
      }
    }

    // ------------------ SECTION: Barang Masuk ------------------
    drawPageHeader('2) Riwayat Barang Masuk');
    if (bmOrder.length === 0) {
      doc.fontSize(10).fillColor('gray').text('Tidak ada data barang masuk pada rentang ini.', margin, doc.y);
      doc.fillColor('black');
    } else {
      let refBM = 0;
      // layout for barang masuk
      const colNoBM = 30;
      const colQtyBM = 40;
      const colProdukBM = contentWidth - (colNoBM + colQtyBM);

      for (const bkId of bmOrder) {
        refBM++;
        const tx = groupedBM[bkId];
        // header per transaksi
        needNewPage(28, '2) Riwayat Barang Masuk');
        const hdrLine = `Ref: ${refBM}    Pengirim: ${tx.pengirim || '-'}    Tanggal: ${tx.tanggal ? new Date(tx.tanggal).toLocaleString('id-ID') : '-'}`;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('black').text(hdrLine, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.3);

        // column header
        const y0 = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('No', margin, y0, { width: colNoBM, align: 'center' });
        doc.text('Produk', margin + colNoBM, y0, { width: colProdukBM, align: 'left' });
        doc.text('Jumlah', margin + colNoBM + colProdukBM, y0, { width: colQtyBM, align: 'center' });
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // items
        for (let idx = 0; idx < tx.items.length; idx++) {
          const it = tx.items[idx];

          // compute text heights
          const produkNameH = doc.heightOfString(it.nama || ('ID ' + it.produk_id), { width: colProdukBM });
          const ketH = it.keterangan ? doc.heightOfString('Keterangan: ' + it.keterangan, { width: colProdukBM }) : 0;
          const imgH = it.gambar ? 100 : 0;
          const rowPadding = 24;
          const rowH = Math.max(produkNameH + ketH, imgH, 12) + rowPadding;

          needNewPage(rowH + 20, '2) Riwayat Barang Masuk');

          const y = doc.y;
          doc.fontSize(10).text(String(idx + 1), margin, y, { width: colNoBM, align: 'center' });

          const prodX = margin + colNoBM;
          doc.text(it.nama || ('ID ' + it.produk_id), prodX, y, { width: colProdukBM, align: 'left' });

          if (it.keterangan) {
            const afterNamaY = doc.y + 2;
            doc.fontSize(9).fillColor('gray').text('Keterangan: ' + it.keterangan, prodX, afterNamaY, { width: colProdukBM, align: 'left' });
            doc.fillColor('black').fontSize(10);
          }

          // gambar (bila ada) : taruh di bawah nama, di area produk
          if (it.gambar) {
            const first = (it.gambar.split && it.gambar.split(',')[0]) || null;
            const imgPath = first ? path.join(__dirname, 'media', first) : null;
            if (imgPath && fs.existsSync(imgPath)) {
              try {
                const imgX = prodX;
                const imgY = Math.max(y + produkNameH + 6, doc.y + 4);
                doc.image(imgPath, imgX, imgY, { fit: [120, imgH] });
              } catch (e) {
                // ignore
              }
            }
          }

          const qtyX = margin + colNoBM + colProdukBM;
          doc.text(String(it.jumlah ?? '-'), qtyX, y, { width: colQtyBM, align: 'center' });

          // advance
          doc.y = y + rowH;
          doc.moveDown(0.2);
        }

        // separator
        doc.moveDown(0.4);
        doc.save();
        doc.lineWidth(0.5).strokeColor('#DDDDDD');
        doc.moveTo(margin, doc.y).lineTo(pageWidth - rightMargin, doc.y).stroke();
        doc.restore();
        doc.moveDown(0.6);
      }
    }

    // ------------------ SECTION: Barang Keluar ------------------
    drawPageHeader('3) Riwayat Barang Keluar');
    if (bkOrder.length === 0) {
      doc.fontSize(10).fillColor('gray').text('Tidak ada data barang keluar pada rentang ini.', margin, doc.y);
      doc.fillColor('black');
    } else {
      let refBK = 0;
      // layout for barang keluar
      const colNoBK = 30;
      const colQtyBK = 80;
      const colStatusBK = 80;
      const colProdukBK = contentWidth - (colNoBK + colQtyBK + colStatusBK);

      for (const idBK of bkOrder) {
        refBK++;
        const tx = groupedBK[idBK];

        needNewPage(28, '3) Riwayat Barang Keluar');
        const hdrLine = `Ref: ${refBK}    Tujuan: ${tx.tujuan || '-'}    Tanggal: ${tx.tanggal ? new Date(tx.tanggal).toLocaleString('id-ID') : '-'}`;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('black').text(hdrLine, margin, doc.y, { width: contentWidth });
        doc.moveDown(0.3);

        // column header
        const y0 = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('No', margin, y0, { width: colNoBK, align: 'center' });
        doc.text('Produk', margin + colNoBK, y0, { width: colProdukBK, align: 'left' });
        doc.text('Jumlah', margin + colNoBK + colProdukBK, y0, { width: colQtyBK, align: 'center' });
        doc.text('Status', margin + colNoBK + colProdukBK + colQtyBK, y0, { width: colStatusBK, align: 'center' });
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // items
        for (let i = 0; i < tx.items.length; i++) {
          const it = tx.items[i];

          const produkNameH = doc.heightOfString(it.nama || ('ID ' + it.produk_id), { width: colProdukBK });
          const ketH = it.keterangan ? doc.heightOfString('Keterangan: ' + it.keterangan, { width: colProdukBK }) : 0;
          const imgH = it.gambar ? 80 : 0;
          const rowPadding = 20;
          const rowH = Math.max(produkNameH + ketH, imgH, 12) + rowPadding;

          needNewPage(rowH + 20, '3) Riwayat Barang Keluar');

          const y = doc.y;
          doc.fontSize(10).text(String(i + 1), margin, y, { width: colNoBK, align: 'center' });

          const prodX = margin + colNoBK;
          doc.text(it.nama || ('ID ' + it.produk_id), prodX, y, { width: colProdukBK, align: 'left' });

          if (it.keterangan) {
            const afterY = doc.y + 2;
            doc.fontSize(9).fillColor('gray').text('Keterangan: ' + it.keterangan, prodX, afterY, { width: colProdukBK, align: 'left' });
            doc.fillColor('black').fontSize(10);
          }

          // gambar under product
          if (it.gambar) {
            const first = (it.gambar.split && it.gambar.split(',')[0]) || null;
            const imgPath = first ? path.join(__dirname, 'media', first) : null;
            if (imgPath && fs.existsSync(imgPath)) {
              try {
                const imgX = prodX;
                const imgY = Math.max(y + produkNameH + 6, doc.y + 4);
                doc.image(imgPath, imgX, imgY, { fit: [120, imgH] });
              } catch (e) { /* ignore */ }
            }
          }

          const qtyX = margin + colNoBK + colProdukBK;
          doc.text(String(it.jumlah ?? '-'), qtyX, y, { width: colQtyBK, align: 'center' });

          const statusLabel = (it.status === 1) ? 'Selesai' : 'Pending';
          const statusX = margin + colNoBK + colProdukBK + colQtyBK;
          doc.text(statusLabel, statusX, y, { width: colStatusBK, align: 'center' });

          doc.y = y + rowH;
          doc.moveDown(0.2);
        }

        doc.moveDown(0.4);
        doc.save();
        doc.lineWidth(0.5).strokeColor('#DDDDDD');
        doc.moveTo(margin, doc.y).lineTo(pageWidth - rightMargin, doc.y).stroke();
        doc.restore();
        doc.moveDown(0.6);
      }
    }

    // footer
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor('gray').text(`Generated: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });

    doc.end();

  } catch (err) {
    console.error('/export/all/pdf error:', err);
    if (!res.headersSent) {
      res.status(500).send('Gagal generate PDF gabungan.');
    }
  }
});

// ======================================================
// HALAMAN BARANG KELUAR ALEX
// ======================================================

app.get('/barang-keluar-alex', async (req, res) => {
  try {

    const produk = await q(`
      SELECT
        id,
        nama
      FROM produk
      ORDER BY nama ASC
    `);

    const data = await q(`
      SELECT
        a.*,
        p.nama AS nama_produk
      FROM barang_alex_keluar a
      LEFT JOIN produk p
        ON p.id = a.produk_id
      ORDER BY
        CASE
          WHEN a.status = 'pending' THEN 0
          WHEN a.status = 'masuk_stok' THEN 1
          WHEN a.status = 'beres' THEN 2
          WHEN a.status = 'cancel' THEN 3
          ELSE 4
        END,
        a.created_at DESC
    `);

    res.render('barang_keluar_alex', {
      produk,
      data
    });

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal mengambil data Barang Keluar Alex'
    );

  }
});

app.post('/barang-keluar-alex', async (req, res) => {

  try {

    const {
      tujuan,
      produk_id,
      produk_baru,
      jumlah,
      keterangan
    } = req.body;

    let finalProdukId = null;
    let namaBarang = null;

    // ======================================
    // PILIH PRODUK DARI MASTER
    // ======================================

    if (produk_id && produk_id !== '') {

      finalProdukId = parseInt(produk_id);

      const produk = await q(`
        SELECT nama
        FROM produk
        WHERE id = ?
        LIMIT 1
      `, [finalProdukId]);

      if (produk.length) {
        namaBarang = produk[0].nama;
      }

    }

    // ======================================
    // PRODUK BARU
    // ======================================

    if ((!finalProdukId || finalProdukId === '') && produk_baru) {

      namaBarang = produk_baru.trim();

      // generate kode produk otomatis
      const lastProduk = await q(`
        SELECT kode_produk
        FROM produk
        ORDER BY CAST(
          REPLACE(
            UPPER(kode_produk),
            'P',
            ''
          ) AS UNSIGNED
        ) DESC
        LIMIT 1
      `);

      let kode_produk = 'P1';

      if (lastProduk.length > 0) {

        const lastKode =
          lastProduk[0].kode_produk || 'P0';

        const nomor = parseInt(
          lastKode.replace(/[^0-9]/g, '')
        ) || 0;

        kode_produk = 'P' + (nomor + 1);

      }

      // insert produk baru
      const insertProduk = await q(`
        INSERT INTO produk (
          nama,
          kode_produk,
          keterangan,
          gambar,
          brand_id,
          posisi,
          harga_modal,
          harga_jual
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        namaBarang,
        kode_produk,
        null,
        '',
        null,
        null,
        0,
        0
      ]);

      finalProdukId = insertProduk.insertId;

      // buat stok cabang default
      await q(`
        INSERT INTO stock_cabang (
          produk_id,
          cabang_id,
          jumlah
        )
        VALUES (?, ?, ?)
      `, [
        finalProdukId,
        1,
        0
      ]);

    }

    // ======================================
    // VALIDASI
    // ======================================

    if (!finalProdukId) {
      return res.status(400).send(
        'Produk harus dipilih atau dibuat baru'
      );
    }

    // ======================================
    // SIMPAN BARANG ALEX
    // ======================================

    await q(`
      INSERT INTO barang_alex_keluar
      (
        tujuan,
        produk_id,
        nama_barang,
        jumlah,
        keterangan,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [
      tujuan,
      finalProdukId,
      namaBarang,
      parseInt(jumlah) || 0,
      keterangan || null
    ]);

    res.redirect('/barang-keluar-alex');

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal menyimpan Barang Keluar Alex'
    );

  }

});

// ======================================================
// MASUK STOK
// ======================================================

app.post('/barang-keluar-alex/:id/masuk-stok', async (req, res) => {

  try {

    const id = req.params.id;

    const rows = await q(`
      SELECT *
      FROM barang_alex_keluar
      WHERE id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).send('Data tidak ditemukan');
    }

    const item = rows[0];

    await beginTransaction();

    // update status
    await q(`
      UPDATE barang_alex_keluar
      SET status = 'masuk_stok'
      WHERE id = ?
    `, [id]);

    // buat transaksi barang masuk
    const bm = await q(`
      INSERT INTO barang_masuk
      (
        pengirim
      )
      VALUES (?)
    `, [
      item.tujuan || 'ALEX'
    ]);

    // detail barang masuk
    await q(`
      INSERT INTO barang_masuk_detail
      (
        barang_masuk_id,
        produk_id,
        jumlah,
        keterangan
      )
      VALUES (?, ?, ?, ?)
    `, [
      bm.insertId,
      item.produk_id,
      item.jumlah,
      'AUTO DARI BARANG KELUAR ALEX'
    ]);

    // tambah stok cabang utama
    await q(`
      INSERT INTO stock_cabang
      (
        produk_id,
        cabang_id,
        jumlah
      )
      VALUES (?, 1, ?)

      ON DUPLICATE KEY UPDATE

      jumlah = jumlah + VALUES(jumlah)
    `, [
      item.produk_id,
      item.jumlah
    ]);

    await commit();

    res.redirect('/barang-keluar-alex');

  } catch (err) {

    console.error(err);

    try {
      await rollback();
    } catch(e){}

    res.status(500).send('Gagal proses masuk stok');

  }

});


// ======================================================
// BERES
// ======================================================

app.post('/barang-keluar-alex/:id/beres', async (req, res) => {

  try {

    const id = req.params.id;

    await q(`
      UPDATE barang_alex_keluar
      SET status = 'beres'
      WHERE id = ?
    `, [id]);

    res.redirect('/barang-keluar-alex');

  } catch (err) {

    console.error(err);

    res.status(500).send('Gagal update status');

  }

});

// ======================================================
// CANCEL
// ======================================================

app.post('/barang-keluar-alex/:id/cancel', async (req, res) => {

  try {

    const id = req.params.id;

    await q(`
      UPDATE barang_alex_keluar
      SET status = 'cancel'
      WHERE id = ?
    `, [id]);

    res.redirect('/barang-keluar-alex');

  } catch (err) {

    console.error(err);

    res.status(500).send('Gagal cancel data');

  }

});

// ======================================================
// EXPORT PDF BARANG KELUAR ALEX
// ======================================================

app.get('/export/barang-keluar-alex', async (req, res) => {

  try {

    const { start, end } = req.query;

    let where = '';
    let params = [];

    if (start && end) {

      where = `
        WHERE DATE(a.created_at)
        BETWEEN ? AND ?
      `;

      params.push(start, end);

    }

    const rows = await q(`
      SELECT
        a.*,
        p.nama AS nama_produk
      FROM barang_alex_keluar a
      LEFT JOIN produk p
        ON p.id = a.produk_id
      ${where}
      ORDER BY
      CASE
        WHEN a.status = 'pending' THEN 0
        WHEN a.status = 'masuk_stok' THEN 1
        WHEN a.status = 'beres' THEN 2
        ELSE 3
      END,
      a.created_at DESC
    `, params);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 25
    });

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      'inline; filename=Laporan-Barang-Keluar-Alex.pdf'
    );

    doc.pipe(res);

    // =====================================
    // HEADER
    // =====================================

    doc
      .fontSize(18)
      .text(
        'LAPORAN BARANG KELUAR ALEX',
        {
          align: 'center'
        }
      );

    doc.moveDown(0.5);

    if (start && end) {

      doc
        .fontSize(10)
        .text(
          `Periode : ${start} s/d ${end}`,
          {
            align: 'center'
          }
        );

    }

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `Tanggal Cetak : ${new Date().toLocaleString('id-ID')}`,
        {
          align: 'right'
        }
      );

    doc.moveDown();

    let totalBarang = 0;

    rows.forEach(item => {
      totalBarang += Number(item.jumlah || 0);
    });

    doc
      .fontSize(11)
      .text(`Total Data : ${rows.length}`);

    doc
      .fontSize(11)
      .text(`Total Qty : ${totalBarang}`);

    doc.moveDown();

    // =====================================
    // HEADER TABEL
    // =====================================

    let y = doc.y;

    const rowHeight = 22;

    doc.rect(20, y, 780, rowHeight).stroke();

    doc.text('No', 25, y + 6);
    doc.text('Tujuan', 55, y + 6);
    doc.text('Produk', 180, y + 6);
    doc.text('Qty', 500, y + 6);
    doc.text('Status', 560, y + 6);
    doc.text('Tanggal', 650, y + 6);

    y += rowHeight;

    // =====================================
    // DATA
    // =====================================

    rows.forEach((r, index) => {

    const namaProduk =
      r.nama_produk ||
      r.nama_barang ||
      '-';

    // hitung tinggi teks produk
    const tinggiProduk = doc.heightOfString(
      namaProduk,
      {
        width: 280
      }
    );

    // tinggi row otomatis
    const currentRowHeight =
      Math.max(
        tinggiProduk,
        18
      ) + 10;

    // pindah halaman jika hampir habis
    if (y + currentRowHeight > 540) {

      doc.addPage();

      y = 40;

      doc.rect(20, y, 780, 22).stroke();

      doc.text('No',25,y+6);
      doc.text('Tujuan',55,y+6);
      doc.text('Produk',180,y+6);
      doc.text('Qty',500,y+6);
      doc.text('Status',560,y+6);
      doc.text('Tanggal',650,y+6);

      y += 22;

    }

    // garis row
    doc.rect(
      20,
      y,
      780,
      currentRowHeight
    ).stroke();

    doc.text(
      String(index + 1),
      25,
      y + 5
    );

    doc.text(
      r.tujuan || '-',
      55,
      y + 5,
      {
        width: 110
      }
    );

    doc.text(
      namaProduk,
      180,
      y + 5,
      {
        width: 300
      }
    );

    doc.text(
      String(r.jumlah || 0),
      500,
      y + 5
    );

    doc.text(
      r.status || '-',
      560,
      y + 5
    );

    doc.text(
      new Date(
        r.created_at
      ).toLocaleDateString('id-ID'),
      650,
      y + 5
    );

    y += currentRowHeight;

  });

    // =====================================
    // FOOTER
    // =====================================

    doc.moveDown(2);

    doc.text(
      `Dicetak oleh Admin DR.COM`,
      {
        align: 'right'
      }
    );

    doc.end();

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal export PDF'
    );

  }

});

// ======================================================
// HALAMAN SPAREPART / AKSESORIS
// ======================================================

app.get('/sparepart', async (req, res) => {

  try {

    const rows = await q(`
      SELECT *
      FROM sparepart
      ORDER BY
      CAST(
        REPLACE(
          UPPER(kode_sparepart),
          'SP',
          ''
        ) AS UNSIGNED
      ) ASC
    `);

    res.render('sparepart', {
      sparepart: rows
    });

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal load sparepart'
    );

  }

});

// ======================================================
// TAMBAH SPAREPART
// ======================================================

app.post('/sparepart/tambah', async (req, res) => {

  try {

    const {
      nama,
      kategori,
      harga_modal,
      harga_jual,
      stok,
      posisi,
      keterangan
    } = req.body;

    const last = await q(`
      SELECT kode_sparepart
      FROM sparepart
      ORDER BY id DESC
      LIMIT 1
    `);

    let nomor = 1;

    if (last.length > 0) {

      nomor =
        parseInt(
          last[0].kode_sparepart.replace('SP', '')
        ) + 1;

    }

    const kode =
      'SP' + nomor;

    await q(`
      INSERT INTO sparepart
      (
        kode_sparepart,
        nama,
        kategori,
        harga_modal,
        harga_jual,
        stok,
        posisi,
        keterangan
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      kode,
      nama,
      kategori,
      harga_modal || 0,
      harga_jual || 0,
      stok || 0,
      posisi,
      keterangan
    ]);

    res.redirect('/sparepart');

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal tambah sparepart'
    );

  }

});

// ======================================================
// FORM EDIT
// ======================================================

app.get('/sparepart/edit/:id', async (req, res) => {

  const id = req.params.id;

  const data = await q(`
    SELECT *
    FROM sparepart
    WHERE id = ?
  `, [id]);

  if (!data.length) {
    return res.send('Data tidak ditemukan');
  }

  res.render('sparepart_edit', {
    sparepart: data[0]
  });

});

app.post('/sparepart/edit/:id', async (req, res) => {

  try {

    const id = req.params.id;

    const {
      nama,
      kategori,
      harga_modal,
      harga_jual,
      stok,
      posisi,
      keterangan
    } = req.body;

    await q(`
      UPDATE sparepart
      SET
        nama=?,
        kategori=?,
        harga_modal=?,
        harga_jual=?,
        stok=?,
        posisi=?,
        keterangan=?
      WHERE id=?
    `, [
      nama,
      kategori,
      harga_modal,
      harga_jual,
      stok,
      posisi,
      keterangan,
      id
    ]);

    res.redirect('/sparepart');

  } catch (err) {

    console.error(err);

    res.status(500).send('Gagal update sparepart');

  }

});

app.post('/sparepart/hapus/:id', async (req, res) => {

  try {

    await q(`
      DELETE FROM sparepart
      WHERE id = ?
    `, [
      req.params.id
    ]);

    res.redirect('/sparepart');

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal hapus sparepart'
    );

  }

});

// ======================================================
// EXPORT PDF SPAREPART
// ======================================================

app.get('/export/sparepart/pdf', async (req, res) => {

  try {

    const data = await q(`
      SELECT *
      FROM sparepart
      ORDER BY
      CAST(
        REPLACE(
          UPPER(kode_sparepart),
          'SP',
          ''
        ) AS UNSIGNED
      ) ASC
    `);

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape'
    });

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      'inline; filename=sparepart.pdf'
    );

    doc.pipe(res);

    // ==================================
    // HEADER
    // ==================================

    doc
      .fontSize(18)
      .text(
        'DATA SPAREPART & AKSESORIS DRCOM',
        {
          align: 'center'
        }
      );

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(
        `Dicetak: ${new Date().toLocaleString('id-ID')}`,
        {
          align: 'center'
        }
      );

    doc.moveDown();

    // ==================================
    // KOLOM
    // ==================================

    let y = 130;

    doc
      .fontSize(9)
      .font('Helvetica-Bold');

    doc.text('No', 30, y);
    doc.text('Kode', 60, y);
    doc.text('Nama', 120, y);
    doc.text('Kategori', 320, y);
    // doc.text('Modal', 420, y);
    // doc.text('Jual', 520, y);
    doc.text('Stok', 500, y);
    doc.text('Posisi', 560, y);

    y += 20;

    doc.moveTo(30, y - 5)
      .lineTo(800, y - 5)
      .stroke();

    // ==================================
    // DATA
    // ==================================

    doc.font('Helvetica');

    data.forEach((sp, index) => {

      if (y > 540) {

        doc.addPage();

        y = 50;

      }

      doc.text(index + 1, 30, y);

      doc.text(
        sp.kode_sparepart || '-',
        60,
        y
      );

      doc.text(
        (sp.nama || '').substring(0, 35),
        120,
        y,
        {
          width: 180
        }
      );

      doc.text(
        sp.kategori || '-',
        320,
        y,
        {
          width: 90
        }
      );

      // doc.text(
      //   Number(
      //     sp.harga_modal || 0
      //   ).toLocaleString('id-ID'),
      //   420,
      //   y
      // );

      // doc.text(
      //   Number(
      //     sp.harga_jual || 0
      //   ).toLocaleString('id-ID'),
      //   520,
      //   y
      // );

      doc.text(
        sp.stok || 0,
        500,
        y
      );

      doc.text(
        sp.posisi || '-',
        560,
        y
      );

      y += 22;

      doc.moveTo(30, y - 4)
        .lineTo(800, y - 4)
        .strokeColor('#dddddd')
        .stroke();

    });

    // ==================================
    // TOTAL
    // ==================================

    y += 15;

    const totalModal = data.reduce(
      (a, b) =>
        a +
        (
          Number(b.harga_modal || 0) *
          Number(b.stok || 0)
        ),
      0
    );

    const totalJual = data.reduce(
      (a, b) =>
        a +
        (
          Number(b.harga_jual || 0) *
          Number(b.stok || 0)
        ),
      0
    );

    doc.moveDown();

    // doc
    //   .font('Helvetica-Bold')
    //   .fontSize(11);

    // doc.text(
    //   `Total Nilai Modal : Rp ${totalModal.toLocaleString('id-ID')}`
    // );

    // doc.text(
    //   `Total Nilai Jual : Rp ${totalJual.toLocaleString('id-ID')}`
    // );

    doc.end();

  } catch (err) {

    console.error(err);

    res.status(500).send(
      'Gagal export PDF sparepart'
    );

  }

});


// 7️⃣ LISTEN HARUS PALING BAWAH
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
