import argon2 from 'argon2';
import { pool } from '../config/db.js';

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('Seeding CSPC Lost & Found database...');

    // 1. Seed Categories if empty
    const [existingCats] = await conn.query('SELECT COUNT(*) as count FROM categories');
    if (existingCats[0].count === 0) {
      const categories = [
        'Electronics',
        'Valuables & Jewelry',
        'Bags & Wallets',
        'Documents & IDs',
        'Clothing & Accessories',
        'Books & Stationery',
        'Sports Equipment',
        'Keys & Keychains'
      ];
      for (const name of categories) {
        await conn.query('INSERT INTO categories (category_name) VALUES (?)', [name]);
      }
      console.log(`✓ Seeded ${categories.length} categories`);
    }

    // 2. Seed Locations if empty
    const [existingLocs] = await conn.query('SELECT COUNT(*) as count FROM locations');
    if (existingLocs[0].count === 0) {
      const locations = [
        'Main Library - Reading area',
        'Academic Building A - 2nd Floor',
        'Academic Building B - Hallway',
        'Gymnasium / Sports Complex',
        'University Cafeteria',
        'Main Entrance Security Gate',
        'Science Laboratory 3',
        'Student Center Lounge'
      ];
      for (const name of locations) {
        await conn.query('INSERT INTO locations (location_name) VALUES (?)', [name]);
      }
      console.log(`✓ Seeded ${locations.length} locations`);
    }

    // 3. Seed Users (Juan Reyes - Admin, Ana Cruz - Guard)
    const [existingUsers] = await conn.query('SELECT COUNT(*) as count FROM users');
    let adminId = 1;
    let guardId = 2;

    if (existingUsers[0].count === 0) {
      const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });
      
      const [adminResult] = await conn.query(
        `INSERT INTO users (full_name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, true)`,
        ['Juan Reyes', 'admin@cspc.edu.ph', passwordHash, 'admin']
      );
      adminId = adminResult.insertId;

      const [guardResult] = await conn.query(
        `INSERT INTO users (full_name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, true)`,
        ['Ana Cruz', 'guard@cspc.edu.ph', passwordHash, 'guard']
      );
      guardId = guardResult.insertId;

      console.log('✓ Seeded Juan Reyes (admin@cspc.edu.ph) & Ana Cruz (guard@cspc.edu.ph)');
    } else {
      const [u] = await conn.query('SELECT user_id, role FROM users LIMIT 2');
      if (u[0]) adminId = u[0].user_id;
      if (u[1]) guardId = u[1].user_id;
    }

    // 4. Seed initial items if empty
    const [existingItems] = await conn.query('SELECT COUNT(*) as count FROM items');
    if (existingItems[0].count === 0) {
      const sampleItems = [
        {
          title: 'Black wireless headphones in navy zip case',
          description: 'Found on a study table near the library entrance. Sony WH-1000XM4 in clean condition.',
          color: 'Black',
          brand: 'Sony',
          category_id: 1, // Electronics
          location_id: 1, // Main Library
          finder_name: 'Maria Santos - Student',
          storage_notes: 'Vault Locker 04 - Tag FI-0109',
          logged_by: adminId,
          image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80'
        },
        {
          title: 'Hydro Flask Blue Water Bottle 32oz',
          description: 'Cobalt blue metallic insulated flask with college stickers found on bench.',
          color: 'Blue',
          brand: 'Hydro Flask',
          category_id: 7, // Sports Equipment
          location_id: 4, // Gymnasium
          finder_name: 'Pedro Reyes - Student',
          storage_notes: 'Cabinet B Shelf 2 - Tag FI-0108',
          logged_by: guardId,
          image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80'
        },
        {
          title: 'Student ID Card - Juan Dela Cruz',
          description: 'BS Information Technology ID badge with lanyard found near cafeteria cash register.',
          color: 'White/Blue',
          brand: 'CSPC Registrar',
          category_id: 4, // Documents & IDs
          location_id: 5, // Cafeteria
          finder_name: 'Ana Cruz - Guard',
          storage_notes: 'Security Desk Envelope - Tag FI-0102',
          logged_by: guardId,
          image_url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80'
        },
        {
          title: 'Black Automatic Windproof Umbrella',
          description: 'Fiberglass ribs with wooden handle. Found near Building A stairs during heavy afternoon rain.',
          color: 'Black',
          brand: 'Generic',
          category_id: 5, // Clothing & Accessories
          location_id: 2, // Academic Building A
          finder_name: 'Juan Reyes - Admin',
          storage_notes: 'Umbrella Stand Security Room - Tag FI-0086',
          logged_by: adminId,
          image_url: 'https://images.unsplash.com/photo-1534253893894-10d024888e49?auto=format&fit=crop&w=600&q=80'
        }
      ];

      for (const item of sampleItems) {
        await conn.query(
          `INSERT INTO items (
            title, description, color, brand, category_id, location_id,
            found_at, finder_name, storage_notes, logged_by, item_status, image_url
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 'active', ?)`,
          [
            item.title,
            item.description,
            item.color,
            item.brand,
            item.category_id,
            item.location_id,
            item.finder_name,
            item.storage_notes,
            item.logged_by,
            item.image_url
          ]
        );
      }
      console.log(`✓ Seeded ${sampleItems.length} initial items`);
    }

    console.log('Seeding completed successfully!');
  } finally {
    conn.release();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
