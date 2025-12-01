-- MySQL dump 10.13  Distrib 8.0.19, for Win64 (x86_64)
--
-- Host: localhost    Database: toko
-- ------------------------------------------------------
-- Server version	8.4.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `barang_keluar`
--

DROP TABLE IF EXISTS `barang_keluar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barang_keluar` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tujuan` varchar(255) DEFAULT NULL,
  `tanggal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barang_keluar`
--

LOCK TABLES `barang_keluar` WRITE;
/*!40000 ALTER TABLE `barang_keluar` DISABLE KEYS */;
INSERT INTO `barang_keluar` VALUES (1,'Ajid','2025-10-26 16:53:57'),(2,'Ajid','2025-10-26 16:54:59'),(3,'Harco','2025-10-28 11:43:31'),(4,'Ajid','2025-10-28 18:45:19'),(5,'ajid','2025-10-31 15:05:27'),(6,'Harco','2025-10-31 16:55:42'),(7,'Harco','2025-10-31 17:39:39'),(8,'Ajid','2025-10-31 17:42:06'),(9,'Ajid','2025-10-31 18:10:18'),(10,'Ajid','2025-10-31 18:45:02');
/*!40000 ALTER TABLE `barang_keluar` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barang_keluar_detail`
--

DROP TABLE IF EXISTS `barang_keluar_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barang_keluar_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `barang_keluar_id` int DEFAULT NULL,
  `produk_id` int DEFAULT NULL,
  `jumlah` int DEFAULT NULL,
  `keterangan` text,
  `gambar` varchar(100) DEFAULT NULL,
  `status` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '2 status pending stok berkurang, 1 status selesai stok bertambah',
  PRIMARY KEY (`id`),
  KEY `barang_keluar_id` (`barang_keluar_id`),
  KEY `produk_id` (`produk_id`),
  CONSTRAINT `barang_keluar_detail_ibfk_1` FOREIGN KEY (`barang_keluar_id`) REFERENCES `barang_keluar` (`id`),
  CONSTRAINT `barang_keluar_detail_ibfk_2` FOREIGN KEY (`produk_id`) REFERENCES `produk` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barang_keluar_detail`
--

LOCK TABLES `barang_keluar_detail` WRITE;
/*!40000 ALTER TABLE `barang_keluar_detail` DISABLE KEYS */;
INSERT INTO `barang_keluar_detail` VALUES (1,1,11,1,'Service ws',NULL,NULL),(2,1,12,3,'Service engsel',NULL,NULL),(3,2,12,1,'service kipas',NULL,NULL),(4,3,14,1,'servise kamera udah balik 2 sisanya 3 masih di harco','1761651811881_acer_a315_ryzen_5.png',NULL),(5,4,1,1,'Service engsel','1761677119733_rip.jpg','1'),(6,5,11,3,'servise engsel','1761923127084_Struktur_Toko.png','1'),(7,6,2,1,'installasi','1761929742204_Struktur_Toko.png','1'),(8,7,15,1,'servise kipas','1761932379615_Struktur_Toko.png','1'),(9,8,15,1,'servise','1761932526897_Struktur_Toko_(1).png','1'),(10,9,15,1,'Service engsel','1761934218591_Struktur_Toko.png','1'),(11,10,1,1,'servise kipas','1761936302599_Struktur_Toko_(1).png','1');
/*!40000 ALTER TABLE `barang_keluar_detail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barang_masuk`
--

DROP TABLE IF EXISTS `barang_masuk`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barang_masuk` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pengirim` varchar(255) DEFAULT NULL,
  `tanggal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barang_masuk`
--

LOCK TABLES `barang_masuk` WRITE;
/*!40000 ALTER TABLE `barang_masuk` DISABLE KEYS */;
INSERT INTO `barang_masuk` VALUES (3,'Sinar Mutiara','2025-10-26 15:54:41'),(4,'Sinar Mutiara','2025-10-26 15:56:04'),(5,'Ari Speed','2025-10-26 16:29:34'),(6,'Sinar Mutiara','2025-10-26 16:32:54'),(7,'Ari Speed','2025-10-28 11:00:26'),(8,'Ari Speed','2025-10-28 12:16:33'),(9,'Ari Speed','2025-10-28 18:40:14'),(10,'Ari Speed','2025-10-28 20:43:34'),(11,'Ari Speed','2025-10-31 15:04:32'),(12,'ajid','2025-10-31 15:06:40'),(13,'KingTech','2025-10-31 21:37:09'),(14,'KingTech','2025-11-01 11:26:42'),(15,'Sinar Mutiara','2025-11-02 12:29:45');
/*!40000 ALTER TABLE `barang_masuk` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `barang_masuk_detail`
--

DROP TABLE IF EXISTS `barang_masuk_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barang_masuk_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `barang_masuk_id` int DEFAULT NULL,
  `produk_id` int DEFAULT NULL,
  `jumlah` int DEFAULT NULL,
  `keterangan` text,
  `gambar` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `barang_masuk_id` (`barang_masuk_id`),
  KEY `produk_id` (`produk_id`),
  CONSTRAINT `barang_masuk_detail_ibfk_1` FOREIGN KEY (`barang_masuk_id`) REFERENCES `barang_masuk` (`id`),
  CONSTRAINT `barang_masuk_detail_ibfk_2` FOREIGN KEY (`produk_id`) REFERENCES `produk` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `barang_masuk_detail`
--

LOCK TABLES `barang_masuk_detail` WRITE;
/*!40000 ALTER TABLE `barang_masuk_detail` DISABLE KEYS */;
INSERT INTO `barang_masuk_detail` VALUES (2,4,11,100,'normal',NULL),(3,5,12,100,'50 normal, 50 minus engsel',NULL),(4,6,13,50,'Jumlah yang masuk 5 box total 50',NULL),(6,7,15,2,'normal',NULL),(10,3,1,8,'normal 5, minus engsel 5',NULL),(11,9,1,1,'Minus engsel','1761676814088_STOK.jpg'),(12,10,7,10,'5 minus engsel, 5 normal','1761684214479_ATOK.jpg'),(13,8,15,5,'Normal semua',NULL),(14,8,14,5,'5 normal',NULL),(15,11,11,10,'5 minus engsel, normal','1761923072162_Struktur_Toko_(1).png'),(16,12,11,3,'service selesai','1761923200942_Struktur_Toko_(1).png'),(17,13,3,1,'normal','1761946629514_test.jpg'),(18,14,5,2,'normal','1761996402437_Thinkpad_L13_i3.png'),(20,15,1,2,'normal',NULL),(21,15,14,2,'1 normal, 1 minus engsel bodi karet getas',NULL),(22,15,15,1,'minus bodi gompal',NULL);
/*!40000 ALTER TABLE `barang_masuk_detail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `brand`
--

DROP TABLE IF EXISTS `brand`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brand` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `keterangan` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nama` (`nama`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `brand`
--

LOCK TABLES `brand` WRITE;
/*!40000 ALTER TABLE `brand` DISABLE KEYS */;
INSERT INTO `brand` VALUES (1,'ASUS',NULL,'2025-10-28 17:00:41'),(2,'ACER',NULL,'2025-10-28 17:00:41'),(3,'ADVAN',NULL,'2025-10-28 17:00:41'),(4,'DELL',NULL,'2025-10-28 17:00:41'),(5,'AXIOO',NULL,'2025-10-28 17:00:41'),(6,'LENOVO',NULL,'2025-10-28 17:00:41'),(7,'HP',NULL,'2025-10-28 17:00:41'),(8,'SAMSUNG',NULL,'2025-10-28 17:00:41'),(9,'ZYREX',NULL,'2025-10-28 17:00:41'),(10,'RANDOM',NULL,'2025-10-28 17:00:41');
/*!40000 ALTER TABLE `brand` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pembelian`
--

DROP TABLE IF EXISTS `pembelian`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pembelian` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer` varchar(100) DEFAULT NULL,
  `produk_id` int NOT NULL,
  `jumlah` int NOT NULL,
  `tanggal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `keterangan` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL COMMENT '1 sukses, 2 pending',
  PRIMARY KEY (`id`),
  KEY `produk_id` (`produk_id`),
  CONSTRAINT `pembelian_ibfk_1` FOREIGN KEY (`produk_id`) REFERENCES `produk` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pembelian`
--

LOCK TABLES `pembelian` WRITE;
/*!40000 ALTER TABLE `pembelian` DISABLE KEYS */;
INSERT INTO `pembelian` VALUES (6,'Ube',14,2,'2025-10-28 20:31:28','COD','1'),(7,'Elda',5,2,'2025-10-28 21:28:21','Shoppe','2'),(8,'tutung',15,1,'2025-10-28 21:28:32','Tokped','2'),(9,'Garry',8,1,'2025-10-29 11:44:19','Tiktok','2'),(10,'Dani',5,1,'2025-10-29 12:02:59','Cod','1'),(13,'test',15,1,'2025-10-29 18:44:54','SHOPEE','1'),(15,'tutung',1,1,'2025-11-01 11:25:09','shoppe','1'),(16,'Elda',1,1,'2025-11-04 13:42:14','Shoppe','1');
/*!40000 ALTER TABLE `pembelian` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `produk`
--

DROP TABLE IF EXISTS `produk`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produk` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(100) NOT NULL,
  `gambar` varchar(100) DEFAULT NULL,
  `keterangan` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `brand_id` int DEFAULT NULL,
  `posisi` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_produk_brand` (`brand_id`),
  KEY `idx_produk_brand_id` (`brand_id`),
  CONSTRAINT `fk_produk_brand` FOREIGN KEY (`brand_id`) REFERENCES `brand` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `produk`
--

LOCK TABLES `produk` WRITE;
/*!40000 ALTER TABLE `produk` DISABLE KEYS */;
INSERT INTO `produk` VALUES (1,'Acer Nitro','1761676180537_ACER_NITRO.jpg','ACER NITRO GAMING',2,'bewok 2 ajid 5'),(2,'Lenovo G400','1761680641323_LENOVO_G400.jpg','Lenovo G400 Celeron Ram 4/320GB',6,NULL),(3,'HP Compact','1761680708755_HP_COMPACT.jpg','HP Compact Core i5 Ram 4/320GB',7,NULL),(4,'Dell Latitude 7280','1761680988687_asus_x515jab_i3_g10.png','Dell Latitude',4,NULL),(5,'Advan Soulmate 1405','','Advan Soulmate Celeron N4000 Ram 4/128GB',3,NULL),(6,'Axioo MyBook 10','1761681661314_AXIOO.jpg','Axioo Mybook 10, Seri Baru, Super Slim, Mulus, Lengkap, Rose Gold',5,NULL),(7,'Zyrex Cruiser 20','1761681738316_ZYREX.jpg','Zyrex Cruiser 20 i5, Core i5-10210U, Ram 8/128 GB, #IPS, Lengkap,  Black',9,NULL),(8,'Samsung 305XCR','1761681835630_samsung.jpg','Samsung 305XCR, Core i5-10210U, Ram 8/256 Gb, 15,6 inch, #IPS, Lengkap, Silver',8,NULL),(9,'Sony Vaio VJS131','1761682077597_sony.jpg','Sony Vaio VJS131, Seri Limited Edition, Core i5-6200U, Ram 8/256Gb, Backlight, Super Slim, Lengkap, Silver',10,NULL),(10,'Produk J',NULL,NULL,NULL,NULL),(11,'Asus ROG','1761676079808_asus_rog_G553vd_i7_g7.png','Asus ROG G553VD Core i7 gen 7 Ram 8/1TB',1,NULL),(12,'Asus Tuff Gaming','1761676117048_asus_rog_G552jx_i7_g4.png',NULL,1,NULL),(13,'Produk SM','',NULL,NULL,NULL),(14,'Acer A315','1761499164800-695358536.png','Acer A315 Ryzen 3 Ram 4/1TB',2,NULL),(15,'Acer A314','1761499969518_acer_a314_celeron_merah.png','Acer A314 Celeron N4000 Ram 4/1TB',2,'alex 2 ajid 3 sisanya rak acer'),(16,'Dell latitude 5480, Core i5-8350U','1761847526157_DELL_5480.jpg','Dell latitude 5480, Core i5-8350U, Ram 8/256 GB, #Backlight, #Touchscreen, #IPS, Lengkap, Black',4,'Rak dell');
/*!40000 ALTER TABLE `produk` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipment`
--

DROP TABLE IF EXISTS `shipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier` varchar(150) NOT NULL,
  `tipe` enum('masuk','keluar') NOT NULL DEFAULT 'masuk',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipment`
--

LOCK TABLES `shipment` WRITE;
/*!40000 ALTER TABLE `shipment` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipment_item`
--

DROP TABLE IF EXISTS `shipment_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipment_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shipment_id` int NOT NULL,
  `produk_id` int NOT NULL,
  `jumlah` int NOT NULL,
  `kondisi` varchar(100) DEFAULT NULL,
  `keterangan` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `shipment_id` (`shipment_id`),
  KEY `produk_id` (`produk_id`),
  CONSTRAINT `shipment_item_ibfk_1` FOREIGN KEY (`shipment_id`) REFERENCES `shipment` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shipment_item_ibfk_2` FOREIGN KEY (`produk_id`) REFERENCES `produk` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipment_item`
--

LOCK TABLES `shipment_item` WRITE;
/*!40000 ALTER TABLE `shipment_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipment_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock`
--

DROP TABLE IF EXISTS `stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock` (
  `id` int NOT NULL AUTO_INCREMENT,
  `produk_id` int NOT NULL,
  `jumlah` int NOT NULL,
  `keterangan` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prod` (`produk_id`),
  UNIQUE KEY `uk_stock_produk` (`produk_id`),
  CONSTRAINT `stock_ibfk_1` FOREIGN KEY (`produk_id`) REFERENCES `produk` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock`
--

LOCK TABLES `stock` WRITE;
/*!40000 ALTER TABLE `stock` DISABLE KEYS */;
INSERT INTO `stock` VALUES (1,1,19,'bewok 2 ajid 5 sisanya rak'),(2,2,18,NULL),(3,3,20,NULL),(4,4,5,NULL),(5,5,10,NULL),(6,6,7,NULL),(7,7,14,NULL),(8,8,10,NULL),(9,9,10,NULL),(10,10,100,NULL),(17,11,112,NULL),(18,12,96,NULL),(19,13,50,NULL),(20,14,22,NULL),(21,15,32,NULL),(43,16,10,NULL);
/*!40000 ALTER TABLE `stock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'toko'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-16 14:15:49
