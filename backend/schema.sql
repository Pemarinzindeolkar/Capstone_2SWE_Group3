-- ============================================================
-- LABZO — PostgreSQL schema
-- Safe to run more than once:  psql labzo < schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS admin (
    admin_id      SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artisan (
    artisan_id        SERIAL PRIMARY KEY,
    name              VARCHAR(120) NOT NULL,
    email             VARCHAR(160) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    phone             VARCHAR(40),
    technique         VARCHAR(160),
    craft_description TEXT,
    status            VARCHAR(30) DEFAULT 'pending',
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buyer (
    buyer_id      SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status        VARCHAR(30) DEFAULT 'pending',
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product (
    product_id  SERIAL PRIMARY KEY,
    artisan_id  INTEGER NOT NULL REFERENCES artisan(artisan_id),
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    price       NUMERIC(10,2) NOT NULL,
    category    VARCHAR(80),
    image_url   VARCHAR(500),
    status      VARCHAR(30) DEFAULT 'available',
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_artisan  ON product (artisan_id);
CREATE INDEX IF NOT EXISTS idx_product_category ON product (category);

CREATE TABLE IF NOT EXISTS cart (
    cart_id    SERIAL PRIMARY KEY,
    buyer_id   INTEGER NOT NULL UNIQUE REFERENCES buyer(buyer_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_item (
    cart_item_id SERIAL PRIMARY KEY,
    cart_id      INTEGER NOT NULL REFERENCES cart(cart_id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    quantity     INTEGER NOT NULL DEFAULT 1,
    price        NUMERIC(10,2) NOT NULL,
    UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
    wishlist_id SERIAL PRIMARY KEY,
    buyer_id    INTEGER NOT NULL REFERENCES buyer(buyer_id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
    added_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (buyer_id, product_id)
);

CREATE TABLE IF NOT EXISTS "order" (
    order_id   SERIAL PRIMARY KEY,
    buyer_id   INTEGER NOT NULL REFERENCES buyer(buyer_id),
    artisan_id INTEGER NOT NULL REFERENCES artisan(artisan_id),
    total      NUMERIC(10,2) NOT NULL,
    status     VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item (
    order_item_id SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES product(product_id),
    quantity      INTEGER NOT NULL,
    price         NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS payment (
    proof_id    SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
    buyer_id    INTEGER NOT NULL REFERENCES buyer(buyer_id),
    proof_url   VARCHAR(500),
    status      VARCHAR(30) DEFAULT 'pending',
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Additions (run automatically on server start by migrate.js)
-- ============================================================

-- Artisan profile extras
ALTER TABLE artisan ADD COLUMN IF NOT EXISTS photo_url     VARCHAR(500);
ALTER TABLE artisan ADD COLUMN IF NOT EXISTS workshop_name VARCHAR(160);
ALTER TABLE artisan ADD COLUMN IF NOT EXISTS location      VARCHAR(160);

-- Buyer profile photo
ALTER TABLE buyer ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);

-- Workshop / showcase gallery shown on the artisan's public profile
CREATE TABLE IF NOT EXISTS artisan_image (
    artisan_image_id SERIAL PRIMARY KEY,
    artisan_id       INTEGER NOT NULL REFERENCES artisan(artisan_id) ON DELETE CASCADE,
    image_url        VARCHAR(500) NOT NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);

-- Uploaded image files, stored in the database so they survive Render redeploys
-- (Render's disk is wiped on every deploy). image_id is a random hex string so
-- URLs can't be guessed (payment proofs live here too).
CREATE TABLE IF NOT EXISTS image (
    image_id      VARCHAR(40) PRIMARY KEY,
    uploader_role VARCHAR(20),
    uploader_id   INTEGER,
    mimetype      VARCHAR(80) NOT NULL,
    data          BYTEA NOT NULL,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Stock count per product. Reduced when a payment is confirmed (by the artist
-- or an admin). Existing textiles start at 4 (e.g. pairs of heels), everything
-- else at 1. The backfill only runs once, when the column is first created.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product' AND column_name = 'stock'
    ) THEN
        ALTER TABLE product ADD COLUMN stock INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0);
        UPDATE product SET stock = 4 WHERE category = 'textiles';
    END IF;
END $$;
