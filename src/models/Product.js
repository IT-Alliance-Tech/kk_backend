import mongoose from 'mongoose';

const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  description: String,
  images: { type: [String], default: [] }, // Supabase public URLs - NOT required
  price: { type: Number, required: true },
  mrp: { type: Number, required: true },
  stock: { type: Number, default: 0, min: [0, 'Stock cannot be negative'] },
  hasSizes: { type: Boolean, default: false }, // Flag to indicate if product has multiple sizes
  attributes: {
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Auto-generate slug if not provided
productSchema.pre('validate', function(next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  }
  next();
});

export default mongoose.model('Product', productSchema);

