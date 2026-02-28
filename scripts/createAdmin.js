// kk-backend/scripts/createAdmin.js
// Usage: node scripts/createAdmin.js "Admin Name" "admin@example.com" "password123"
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');

const MONGO = process.env.MONGO_URI;

if (!MONGO) {
  console.error('MONGO_URI not set in environment.');
  process.exit(1);
}

async function run() {
  const args = process.argv.slice(2);
  const name = args[0] || 'Super Admin';
  const email = (args[1] || 'admin@kk.local').toLowerCase();
  const password = args[2] || 'admin123';

  try {
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log('Admin already exists:', existing.email);
      process.exit(0);
    }

    const admin = new Admin({ name, email, password, role: 'admin' });
    await admin.save();
    console.log('Admin created:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
