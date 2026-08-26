// src/utils/jwt.ts
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // production এ secret না থাকলে app start ই হওয়া উচিত না
    throw new Error("JWT_SECRET is not set in .env");
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

export type JwtPayload = {
  userId: string;
  role: "USER" | "ARTIST" | "ADMIN";
};

// Access token — কম মেয়াদী (15 min), প্রতিটা request এ এটা দিয়ে verify হবে

export function signAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1m" });
}

// Refresh token — বেশি মেয়াদী (7 days), শুধু নতুন access token নেওয়ার জন্য ব্যবহার হবে
export function signRefreshToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
