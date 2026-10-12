import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;
  // Conexão já aberta por quem chamou (scripts e testes): reaproveita.
  if (mongoose.connection.readyState === 1) return mongoose;

  const MONGODB_URI = process.env.MONGODB_URI || "";
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI not defined in environment variables");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
