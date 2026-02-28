require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO = process.env.MONGO_URI;

if (!MONGO) {
  console.error('MONGO_URI not set in environment.');
  process.exit(1);
}

const AdminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'users' });

const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

async function run() {
  const args = process.argv.slice(2);
  const name = args[0] || 'Super Admin';
  const email = (args[1] || 'admin@kk.local').toLowerCase();
  const rawPassword = args[2] || 'admin123';

  try {
    await mongoose.connect(MONGO);
    console.log('Connected to MongoDB');

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log('Admin already exists:', existing.email);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(rawPassword, 10);
    const admin = new Admin({ name, email, passwordHash: hashed, role: 'admin' });
    await admin.save();
    console.log('Admin created:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

run();
