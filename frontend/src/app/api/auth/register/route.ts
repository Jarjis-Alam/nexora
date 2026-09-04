import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  college: z.string().optional(),
  branch: z.string().optional(),
  graduationYear: z.number().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(`register_${ip}`, { limit: 10, windowMs: 60 * 1000 });
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again in 1 minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const body = await request.json();
    if (body.graduationYear === "" || body.graduationYear === undefined || isNaN(Number(body.graduationYear))) {
      body.graduationYear = null;
    } else {
      body.graduationYear = Number(body.graduationYear);
    }

    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "Invalid registration input" },
        { status: 400 }
      );
    }

    const { name, email, password, college, branch, graduationYear } =
      validation.data;
    const cleanEmail = email.toLowerCase().trim();

    // Check if user exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = await db
      .insert(users)
      .values({ email: cleanEmail, passwordHash })
      .returning();

    // Create profile
    await db.insert(profiles).values({
      userId: newUser[0].id,
      name: name.trim(),
      college: college?.trim() || null,
      branch: branch?.trim() || null,
      graduationYear: graduationYear || null,
    });

    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Authentication is temporarily unavailable." },
      { status: 500 }
    );
  }
}
